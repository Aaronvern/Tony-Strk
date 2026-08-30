import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const index = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const serverDirectory = fileURLToPath(new URL("..", import.meta.url));

test("an unsupported NETWORK value fails MCP startup", () => {
  const result = spawnSync(process.execPath, [index], {
    cwd: serverDirectory,
    env: { ...process.env, NETWORK: "invalid-network", PORT: "0" },
    encoding: "utf8",
    timeout: 3_000,
  });

  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /NETWORK.*sepolia.*mainnet/i,
  );
});
