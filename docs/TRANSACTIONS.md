# Transaction record

Every on-chain transaction this project makes, with explorer links on both
Voyager and Starkscan.

**Mainnet hashes also belong in `strk20.json`** — the hackathon hub verifies
each one on-chain as existing, succeeded, and having touched the STRK20 pool.
Sepolia does not count toward that requirement; it is recorded here as
engineering evidence.

Explorer URL shapes:

| Network | Voyager | Starkscan |
| --- | --- | --- |
| Mainnet | `https://voyager.online/tx/<hash>` | `https://starkscan.co/tx/<hash>` |
| Sepolia | `https://sepolia.voyager.online/tx/<hash>` | `https://sepolia.starkscan.co/tx/<hash>` |

## How these get made

Wallet-driven pool operations come from the pool console at `/pool`
(`npm run dev`). It records the hash, both explorer links, and the network for
every submission, and prints the mainnet hashes in the shape `strk20.json`
wants. Contract deploys and helper spikes come from `scripts/spikes/`.

## Sepolia

| Date | What | Hash | Voyager | Starkscan |
| --- | --- | --- | --- | --- |
| 2026-08-19 | First shielded deposit — sanctions screening passed | `0x3e74d521285a305781153653c71f785f386acb10b409dcb60e2178a32489349` | [view](https://sepolia.voyager.online/tx/0x3e74d521285a305781153653c71f785f386acb10b409dcb60e2178a32489349) | [view](https://sepolia.starkscan.co/tx/0x3e74d521285a305781153653c71f785f386acb10b409dcb60e2178a32489349) |
| 2026-08-22 | Faucet top-up for the anonymizer spike | `0x4363bb6e67d50f8a45673570d3b902ab5bf59af03d1413351edf344868ae675` | [view](https://sepolia.voyager.online/tx/0x4363bb6e67d50f8a45673570d3b902ab5bf59af03d1413351edf344868ae675) | [view](https://sepolia.starkscan.co/tx/0x4363bb6e67d50f8a45673570d3b902ab5bf59af03d1413351edf344868ae675) |

| 2026-08-22 | Declare `PaywallAnonymizer` (hardened) — class `0x39cd30ef96c73f291ae9a8d4161a1601ffca2620f9c413ca079a81c4c8ba58e` | `0x230dbfa0ed572d46be72a1a0f04dbb3c31a62af372a83780617af4a14cfe884` | [view](https://sepolia.voyager.online/tx/0x230dbfa0ed572d46be72a1a0f04dbb3c31a62af372a83780617af4a14cfe884) | [view](https://sepolia.starkscan.co/tx/0x230dbfa0ed572d46be72a1a0f04dbb3c31a62af372a83780617af4a14cfe884) |
| 2026-08-22 | Deploy `PaywallAnonymizer` → `0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d` | `0x3018f52b3e84077b7282d5216c8239ca1cbaffb652381165d27455be316a435` | [view](https://sepolia.voyager.online/tx/0x3018f52b3e84077b7282d5216c8239ca1cbaffb652381165d27455be316a435) | [view](https://sepolia.starkscan.co/tx/0x3018f52b3e84077b7282d5216c8239ca1cbaffb652381165d27455be316a435) |

| 2026-08-22 | Shield 3 STRK to fund the anonymizer spike | `0x7969781d086182f1a8c6c1a2d43e96073825936462473bd6aa212479b4e2a5f` | [view](https://sepolia.voyager.online/tx/0x7969781d086182f1a8c6c1a2d43e96073825936462473bd6aa212479b4e2a5f) | [view](https://sepolia.starkscan.co/tx/0x7969781d086182f1a8c6c1a2d43e96073825936462473bd6aa212479b4e2a5f) |

| 2026-08-22 | **Paywall payment through the pool** — `privacy_invoke` paid the merchant 0.05 STRK, change to an open note, receipt emitted | `0x94c9a56632651bff50ae2e5096394de0c96e1f405900d1c82e1a27e5882cf5` | [view](https://sepolia.voyager.online/tx/0x94c9a56632651bff50ae2e5096394de0c96e1f405900d1c82e1a27e5882cf5) | [view](https://sepolia.starkscan.co/tx/0x94c9a56632651bff50ae2e5096394de0c96e1f405900d1c82e1a27e5882cf5) |
| 2026-08-22 | Shield 10 STRK (funded the payment above) | `0xd005d4d9ed0f0f0f9a92f9231ae4ed1c88e03d24333c370a404ecce618a7ec` | [view](https://sepolia.voyager.online/tx/0xd005d4d9ed0f0f0f9a92f9231ae4ed1c88e03d24333c370a404ecce618a7ec) | [view](https://sepolia.starkscan.co/tx/0xd005d4d9ed0f0f0f9a92f9231ae4ed1c88e03d24333c370a404ecce618a7ec) |
| 2026-08-24 | Shield 12 STRK to fund the paywall loop end-to-end | `0x53f037498c5a7c6c3bde495c0cbbac83b69dda27e03ab15c0642de42ea7fec5` | [view](https://sepolia.voyager.online/tx/0x53f037498c5a7c6c3bde495c0cbbac83b69dda27e03ab15c0642de42ea7fec5) | [view](https://sepolia.starkscan.co/tx/0x53f037498c5a7c6c3bde495c0cbbac83b69dda27e03ab15c0642de42ea7fec5) |
| 2026-08-24 | **The full loop** — agent hit a 402, settled it anonymously through the pool, and the merchant unlocked on the on-chain receipt. Merchant 0.05 → 0.1 STRK, helper left empty | `0x604e2104c397a22a78a200a4a05884308131a7bb19385a7af05185900dd9d13` | [view](https://sepolia.voyager.online/tx/0x604e2104c397a22a78a200a4a05884308131a7bb19385a7af05185900dd9d13) | [view](https://sepolia.starkscan.co/tx/0x604e2104c397a22a78a200a4a05884308131a7bb19385a7af05185900dd9d13) |
| 2026-08-25 | **An agent did it alone** — `pay_paywall` over MCP: browsed a public URL through Tor, hit 402, settled 0.025 STRK through the pool, re-fetched with the receipt and read the article. Merchant 0.1 → 0.125 STRK, helper left empty | `0x37e3d5ad03efa7a4ef0890d16685f8808ae3160270827506aca83eda967c5a2` | [view](https://sepolia.voyager.online/tx/0x37e3d5ad03efa7a4ef0890d16685f8808ae3160270827506aca83eda967c5a2) | [view](https://sepolia.starkscan.co/tx/0x37e3d5ad03efa7a4ef0890d16685f8808ae3160270827506aca83eda967c5a2) |
| 2026-08-23 | Fund the Ready wallet account for the wallet-route probe (100 STRK) | `0x13e26a06e02566bd0d68b3cd7b5cb2b2f5a8ee04e6c825f70f0a58084f29179` | [view](https://sepolia.voyager.online/tx/0x13e26a06e02566bd0d68b3cd7b5cb2b2f5a8ee04e6c825f70f0a58084f29179) | [view](https://sepolia.starkscan.co/tx/0x13e26a06e02566bd0d68b3cd7b5cb2b2f5a8ee04e6c825f70f0a58084f29179) |
| 2026-08-26 | Task 7 `wallet_shield` — gross 5 STRK deposit; receipt block 14076275, spendable after block 14076287 | `0x177187b40243ea01d98624b1a893ae705c291e595bf470ffabfa7b629a70677` | [view](https://sepolia.voyager.online/tx/0x177187b40243ea01d98624b1a893ae705c291e595bf470ffabfa7b629a70677) | [view](https://sepolia.starkscan.co/tx/0x177187b40243ea01d98624b1a893ae705c291e595bf470ffabfa7b629a70677) |
| 2026-08-26 | **Task 7 live MCP x402 v2 payment** — Tor fetched the public HTTPS article, paid 0.05 STRK through STRK20, and returned HTTP 200 protected content; receipt block 14076417 | `0x715e446ba3262cc3a45ee650c2c6ec3cfd00c0ca37f578d2955aac82896c768` | [view](https://sepolia.voyager.online/tx/0x715e446ba3262cc3a45ee650c2c6ec3cfd00c0ca37f578d2955aac82896c768) | [view](https://sepolia.starkscan.co/tx/0x715e446ba3262cc3a45ee650c2c6ec3cfd00c0ca37f578d2955aac82896c768) |

## Mainnet

| Date | What | Hash | Voyager | Starkscan |
| --- | --- | --- | --- | --- |
| 2026-08-30 | Deploy guardian-free Ready account `0x0368…fbfc` | `0x471be634b9f11be555995ee0abca63f7929c27870e306da7fa12fc03f52c422` | [view](https://voyager.online/tx/0x471be634b9f11be555995ee0abca63f7929c27870e306da7fa12fc03f52c422) | [view](https://starkscan.co/tx/0x471be634b9f11be555995ee0abca63f7929c27870e306da7fa12fc03f52c422) |
| 2026-08-30 | Declare current `PaywallAnonymizer` class | `0x43f170bffac6d6bcd533e8a06ba9cf514bab23431374cdd4c6ad5d16661f77a` | [view](https://voyager.online/tx/0x43f170bffac6d6bcd533e8a06ba9cf514bab23431374cdd4c6ad5d16661f77a) | [view](https://starkscan.co/tx/0x43f170bffac6d6bcd533e8a06ba9cf514bab23431374cdd4c6ad5d16661f77a) |
| 2026-08-30 | Deploy Mainnet `PaywallAnonymizer` at `0x7e5d…e21d` | `0x16f91b088af707d81a1b9d860ff0a10ca4d764ed840201f23732ab931450d9b` | [view](https://voyager.online/tx/0x16f91b088af707d81a1b9d860ff0a10ca4d764ed840201f23732ab931450d9b) | [view](https://starkscan.co/tx/0x16f91b088af707d81a1b9d860ff0a10ca4d764ed840201f23732ab931450d9b) |
| 2026-08-30 | Shield 20 STRK into the Mainnet pool; receipt block 14093200, spendable after 14093212 | `0x5cd6c6eb051b40abeeaf69fb4bfe5da96058ed7775f8cb7a49a6c4f097dc2ba` | [view](https://voyager.online/tx/0x5cd6c6eb051b40abeeaf69fb4bfe5da96058ed7775f8cb7a49a6c4f097dc2ba) | [view](https://starkscan.co/tx/0x5cd6c6eb051b40abeeaf69fb4bfe5da96058ed7775f8cb7a49a6c4f097dc2ba) |
| 2026-08-30 | Approve exactly three 6 STRK Mainnet pool fees for the public-relay fallback; allowance was exhausted after run 3 | `0x6458869110e904cc29ae529e5831a381f05c1c825f34bd36b89bc376fdcb8` | [view](https://voyager.online/tx/0x6458869110e904cc29ae529e5831a381f05c1c825f34bd36b89bc376fdcb8) | [view](https://starkscan.co/tx/0x6458869110e904cc29ae529e5831a381f05c1c825f34bd36b89bc376fdcb8) |
| 2026-08-30 | **Live MCP x402 run 1/3** — Tor `IsTor:true`; STRK20 proof called the Mainnet helper; `PaywallPaid` recorded 0.05 STRK; merchant returned HTTP 200 and protected content. Public-relay fallback used, so the submitting account is visible. Receipt block 14094389 | `0x3cb7c72a364a2adbcbb1a0251cdba7928438afa93e49ab46b2b9f1094372b89` | [view](https://voyager.online/tx/0x3cb7c72a364a2adbcbb1a0251cdba7928438afa93e49ab46b2b9f1094372b89) | [view](https://starkscan.co/tx/0x3cb7c72a364a2adbcbb1a0251cdba7928438afa93e49ab46b2b9f1094372b89) |
| 2026-08-30 | **Live MCP x402 run 2/3** — distinct STRK20 proof and receipt; Tor `IsTor:true`; exact 0.05 STRK helper event; HTTP 200 protected content. Public-relay fallback used. Receipt block 14094434 | `0x799dbbcf64a9c8b9e824460b1501e1e95ab77faea6abab4720449ceceaebb6b` | [view](https://voyager.online/tx/0x799dbbcf64a9c8b9e824460b1501e1e95ab77faea6abab4720449ceceaebb6b) | [view](https://starkscan.co/tx/0x799dbbcf64a9c8b9e824460b1501e1e95ab77faea6abab4720449ceceaebb6b) |
| 2026-08-30 | **Live MCP x402 run 3/3** — distinct STRK20 proof and receipt; Tor `IsTor:true`; exact 0.05 STRK helper event; HTTP 200 protected content. Public-relay fallback used. Receipt block 14094466 | `0x69c19fd2aa076088ae2eea5f585c3ab5f035d7774216d586278cf942dbf0906` | [view](https://voyager.online/tx/0x69c19fd2aa076088ae2eea5f585c3ab5f035d7774216d586278cf942dbf0906) | [view](https://starkscan.co/tx/0x69c19fd2aa076088ae2eea5f585c3ab5f035d7774216d586278cf942dbf0906) |
