import express from "express";
import type { Request, Response } from "express";

import { CATALOG, findArticle, resourceHash } from "./catalog.ts";
import type { Article } from "./catalog.ts";
import { verifyReceipt } from "./receipt.ts";
import { createMemoryStore, type ReceiptStore } from "./store.ts";
import type { ChainReceipt } from "./receipt.ts";

export interface MerchantDeps {
  /** Where the merchant wants to be paid. */
  payTo: string;
  /** The helper contract whose receipts this merchant trusts. */
  anonymizer: string;
  /** The token prices are quoted in. */
  asset: string;
  /** Chain label for the 402 body, e.g. starknet-sepolia. */
  network: string;
  /** Read a transaction receipt from the chain. Injected so tests need no RPC. */
  fetchReceipt: (txHash: string) => Promise<ChainReceipt>;
  /** Where a paid receipt can be inspected by a human. */
  explorerBase: string;
  /** Overridable so a test does not have to wait out a real expiry. */
  accessTtlMs?: number;
  now?: () => number;
  /**
   * Where spent receipts and access grants live. Defaults to memory, which
   * forgets every spent receipt on restart — fine for a test, not for a
   * merchant anyone can reach.
   */
  store?: ReceiptStore;
  /**
   * Express `trust proxy` setting, when this merchant runs behind one.
   *
   * TLS terminates at the proxy, so `req.protocol` is `http` on the inside and
   * the 402 would advertise an `http://` resource for a request the client made
   * over `https://`. A payer that checks the terms match what it asked for then
   * refuses — correctly, since those are different origins and ignoring the
   * difference would wave through a downgrade.
   *
   * Left off by default: `X-Forwarded-Proto` is a header any client can send,
   * so it is only trustworthy when something in front is known to overwrite it.
   */
  trustProxy?: boolean | string | number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Transaction hashes are field elements, same as everything else on Starknet. */
const isTxHash = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value.trim());

/**
 * A paywalled site.
 *
 * The whole protocol is: answer 402 with terms, accept a transaction hash,
 * check the chain, hand back an access token. The merchant never sees an
 * identity at any step, and there is nothing in its storage that could later
 * be turned into one.
 */
