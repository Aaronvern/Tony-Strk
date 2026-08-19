# Day-1 Spike Results — 2026-08-14

Goal: prove the tooling is real *before* betting 18 days on it, and close the biggest open risk — **can a headless server do STRK20 private payments on mainnet without self-hosting a prover?**

**Verdict: the stack is real, the headless path is architecturally open, and the spike found a privacy primitive that upgrades the product (shadow accounts).** One dependency remains, with a concrete workaround.

---

## 1. Environment — all green

| Check | Result |
| --- | --- |
| Node 24 (required by `ohttp-ts`) | ✅ **v24.19.0 installed** via nvm (was 22.14.0 — blocker cleared) |
| Starknet mainnet RPC | ✅ Lava, dRPC, Cartridge, PublicNode all return `SN_MAIN` (Blast is dead) |
| `starknet-privacy` repo | ✅ clones; Cairo contracts + Rust crates + TS SDK + demo + e2e |
| Privacy SDK deps | ✅ `npm ci` → 365 packages, clean |
| `starknet.js` with STRK20 API | ✅ **10.7.0** installs (needs `^10.4.0`; latest tag is 10.0.2 → **pin `starknet@10.7.0`**) |

---

## 2. The STRK20 Wallet API is real — exact surface (verified in `.d.ts`)

`WalletAccountV6` (starknet.js 10.7.0) exposes the privacy protocol directly:

| Method | What it does |
| --- | --- |
| `strk20Balances(tokens)` | private balances held **inside** the pool |
| `strk20PrepareInvoke(actions, simulate?)` | returns `{ call, proof }` — builds the call + **SNIP-36 ZK proof** |
| `strk20InvokeTransaction(actions)` | submit actions atomically (wallet shows approval) |
| `executeWithProof(calls, proof)` | execute arbitrary calls with a privacy proof attached |
| `strk20ShadowAccountCommitment(dappName, nonce?)` | derive/recognize **shadow accounts** (see §3) |

Actions: `STRK20_DEPOSIT_ACTION` (shield), `STRK20_WITHDRAW_ACTION` (unshield), `STRK20_TRANSFER_ACTION` (private send), `STRK20_INVOKE_ACTION`, `STRK20_SHADOW_ACCOUNT_INVOKE_ACTION`.

Under the hood it's a standard wallet JSON-RPC method — `wallet_strk20PrepareInvoke` — so **any** wallet implementing the spec works; we are not locked to one vendor.

**Notable:** the spec defines an `Errors.PRIVACY_LEAK` error — the wallet itself **refuses operations that would leak privacy**. Protocol-level protection against our own bugs, and a strong talking point.

---

## 3. 🔑 Major find: **Shadow accounts** — per-dapp, unlinkable identities

This is the primitive the product was missing, and it's built into STRK20:

> `strk20ShadowAccountCommitment(dappName, nonce)` — *"each nonce selects a distinct shadow account for this user + DAPP."* Omitting the nonce yields a **partial commitment**, which *"can be published once to let a DAPP recognize all the shadow accounts of a user without learning any individual nonce."*

Why this matters for Tony Stark:

- The agent can transact from a **fresh shadow account per task or per site** — mutually unlinkable, and unlinkable to the user's real account.
- `STRK20_SHADOW_ACCOUNT_INVOKE_ACTION` lets the agent **invoke arbitrary contract calls through that shadow account** — so it isn't just payments; any on-chain interaction is compartmentalized.
- The **partial commitment** solves a real UX problem: *we* can recognize "this is one of our user's shadow accounts" (to credit their balance) **without learning which one, and without linking them to each other.** That is exactly the "metered service that can't profile you" property §3 of the threat model promises — now protocol-backed rather than self-imposed.

**Design change:** shadow accounts become a core part of the architecture, not a stretch goal.

---

## 4. The headless question — architecturally open, one dependency

`WalletAccountV6` takes `walletProvider: WalletWithStarknetFeatures` — a **plain object interface**, *not* `window.starknet`. `StarknetInjectedWallet` is merely one implementation that wraps an injected object. So starknet.js does **not** require a browser.

But the privacy work (keys, notes, **proving**) lives *behind* that interface, which leaves three routes:

| Route | Requires | Assessment |
| --- | --- | --- |
| **A. Drive a real wallet extension** — run Ready/Xverse in a headless Chromium | **separate** Chromium + Playwright (Obscura cannot load Chrome extensions) | Fallback only. The wallet does the proving and we never hold keys, but it means a second browser stack purely to host an extension. |
| **B. Implement the wallet side ourselves** with `starknet-privacy` SDK | a `PROVING_SERVICE_URL` | Cleanest for a server, but needs a hosted prover URL from StarkWare (**not public** — confirmed). |
| **C. Self-host the prover** | Pathfinder mainnet full node | ❌ Off the table in 18 days. |

