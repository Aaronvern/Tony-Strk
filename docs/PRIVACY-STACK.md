# Tony Stark — The Privacy Stack

**The definitive answer to: "how is it actually private, and how can nothing trace back to the user?"**

Privacy is not one feature. A user can be identified through **five independent channels**, and you are only as private as the leakiest one. This doc names each channel, the exact technology that closes it, and — critically — what still leaks. Nothing here is aspirational: every mechanism was verified against the `starkware-libs/starknet-privacy` source and the linked standards.

The governing rule: **no single party may be able to join two channels together.** Not the website, not the chain, not the payee, not a service operator, and not us.

---

## 1. The five channels

| # | Traceability vector | What closes it | Hides | Residual leak (stated honestly) |
| --- | --- | --- | --- | --- |
| 1 | **Network** — your IP and TLS fingerprint reach the site | **Tor** via `--proxy socks5://`, HTTPS-only, **fresh circuit per task** — ✅ **verified end-to-end** (§2.6) | your IP + location from the website | a *global* adversary watching Tor entry **and** exit; some sites block Tor exits |
| 2 | **Browser** — cookies, storage, persistence, logins | **Obscura `--stealth`** (self-consistent fingerprint, no automation tells), **fresh context per task**, zero persistent storage, **no logins** | any state that would join two of your tasks together | fingerprint-level uniformity is **not** claimed — see §2.5 |
| 3 | **On-chain** — address, balance, amounts, transaction graph | **STRK20 shielded pool** (ZK-STARK notes, Poseidon/ECDH): `transfer` = fully private; `withdraw` = **sender-anonymous** *(+ shadow accounts once wallet-supported — roadmap)* | balance, amounts, who-paid-whom, spend history | deposit/withdraw **endpoints** are visible events — see channel 4 |
| 4 | **The on-ramp** — putting STRK *into* the pool is a public deposit | the **shared canonical pool's anonymity set**, fund from a fresh account, **time-separate** deposit from spend | the link between "you deposited" and "you spent" | **privacy begins at the pool.** Depositing from a KYC'd exchange is traceable *up to* the pool boundary. Strength = crowd size |
| 5 | **The operators** — RPC, prover, discovery, paymaster, **and us** | **OHTTP** (RFC 9458), **`sponsored_private` paymaster**, **client-side keys + proving**, **worker isolation**, **self-hostable** | your IP↔query at every service; stops *us* profiling you | you must trust the running code — hence open source + self-host |

---

## 2. The toolkit (concrete technologies)

| Tool | Job in the stack |
| --- | --- |
| **Tor** | anonymous network egress for the browser worker (channel 1) |
| **Obscura v0.2.0** (Rust headless engine, Apache-2.0) | disposable hardened browser: `--stealth` gives a **self-consistent** fingerprint (no automation tells) plus TLS impersonation and tracker blocking *when built with the `stealth` feature*; native DOM→Markdown for the agent; `--proxy socks5://` for Tor egress; SSRF-blocked by default. **30 MB / instant startup** — which is what makes a genuinely fresh browser *per task* affordable instead of aspirational (channels 1+2) |
| **STRK20 privacy pool + `@starkware-libs/starknet-privacy-sdk`** | shielded balances and confidential transfers — the on-chain privacy engine (channel 3) |
| **STRK20 shadow accounts** (`strk20ShadowAccountCommitment`) — ⚠️ **roadmap, not MVP** | **a fresh, unlinkable on-chain identity per task/site**, mutually unlinkable and unlinkable to the user's real account; the *partial commitment* would let us credit a user's balance **without learning which shadow account or linking them** (channels 3+5). **Status:** in the spec and starknet.js, but **absent from the shipping Ready wallet v5.33.8** — so the MVP must not depend on it (see `SPIKE-RESULTS.md` §9) |
| **Ready/Argent X or Xverse — Privacy Wallet API** | holds the spending key **and generates the ZK proof client-side**; our server never touches keys or the viewing key (channel 5) |
| **AVNU `sponsored_private` paymaster** | gasless txs where the **fee is paid from inside the pool** — so paying gas doesn't deanonymize the payer (channels 3+5) |
| **OHTTP (`ohttp-ts`, RFC 9458)** | HPKE-encapsulated requests through a relay/gateway split — the prover, discovery service, and our own egress never see IP↔query (channel 5) |
| **Viewing keys** | the user (alone) can decrypt and reveal their own history — private by default, provable on demand |
| **Prepaid balance + off-chain metering + batched settlement** | **timing decoupling**, so nobody can join "browsed X at 12:00:00" to "paid at 12:00:02" (channels 3+6) |
| **Ready session keys + SNIP-9 outside execution** | agent spends autonomously within user-set caps/allowlists — without us custodying funds |

---

## 2.5. Randomization vs. uniformity — the precise claim for channel 2

Two different goals get conflated here, and stating ours precisely is what keeps the claim defensible:

Three different goals get conflated here. Stating ours precisely is what keeps the claim defensible.

| Approach | Goal | Method |
| --- | --- | --- |
| **Anti-detect** (Obscura `--stealth`) | *"don't look automated"* | a **self-consistent** fingerprint with no automation tells |
| **Anti-tracking** (per-session randomization) | *"don't link my sessions"* | **randomize** identifying surfaces per session |
| **Anonymity** (Tor Browser) | *"look identical to everyone else"* | **uniformity** — every user presents the same fingerprint |