export function createMerchantApp(deps: MerchantDeps) {
  const now = deps.now ?? Date.now;
  const ttl = deps.accessTtlMs ?? DEFAULT_TTL_MS;

  /**
   * Redeemed receipts. A transaction hash unlocks a resource exactly once and
   * is then spent. This is not about a buyer sharing their hash: `PaywallPaid`
   * is a public event — that is what makes it verifiable — so anyone watching
   * the pool can read a valid hash off the chain seconds after it lands.
   * Without this, every article unlocks for whoever is watching. What the buyer
   * gets instead is a bearer token, which is theirs to keep and theirs to leak,
   * and which nobody can lift off the chain.
   */
  const store = deps.store ?? createMemoryStore();

  const app = express();
  app.disable("x-powered-by");
  if (deps.trustProxy !== undefined) app.set("trust proxy", deps.trustProxy);

  const terms = (article: Article, req: Request) => ({
    scheme: "strk20-anonymizer",
    network: deps.network,
    maxAmountRequired: article.price.toString(),
    resource: `${req.protocol}://${req.get("host")}/article/${article.slug}`,
    description: article.title,
    mimeType: "text/html",
    payTo: deps.payTo,
    maxTimeoutSeconds: 600,
    asset: deps.asset,
    extra: {
      anonymizer: deps.anonymizer,
      resourceHash: resourceHash(article.slug),
      // Named so nobody mistakes this for x402's `exact` scheme, which needs a
      // signed OutsideExecution from an identified payer and therefore cannot
      // be anonymous. Same envelope, different settlement.
      settlement: "Call privacy_invoke on `anonymizer` through the STRK20 pool, " +
        "then retry with X-Payment: <transaction hash>.",
    },
  });

  app.get("/", (req, res) => {
    res.type("html").send(page(
      "Ledger &amp; Lantern",
      `<p class="lede">Three pieces behind a paywall that takes anonymous payment.
       No account, no card, no email. Pay and read.</p>
       <ul class="index">${CATALOG.map((a) => `
         <li>
           <a href="/article/${a.slug}">${escape(a.title)}</a>
           <span class="price">${fmtToken(a.price)} STRK</span>
           <p>${escape(a.blurb)}</p>
         </li>`).join("")}</ul>`,
    ));
  });

  app.get("/article/:slug", async (req: Request, res: Response) => {
    const article = findArticle(req.params.slug);
    if (!article) {
      res.status(404).type("html").send(page("Not found", "<p>No such article.</p>"));
      return;
    }

    // An access token from an earlier redemption. Checked first so a reader
    // who already paid never sees a second 402.
    const token = header(req, "x-access-token");
    if (token) {
      const grant = await store.readGrant(token);
      if (grant && grant.slug === article.slug && grant.expires > now()) {
        res.type("html").send(render(article));
        return;
      }
    }

    const payment = header(req, "x-payment");
    if (!payment) {
      res.status(402).json({
        x402Version: 1,
        error: "payment required",
        accepts: [terms(article, req)],
      });
      return;
    }

    if (!isTxHash(payment)) {
      res.status(400).json({ error: "X-Payment must be a Starknet transaction hash" });
      return;
    }

    const txHash = payment.trim();
    const key = `${BigInt(txHash).toString(16)}:${article.slug}`;
    if (await store.isSpent(key)) {
      res.status(409).json({
        error: "that receipt has already been redeemed",
        hint: "Keep the access token from the first redemption, or pay again.",
      });
      return;
    }

    let receipt: ChainReceipt;
    try {
      receipt = await deps.fetchReceipt(txHash);
    } catch (error) {
      // Not found is the common case: the payer retried before the
      // transaction was in a block. That is worth distinguishing from a
      // rejection, because the fix is to wait rather than to pay again.
      res.status(402).json({
        x402Version: 1,
        error: "could not read that transaction yet",
        detail: String((error as Error)?.message ?? error),
        accepts: [terms(article, req)],
      });
      return;
    }

    const verdict = verifyReceipt(receipt, {
      anonymizer: deps.anonymizer,
      merchant: deps.payTo,
      resourceHash: resourceHash(article.slug),
      asset: deps.asset,
      minPrice: article.price,
    }, txHash);

    if (!verdict.ok) {
      res.status(402).json({
        x402Version: 1,
        error: verdict.reason,
        accepts: [terms(article, req)],
      });
      return;
    }

    if (!(await store.consumeReceipt(key, now()))) {
      res.status(409).json({
        error: "that receipt has already been redeemed",
        hint: "Keep the access token from the first redemption, or pay again.",
      });
      return;
    }
    const granted = crypto.randomUUID();
    await store.saveGrant(granted, { slug: article.slug, expires: now() + ttl });

    res.setHeader("X-Access-Token", granted);
    res.setHeader("X-Payment-Verified", `${verdict.price} ${deps.asset}`);
    res.type("html").send(render(article, `${deps.explorerBase}/tx/${txHash}`));
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, payTo: deps.payTo, anonymizer: deps.anonymizer, articles: CATALOG.length });
  });

  return app;
}

/** Express lowercases header names, but a raw array can still arrive. */
function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function fmtToken(wei: bigint) {
  const digits = wei.toString().padStart(19, "0");
  const frac = digits.slice(-18).replace(/0+$/, "");
  return `${digits.slice(0, -18)}${frac ? `.${frac}` : ""}`;
}

const render = (article: Article, receiptUrl?: string) =>
  page(
    escape(article.title),
    `<p class="paid">Paid${receiptUrl ? ` · <a href="${receiptUrl}">receipt</a>` : ""}</p>
     ${article.body.split("\n\n").map((p) => `<p>${escape(p)}</p>`).join("")}
     <p class="back"><a href="/">← Ledger &amp; Lantern</a></p>`,
  );

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
 body{max-width:38rem;margin:0 auto;padding:3rem 1.25rem 6rem;font:16px/1.6 Georgia,serif;color:#1b1b1a;background:#faf8f4}
 h1{font-size:1.9rem;line-height:1.15;margin:0 0 1.5rem}
 a{color:#7a4a1e}
 .lede{font-size:1.05rem}
 .index{list-style:none;padding:0}
 .index li{padding:1.1rem 0;border-top:1px solid #e2dcd0}
 .index a{font-weight:700;text-decoration:none}
 .index p{margin:.35rem 0 0;color:#5c574e;font-size:.92rem}
 .price{float:right;color:#5c574e;font-size:.85rem}
 .paid,.back{font:600 .72rem/1 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}
 .paid{color:#2f6b3f}
 .back{margin-top:3rem}
</style></head>
<body><h1>${title}</h1>${body}</body></html>`;