**Plan: pursue A, request B's endpoint in parallel.**

---

## 5. Compliance is mandatory, not optional (confirmed)

> *"a deposit is only accepted with a screening signature"* — the screening service screens the depositing address and **signs** the deposit; the prover attaches it.

You cannot bypass screening even by self-hosting. This **confirms** the "private by default, compliant by design" positioning — and means our shield flow depends on the screening path working, which is a integration detail to verify early.

---

## 6. Still open

1. **No public proving/discovery URL or mainnet pool address is documented** — must come from StarkWare (Proof of Privacy / builders group). Route A avoids needing it.
2. **Route A not yet executed** — driving the Ready extension programmatically is the next spike.
3. `@starkware-libs/starknet-privacy-sdk` is **not on npmjs** (GitHub Packages or git-SHA install).

---

---

# SPIKE 2 — Headless + real wallet + hosted infra (same day)

**Verdict: the two biggest risks are now closed.** Headless operation is *proven by execution*, and the "missing" hosted prover/discovery infrastructure **exists, is public, and is live**.

## 8. ✅ PROVEN: headless works (executed, not theorized)

Implemented `WalletWithStarknetFeatures` as a plain Node object — the entire Starknet surface is a **single `request()` function** — handed it to `WalletAccountV6`, and ran it on Node 24. **No browser, no `window.starknet`.**

All four privacy calls round-tripped successfully:

| starknet.js call | wire method | params sent |
| --- | --- | --- |
| `strk20Balances([STRK])` | `wallet_strk20Balances` | `{tokens:[...]}` |
| `strk20ShadowAccountCommitment('tonyStark','0x0')` | `wallet_strk20ShadowAccountCommitment` | `{dapp_name, nonce}` |
| `strk20PrepareInvoke(actions)` | `wallet_strk20PrepareInvoke` | `{actions:[...]}` |
| `strk20InvokeTransaction(actions)` | `wallet_strk20InvokeTransaction` | `{actions:[...]}` |

Note: starknet.js converts camelCase→snake_case on the wire and normalizes the returned call (`contract_address`→`contractAddress`). Script: `scratchpad/wallet-api-probe/mock-wallet-spike.mjs`.

**⇒ We can write our own wallet adapter and run the whole payment layer server-side.**

## 9. Real wallet check — Ready/Argent X v5.33.8 (downloaded & unpacked)

| Method | Implemented in shipping extension? |
| --- | --- |
| `wallet_strk20PrepareInvoke` | ✅ yes |
| `wallet_strk20Balances` | ✅ yes |
| `wallet_strk20InvokeTransaction` | ✅ yes |
| `wallet_strk20ShadowAccountCommitment` | ❌ **no — absent** |

Also present: `strk20`/`STRK20` (12 files), `shielded`, `privacyPool`, `viewingKey`, a `ViewingKeyService`, and a `privacyPoolViewingKey` backend endpoint.

### ⚠️ Correction to Spike 1

I previously promoted **shadow accounts to core architecture**. That was premature: the method is in the *spec and starknet.js*, but **not in the shipping wallet**. Demoted to **roadmap/stretch**, contingent on wallet support (or on us implementing the wallet side ourselves, where we control it). The privacy design must not depend on it for the hackathon.

## 10. 🎯 Found the "missing" hosted infrastructure — and it's LIVE

The prover/discovery URLs that are undocumented publicly are **embedded in the shipping Ready extension**:

| Service | URL | Status |
| --- | --- | --- |
| **Prover (Sepolia, StarkWare)** | `https://transaction-prover.alpha-sepolia.sw-dev.io` | ✅ `/health` `{"status":"ok"}`; JSON-RPC live |
| **Discovery (Sepolia, StarkWare)** | `https://discovery-service.alpha-sepolia.sw-dev.io` | ✅ live **and synced** — `chain_head` advancing, `lag_secs: 5` |
| **Prover (production, Ready)** | `https://cloud.argent-api.com/v1/privacy/proving` | ✅ `/health` `{"status":"ok"}`; **answers unauthenticated JSON-RPC** (see correction below) |
| **Discovery (production, Ready)** | `https://cloud.argent-api.com/v1/privacy/discovery` | ✅ live and synced (mainnet chain head, ~5s lag) |

### ⚠️ Correction — these are NOT auth-gated

An earlier run of this spike hit a transient `{"message":"Internal server error"}` on the production prover's `/health` and I concluded it was auth-gated. **That was wrong.** On re-check, the production prover answers an unauthenticated `starknet_proveTransaction` request **identically** to the open Sepolia one (HTTP 200, `missing field 'transaction'` param validation).

