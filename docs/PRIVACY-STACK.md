# Tony Stark — The Privacy Stack

**Current guarantees, planned privacy layers, and residual leaks.**

Privacy is not one feature. A user can be identified through **five independent channels**, and you are only as private as the leakiest one. This doc separates what the active local server does today from payment architecture and future hardening.

The product design goal is that no single party can join two channels together. The active local build has not completed every layer of that design.

---

## 1. The five channels

| # | Traceability vector | What closes it | Hides | Residual leak (stated honestly) |
| --- | --- | --- | --- | --- |
| 1 | **Network** — your IP reaches the site | **Tor** via the required SOCKS connector; no direct fallback — ✅ **verified end-to-end** (§2.6) | host IP + location from the website | no fresh-circuit guarantee; a global adversary can correlate Tor entry and exit; some sites block Tor |
| 2 | **Fetch state** — cookies, storage, persistence, logins | stateless HTTP fetches with no browser, cookie jar, or login support | app-level browsing state that could join tasks | the site still sees the fetcher's HTTP/TLS fingerprint; JavaScript-rendered pages are unsupported |
| 3 | **On-chain** — address, balance, amounts, transaction graph | **STRK20 shielded pool** (ZK-STARK notes, Poseidon/ECDH): `transfer` = fully private; `withdraw` = **sender-anonymous** *(+ shadow accounts once wallet-supported — roadmap)* | balance, amounts, who-paid-whom, spend history | deposit/withdraw **endpoints** are visible events — see channel 4 |
| 4 | **The on-ramp** — putting STRK *into* the pool is a public deposit | the **shared canonical pool's anonymity set**, fund from a fresh account, **time-separate** deposit from spend | the link between "you deposited" and "you spent" | **privacy begins at the pool.** Depositing from a KYC'd exchange is traceable *up to* the pool boundary. Strength = crowd size |
| 5 | **The operators** — local host, RPC, prover, discovery, paymaster | local-only self-hosting limits who operates the MCP endpoint | avoids a public Tony Strk service seeing browse requests | OHTTP relay/gateway is not configured; payment services can see connection metadata; an enabled payment process holds its configured key |

---

## 2. The toolkit (concrete technologies)

| Tool | Job in the stack |
| --- | --- |
| **Tor** | anonymous network egress for the local HTTP fetcher (channel 1) |
| **Stateless HTTP fetcher** | validates public HTTP(S) destinations and redirects, routes through Tor, bounds time/body size, and retains no browser state (channels 1+2) |
| **STRK20 privacy pool + `@starkware-libs/starknet-privacy-sdk`** | shielded balances and confidential transfers — the on-chain privacy engine (channel 3) |
| **STRK20 shadow accounts** (`strk20ShadowAccountCommitment`) — ⚠️ **roadmap, not MVP** | **a fresh, unlinkable on-chain identity per task/site**, mutually unlinkable and unlinkable to the user's real account; the *partial commitment* would let us credit a user's balance **without learning which shadow account or linking them** (channels 3+5). **Status:** in the spec and starknet.js, but **absent from the shipping Ready wallet v5.33.8** — so the MVP must not depend on it (see `SPIKE-RESULTS.md` §9) |
| **Local SDK wallet (experimental)** | used only when `PAY_ENABLED=true` and key configuration is supplied; the current server process holds that key, so this is self-hosted testnet tooling rather than a non-custodial production wallet |
| **AVNU `sponsored_private` paymaster** | gasless txs where the **fee is paid from inside the pool** — so paying gas doesn't deanonymize the payer (channels 3+5) |
| **OHTTP (`ohttp-ts`, RFC 9458)** | available in the underlying privacy SDK, but **not configured by this app**; operator blinding requires a real relay/gateway split (channel 5) |
| **Viewing keys** | can decrypt private history; in the current opt-in server path, key material or its derivation input is local process configuration |
| **Prepaid balance + off-chain metering + batched settlement** | roadmap only; no timing-decoupled metering service exists in the active server |
| **Ready session keys + SNIP-9 outside execution** | roadmap only; not part of the active server |

---

## 2.5. The precise claim for channel 2