⚠️ **Corrected after testing the binary.** An earlier draft of this doc credited Obscura with *per-session fingerprint randomization*. Its own `--help` says otherwise: *"consistent browser fingerprint, and with the `stealth` build feature, TLS impersonation plus tracker blocking."* That is the **first** row — anti-detection — and the tracker-blocking half is conditional on a build feature that may not be compiled into the release binary.

**What that means for our claim.** Obscura keeps us from *looking automated*, which is what lets us reach sites at all. It does **not** by itself guarantee that two of our sessions are unlinkable by fingerprint. In this stack, the unlinkability we can actually defend comes from:

- a **fresh browser context per task**, destroyed after — no cookies, storage, or cache survive;
- a **fresh Tor circuit per task**, so the network identity differs every time;
- **no logins, ever** — authenticating is deanonymizing.

**So the honest claim for channel 2 is:** *no device identity of yours reaches the site, and nothing persists between tasks to join them up.* We do **not** claim fingerprint-level uniformity, and we do not claim a site is unable to fingerprint the browser it is talking to.

**Roadmap if we want the stronger property:** compile Obscura with the `stealth` feature (TLS impersonation + tracker blocking), and add per-context fingerprint variation ourselves over CDP.

---

## 2.6. Channel 1, verified end-to-end

Not a claim — a measurement. The full production stack (Obscura `--stealth` → SOCKS5 → Tor), with the Tor Project's own API as the oracle:

```bash
# direct
obscura fetch https://check.torproject.org/api/ip --dump text
  → {"IsTor":false,"IP":"<our real egress>"}

# through Tor
obscura --stealth --proxy socks5://127.0.0.1:9050 \
        fetch https://check.torproject.org/api/ip --dump text
  → {"IsTor":true,"IP":"192.42.116.20"}
```

The destination sees a Tor exit node, not us — confirmed by the destination itself. Reproduce it any time; this is the cheapest honest demo of channel 1 we have, and it belongs in the video.

---

## 3. Why the operator (us) can't deanonymize you

This is the objection that kills most privacy products: *"you moved all the trust to your own server."* Four structural answers — not promises:

1. **We never hold keys and never prove.** The user's wallet (Ready/Xverse) manages the viewing key and generates proofs. We build *unsigned* intents; the wallet signs (SNIP-12). We cannot spend your funds and cannot decrypt your notes.
2. **Worker isolation — no join key.** The **browsing** worker and the **payment** worker are separate trust domains with **no shared identifier**. Even a fully compromised operator holds two unlinked halves, never one profile.
3. **OHTTP on our own calls too.** We apply the protocol's own operator-blinding to our infrastructure, so our services don't see client IP↔request.
4. **Ephemeral + no-log + self-hostable.** Sessions are destroyed after each task; the ledger keys on a *funded session credential*, never an identity. A maximalist self-hosts and trusts no one; the hosted tier's trust boundary is documented, not hidden.

---

## 4. What "untraceable" honestly means

No honest engineer promises literal, mathematical untraceability. The defensible claim:

> **No single party — the website, the blockchain, the payee, any service operator, or us — can attribute this activity to the user; and the isolation + timing decoupling prevent them from combining forces to do so.**

Technically: *k-anonymity within the shielded pool* + *network-layer unlinkability* + *operator-blinding*.

**Three residual risks we name rather than hide:**
1. **The on-ramp (channel 4).** Privacy starts at the pool. Fund it privately, or accept that "you → pool" is visible while "pool → your spending" is not.
2. **Anonymity-set size.** A pool with few users is weak privacy regardless of the cryptography. Always the shared canonical pool — **never deploy our own** (a private pool of one is transparent in practice).
3. **A global passive adversary** correlating Tor timing against chain timing. Out of scope for anything short of a nation-state, but stated, not pretended away.

---

## 5. One request, end to end

How the layers compose in a single "research and buy" task:

1. Agent calls `browse(url)` over the MCP server.
2. A **fresh browser worker** spawns — new profile, new **Tor** circuit. The site sees a Tor exit IP and a generic fingerprint. *(channels 1–2)*
3. Page hits a STRK20 paywall. The worker returns the payment requirement — **it does not know who the user is.** *(channel 5: isolation)*
4. Agent calls `pay(...)`. The **payment worker** builds an unsigned shielded intent within the user's **session-key policy**. *(channel 5)*
5. The **user's wallet** decrypts notes, generates the ZK proof **client-side**, and signs. Discovery/proving traffic rides **OHTTP**. *(channels 3+5)*
6. Settlement goes out **gaslessly** via the `sponsored_private` paymaster — the fee comes from inside the pool, so no transparent fee tx points back to the user. *(channels 3+5)*
7. Content unlocks. Metering is debited **off-chain** against the prepaid balance; on-chain settlement is **batched and delayed**, breaking timing correlation. *(channel 6)*
8. Later, the user calls `reveal(viewingKey)` and audits every spend — **only they can.**

At no point does any single party hold both halves of the link.

---

## 6. Rules we don't break

1. Shared canonical pool only — never our own pool.
2. Keys and proving stay client-side — the server is never custodial.
3. Browsing and payment workers never share an identifier.
4. Privacy claims cover **shielded STRK20 on Starknet only** — transparent rails (x402/Base USDC) are labeled transparent. See `THREAT-MODEL.md` §4.5.
5. No logged-in browsing — authenticating *is* deanonymizing.
6. Never present devnet as mainnet.

See also: `PLAN.md` (product + build plan) · `THREAT-MODEL.md` (adversaries, precise claims, judge Q&A) · `READING-LIST.md` (background).