**What this does and does not establish:**
- ✅ Established: the endpoint is reachable and parses unauthenticated JSON-RPC.
- ❓ **Unverified:** whether it will accept and complete a *real* proving job unauthenticated — rate limits, origin checks, or auth on actual work could still apply.
- ⚖️ Regardless: this is **a third party's production infrastructure** (Ready's). Even where technically open, we ask before depending on it, and we do not build a product on someone else's unbudgeted compute.

**Implication if it holds:** the fully-headless mainnet path (Route B on mainnet, no wallet in the loop) may be viable — which would be a materially better product. Test with one real proof before believing it.

**Proof these are the official StarkWare services:** the live prover's `/ohttp-keys` returns
`ACkAACBBhSMg/zZ0lfpSLJTLg685Hk6JAYOSclu/IJjdkxvEJAAEAAEAAQ==` — an **exact byte-for-byte match** with the pinned `VITE_OHTTP_KEY_CONFIG` in `starknet-privacy/demo/.env.example`. Same infrastructure the SDK repo ships against. OHTTP is live in production.

The prover's JSON-RPC validates requests progressively (`missing block_id` → `missing transaction`), confirming `starknet_proveTransaction` is real and functional — not a stub.

## 11. What this changes

- **Route B is now viable for development**: point the SDK's `ProvingServiceProofProvider` + `IndexerDiscoveryProvider` at the **Sepolia** endpoints. No Pathfinder, no self-hosting, no waiting on anyone. **We can build the full payment layer immediately.**
- **Mainnet is still the open item**: Sepolia is dev infra. Ready's production prover *does* answer unauthenticated RPC (§10 correction), but a full proof round-trip there is unverified and it is a third party's infrastructure — so mainnet still needs either a verified server-side proof, **Route A** (drive the Ready extension), or our own access via Proof of Privacy.
- **Recommended architecture:** build server-side against Sepolia hosted infra (fast iteration, fully headless), keep the wallet adapter behind an interface, and swap in Route A for the mainnet demo.

*Usage note: these are dev endpoints. We use them for development at modest volume and don't treat them as a production SLA.*

---

# SPIKE 3 — Pool addresses found and verified

**Verdict: every external dependency is now identified and verified live.** Run `npm run spike:services` to reproduce all of it.

## 13. 🎯 The privacy pool addresses

Not published in any doc we could find. Recovered by mining **AVNU's production bundle** (they run private swaps on mainnet, so their app must know the pool), which yielded a config block `privacy:{[net]:{poolAddress:…}}` resolving to two constants:

| Network | Privacy pool address | Class hash | Verified |
| --- | --- | --- | --- |
| **Mainnet** | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` | `0x67dddd89d80fedadc06b6f160798f94800a4a70164e5a24301cd0d6076b554d` | ✅ on-chain |
| **Sepolia** | `0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91` | `0x56ab118a8a6e38efc93ad758cefe909fee421fa931ce3cf72df624d345623b2` | ✅ on-chain + discovery |

Note both class hashes differ from the `0x52107fad…` in the SDK repo's README (that was tag `PRIVACY-0.14.3-RC.0`), so the deployed pools run a newer revision than the repo's pinned table. Pin the SDK to match the deployment, not the README.

## 14. ✅ Discovery verified end-to-end (with a control)

Querying `/v1/sync/incoming_state` against the Sepolia pool returns a **valid empty result set** — real `block_ref`, empty `channels`/`notes` (correct for a dummy viewing key):

```
HTTP 200  {"block_ref":"0x7e72…","channels":[],"subchannels":[],"notes":[],"cursor":{…}}
```

And the **control** — the same service given the *mainnet* pool address:

```
HTTP 400  {"error":{"code":"CONTRACT_NOT_FOUND","message":"Contract not found at the configured address"}}
```

The control matters: without it, a 200 could mean "accepts anything" and would prove nothing. The service genuinely validates the pool and genuinely serves ours.

## 15. Auth status — refined

- Ready's **prover/discovery RPC**: answers unauthenticated.
- Ready's **`/v1/privacy/*` config API**: returns **401 Unauthorized**.
- Their mainnet discovery currently self-reports `"status":"UNHEALTHY"` — a reminder not to build on a third party's service we don't operate.

## 16. Screening — what's left to test

Deposit screening (a sanctions check that signs the deposit, mandatory even when self-hosting) **cannot be exercised without a funded account**: it runs inside the prover during a real `starknet_proveTransaction` for a deposit action. It is therefore the *first* thing Phase 1 must prove, not something we can pre-verify. Expected failure mode if it rejects: JSON-RPC error `10000`.

## 17. Actions

- [x] Node 24 installed; RPCs verified; SDK installs
- [x] STRK20 wallet API surface mapped
- [x] **Headless proven by execution** (mock wallet, 4/4 methods)
- [x] Ready extension audited — 3/4 methods shipped, **no shadow accounts**
- [x] **Live hosted prover + discovery found and verified (Sepolia)**
- [ ] **Next:** wire the real SDK to the Sepolia prover/discovery → a genuine end-to-end shielded transfer on Sepolia
- [ ] Human: request **mainnet** prover/discovery access (Proof of Privacy) — the last mainnet gap
- [ ] Pin `starknet@10.7.0`; Node 24 in CI

---

# SPIKE 4 — First real proof, and the submission gap

## 18. ✅ The hosted prover produces real proofs for us

Wired the actual SDK (`@starkware-libs/starknet-privacy-sdk`, built from source — it isn't on npm) to StarkWare's Sepolia prover and discovery, with our verified pool address, and asked it to prove a `register` action:

```
✅ prover returned a proof
   target   0x254a6b29…  (the privacy pool)
   entry    apply_actions
   facts    present
   warnings 0
```

This is the moment the money path stopped being theoretical: a real STRK20 privacy proof, generated by the official hosted service, for our account.

## 19. Two things that cost real time (record them)

**`PRIVATE_KEY_NOT_CANONICAL`.** The viewing key must be in `[1, MAX_VIEWING_KEY]` where `MAX_VIEWING_KEY = CURVE.n / 2` — **half** the STARK curve order, not the full order. A raw Poseidon digest overflows it roughly half the time. The pool rejects it inside the prover's virtual execution, so it surfaces as a confusing "Reverted transactions are not supported" rather than a validation error. Clamp with `(digest % (MAX_VIEWING_KEY - 1n)) + 1n`.

**Errors surface from the prover, not the chain.** A failed action reverts inside the prover's *virtual* block, so the transaction hash in the error does not exist on Starknet — don't waste time looking it up on an explorer. Decode the felt in the revert reason instead; it carries the real error name.

## 20. ⛔ The submission gap — a plain Account cannot submit

`execute()` returns `{ callAndProof, registry }`. It **proves but does not submit.**

Submitting means calling `apply_actions` on the pool **with the proof attached to the transaction**, and a plain starknet.js `Account` has no way to attach it. Two supported paths:

| Path | Mechanism |
| --- | --- |
| **AVNU paymaster** | `apply_action` for the private flow; **`invoke_and_apply_action` when a deposit is involved**, because the ERC-20 `approve` must execute as the *user* — under `apply_action` the executing account is the paymaster, not the user |
| **STRK20-aware wallet** | `WalletAccountV6.executeWithProof` |

**Consequence for our architecture:** the AVNU paymaster is **not an optional gasless nicety — it is the submission path** for a server-side agent. It was already in the design for fee privacy; it turns out to be load-bearing.

Live and reachable: `https://sepolia.paymaster.avnu.fi` (405 to GET — POST-only JSON-RPC, as expected) and `https://sepolia.api.avnu.fi/paymaster/v1/status` (200).

**Next:** wire `@starkware-libs/starknet-privacy-client`'s `SdkWallet` + `AvnuPaymaster`, which implements exactly this flow. Open question: whether the sepolia paymaster needs an API key.

---

# SPIKE 5 — Paymaster submission wired; one credential away

## 21. The full submission stack assembles and reaches the paymaster

Wired `CorePrivateTransfersProver` + `AvnuPaymaster` + `SdkWallet` from `@starkware-libs/starknet-privacy-client` (built from source alongside the SDK) and asked it to shield 1 STRK.

Every layer composed correctly — prover, discovery, pool address, paymaster client, deposit flow selection — and the request reached AVNU's paymaster RPC. It was rejected on **authentication only**:

```
Paymaster paymaster_buildTransaction:
  An error occurred (UNKNOWN_ERROR) (code: 163): x-paymaster-api-key is invalid
```

That is as clean a blocker as you get: everything works except a credential.

**Also confirmed by this run:** the client derives the viewing key from a **passphrase** (`passphraseViewingKeyProvider`), so callers never handle it — and the `CURVE.n/2` canonical-range trap from §19 disappears on this path.

## 22. ⛔ Blocker: AVNU paymaster API key

The Sepolia paymaster requires `x-paymaster-api-key`. Self-service: **https://portal.avnu.fi**. Docs: <https://docs.avnu.fi/docs/paymaster>.

Set it as `AVNU_API_KEY` and re-run `scripts/submit-via-paymaster.mjs`. That single credential unblocks, in order: on-chain submission → the shielded deposit → **the sanctions-screening test** → the private transfer. In other words, the rest of the money path.

**Note for mainnet:** the same key requirement will apply, so obtaining it now de-risks Phase 5 too.