The active implementation is not a browser. It performs one HTTP request chain, reduces HTML to readable text, and discards the response after returning it. There is no cookie jar, cache, local storage, JavaScript runtime, or login flow.

That removes persistent browser state, but it does not provide browser-fingerprint randomization or uniformity. The destination can still observe the HTTP/TLS behavior of the Node fetcher, and multiple requests may use the same Tor circuit. The earlier Obscura browser-worker experiment is not part of the current architecture.

---

## 2.6. Channel 1, verified end-to-end

The active local stack was measured through the MCP endpoint, using the Tor Project's API as the oracle:

```bash
TOR_SOCKS_PROXY=socks5://127.0.0.1:9050 npm run start:server
# in another terminal
npm run verify:mcp
  → {"IsTor":true,"IP":"<a Tor exit>"}
```

The destination sees a Tor exit node rather than the host IP. This verifies egress routing, not per-request circuit rotation or browser-fingerprint protection.

---

## 3. The current operator boundary

The current answer is self-hosting, not operator-blinding infrastructure:

1. **The MCP endpoint is loopback-only.** It binds to `127.0.0.1`, so there is no public Tony Strk operator in the request path.
2. **Browsing is stateless at the application layer.** The server has no cookie jar, browser profile, user database, or request log. The process and host can still observe a request while handling it.
3. **Payments are off by default.** `pay` is registered only with `PAY_ENABLED=true` and complete wallet configuration. When enabled, this server process holds the supplied spending key; it is not the future client-side-wallet design.
4. **OHTTP is not configured.** The repository has no deployed relay/gateway split, so it makes no current claim that RPC, prover, discovery, or paymaster operators cannot link connection metadata to requests.

A future hosted service would need separate trust domains and an independently operated OHTTP relay/gateway before making stronger operator-resistance claims.

---

## 4. What "untraceable" honestly means

No honest engineer promises literal, mathematical untraceability. The defensible claim for the active browsing path is narrower:

> **A public website sees Tor egress rather than the MCP host's IP, and the application retains no browsing session between requests.**

STRK20 can provide on-chain unlinkability for shielded transfers, but the active local server does not yet combine that with worker isolation, timing-decoupled settlement, or configured operator blinding.

**Three residual risks we name rather than hide:**
1. **The on-ramp (channel 4).** Privacy starts at the pool. Fund it privately, or accept that "you → pool" is visible while "pool → your spending" is not.
2. **Anonymity-set size.** A pool with few users is weak privacy regardless of the cryptography. Always the shared canonical pool — **never deploy our own** (a private pool of one is transparent in practice).
3. **Traffic correlation.** The current server does not force a fresh Tor circuit or batch payments, so timing and repeated egress can still link activity.

---

## 5. One request, end to end

What one active browse request does:

1. A local agent calls `browse(url)` on `127.0.0.1:8787/mcp`.
2. The server accepts only public HTTP(S) destinations, resolves the hostname, and repeats the check for redirects.
3. The HTTP request uses the configured Tor SOCKS connector. Missing or failed Tor causes an error; there is no direct-network fallback.
4. The server returns at most 1 MiB and reduces HTML to readable text unless raw output was requested.
5. The request ends without retaining cookies, a browser profile, or an MCP session.

If experimental `pay` is enabled, it runs in the same local process with the configured key. It should not be described as an isolated, client-side, OHTTP-protected production payment flow.

---

## 6. Rules we don't break

1. Shared canonical pool only — never our own pool.
2. Payment stays disabled unless the local operator explicitly enables and configures it.
3. Do not claim browsing/payment worker isolation until separate workers exist.
4. Privacy claims cover **shielded STRK20 on Starknet only** — transparent rails (x402/Base USDC) are labeled transparent. See `THREAT-MODEL.md` §4.5.
5. No logged-in browsing — authenticating *is* deanonymizing.
6. Never present devnet as mainnet.
7. Do not claim fresh Tor circuits, browser fingerprint protection, or OHTTP operator blinding in the active build.

See also: `PLAN.md` (product + build plan) · `THREAT-MODEL.md` (adversaries, precise claims, judge Q&A) · `READING-LIST.md` (background).
