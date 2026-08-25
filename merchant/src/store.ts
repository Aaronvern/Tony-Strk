import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * What the merchant has to remember.
 *
 * Only two things, and both are security-critical rather than convenience.
 *
 * A receipt must be spendable once. `PaywallPaid` is a public event — that is
 * what makes it verifiable — so anyone watching the pool can read a valid
 * transaction hash off the chain seconds after it lands. Without a spent set,
 * every article unlocks for whoever is watching, for free. Holding this in
 * process memory means a restart re-opens every receipt ever paid.
 *
 * A grant must outlive a restart too, or a reader who has paid gets asked to
 * pay again through no fault of their own.
 */
export interface Grant {
  slug: string;
  expires: number;
}

export interface ReceiptStore {
  isSpent(key: string): Promise<boolean>;
  consumeReceipt(key: string, at: number): Promise<boolean>;
  saveGrant(token: string, grant: Grant): Promise<void>;
  readGrant(token: string): Promise<Grant | undefined>;
}

/** For tests and throwaway runs. Everything is forgotten on exit. */
export function createMemoryStore(): ReceiptStore {
  const spent = new Map<string, number>();
  const grants = new Map<string, Grant>();
  return {
    isSpent: async (key) => spent.has(key),
    consumeReceipt: async (key, at) => {
      if (spent.has(key)) return false;
      spent.set(key, at);
      return true;
    },
    saveGrant: async (token, grant) => void grants.set(token, grant),
    readGrant: async (token) => grants.get(token),
  };
}

interface Snapshot {
  spent: Record<string, number>;
  grants: Record<string, Grant>;
}

/**
 * A single JSON file, rewritten atomically through a rename.
 *
 * Writes are serialised behind one promise chain. Node is single-threaded, but
 * two overlapping `writeFile` calls can still interleave their completions and
 * lose whichever finished first — and the record that gets lost is a spent
 * receipt, which turns straight into free access.
 */
export async function createFileStore(path: string): Promise<ReceiptStore> {
  let snapshot: Snapshot = { spent: {}, grants: {} };
  try {
    snapshot = { spent: {}, grants: {}, ...JSON.parse(await readFile(path, "utf8")) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(dirname(path), { recursive: true });
  }

  let queue: Promise<void> = Promise.resolve();
  const flush = () => {
    queue = queue.then(async () => {
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(snapshot));
      await rename(temporary, path);
    });
    return queue;
  };

  // ponytail: single-process atomicity via one global mutex; upgrade to per-receipt locks or a database unique constraint before multi-instance deployment.
  return {
    isSpent: async (key) => key in snapshot.spent,
    consumeReceipt: async (key, at) => {
      if (key in snapshot.spent) return false;
      snapshot.spent[key] = at;
      await flush();
      return true;
    },
    saveGrant: async (token, grant) => {
      // Drop grants that have already expired, so the file cannot grow without
      // bound on a long-running merchant.
      const now = Date.now();
      for (const [candidate, existing] of Object.entries(snapshot.grants)) {
        if (existing.expires <= now) delete snapshot.grants[candidate];
      }
      snapshot.grants[token] = grant;
      await flush();
    },
    readGrant: async (token) => snapshot.grants[token],
  };
}
