import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileStore, createMemoryStore } from "../src/store.ts";

async function scratch() {
  const dir = await mkdtemp(join(tmpdir(), "merchant-store-"));
  return { path: join(dir, "nested", "state.json"), clean: () => rm(dir, { recursive: true, force: true }) };
}

test("the memory store round-trips receipts and grants", async () => {
  const store = createMemoryStore();
  assert.equal(await store.isSpent("a"), false);
  assert.equal(await store.consumeReceipt("a", 1), true);
  assert.equal(await store.isSpent("a"), true);
  assert.equal(await store.consumeReceipt("a", 2), false);

  await store.saveGrant("tok", { slug: "x", expires: 99 });
  assert.deepEqual(await store.readGrant("tok"), { slug: "x", expires: 99 });
  assert.equal(await store.readGrant("nope"), undefined);
});

test("concurrent receipt consumption only succeeds once", async () => {
  const store = createMemoryStore();
  const results = await Promise.all([
    store.consumeReceipt("0xabc:slug", 1),
    store.consumeReceipt("0xabc:slug", 2),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
});

test("a spent receipt survives a restart", async (t) => {
  // The one that matters. PaywallPaid is public, so a forgotten spent set
  // hands every article to whoever is watching the pool.
  const { path, clean } = await scratch();
  t.after(clean);

  const first = await createFileStore(path);
  assert.equal(await first.consumeReceipt("0xabc:agent-privacy", 1000), true);

  const afterRestart = await createFileStore(path);
  assert.equal(await afterRestart.isSpent("0xabc:agent-privacy"), true);
  assert.equal(await afterRestart.isSpent("0xdef:agent-privacy"), false);
});

test("a paid reader's grant survives a restart", async (t) => {
  const { path, clean } = await scratch();
  t.after(clean);

  const first = await createFileStore(path);
  await first.saveGrant("tok", { slug: "agent-privacy", expires: Date.now() + 60_000 });

  const afterRestart = await createFileStore(path);
  assert.equal((await afterRestart.readGrant("tok"))?.slug, "agent-privacy");
});

test("a missing file is a fresh merchant, not a crash", async (t) => {
  const { path, clean } = await scratch();
  t.after(clean);
  const store = await createFileStore(path);
  assert.equal(await store.isSpent("anything"), false);
});

test("overlapping writes do not lose a spent receipt", async (t) => {
  // Two writeFile calls in flight can finish in either order, and the record
  // that gets dropped turns straight into free access. Writes are queued.
  const { path, clean } = await scratch();
  t.after(clean);

  const store = await createFileStore(path);
  const keys = Array.from({ length: 40 }, (_, i) => `0x${i}:slug`);
  await Promise.all(keys.map((key, i) => store.consumeReceipt(key, i)));

  const onDisk = JSON.parse(await readFile(path, "utf8"));
  assert.equal(Object.keys(onDisk.spent).length, 40);

  const afterRestart = await createFileStore(path);
  for (const key of keys) {
    assert.equal(await afterRestart.isSpent(key), true, `lost ${key}`);
  }
});

test("expired grants are pruned so the file cannot grow without bound", async (t) => {
  const { path, clean } = await scratch();
  t.after(clean);

  const store = await createFileStore(path);
  await store.saveGrant("stale", { slug: "a", expires: Date.now() - 1 });
  await store.saveGrant("live", { slug: "b", expires: Date.now() + 60_000 });

  assert.equal(await store.readGrant("stale"), undefined);
  assert.equal((await store.readGrant("live"))?.slug, "b");
});

test("a spent receipt is never pruned, however old", async (t) => {
  // Grants expire by design; a spent receipt must not, or the article reopens
  // to anyone still holding that public hash.
  const { path, clean } = await scratch();
  t.after(clean);

  const store = await createFileStore(path);
  assert.equal(await store.consumeReceipt("0xold:slug", 0), true);
  await store.saveGrant("a", { slug: "x", expires: Date.now() - 1 });
  await store.saveGrant("b", { slug: "y", expires: Date.now() + 60_000 });

  assert.equal(await store.isSpent("0xold:slug"), true);
});
