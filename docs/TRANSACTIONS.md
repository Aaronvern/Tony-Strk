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

## Mainnet

_None yet. Three pool transactions are required to be scored._

| Date | What | Hash | Voyager | Starkscan |
| --- | --- | --- | --- | --- |
