# CHOG Clash

A browser fighting game for the CHOG community, with free matchmaking, optional paid duels and sponsor-funded tournaments settled on Monad.

**[Play the live demo](https://chog-clash-two.vercel.app)** · [Two-minute demo video](https://github.com/haikarure/chog-clash/releases/download/hackathon-2026-10-14/chog-clash-demo.mp4) · [Submission write-up](docs/SUBMISSION_PACKAGE_2026-10-14.md) · [Acceptance evidence](docs/ONLINE_VALIDATION.json)

## Play

Choose one of 12 CHOG fighters. Invite a friend or use Quick Match for free; no wallet is needed. CPU and Training modes are also available. Keyboard: A/D movement, W jump, Space basic, I/O skills, P ultimate. Mobile has touch controls.

Paid duels use two distinct SIWE wallets: 1 AUSD testnet entry each, winner 1.90 and platform 0.10 (5%). Pairing does not charge an entry. House Cup has four free entrants, a 100 AUSD testnet sponsor pool and 70/30 prizes with zero Cup fee. Cancellation, Void and expiry refund applicable deposits in full. Test tokens have no monetary value; MON network fees are separate.

Combat runs on an authoritative server. Monad escrows validate funding, eligible signed results and fixed payouts. Server/result-signer honesty remains a trust assumption; replay hashes support auditing and do not prove honest gameplay.

## Run locally

Node 24+ is required. From this checkout:

```bash
npm --prefix server ci
npm --prefix server start
```

Open http://localhost:5174/play.html. Free PvP, Practice Cup, CPU and Training work without keys. Copy server/.env.example to server/.env only when configuring your own verified testnet service. Never commit keys. The project runs one backend instance with persistent SQLite; it does not claim distributed matchmaking.

## Contracts and tests

Install Foundry (forge/anvil), then:

```bash
npm --prefix server run build:contracts
npm --prefix server test
npm --prefix server run test:contracts
```

51 Node tests and 38 Solidity tests passed. The Node suite deploys real local-EVM fixtures and tests invitation/queue, payout/fee, cancellation, failed transfers, missing hashes, retry, restart Void and direct-wallet cancellation. Four Solidity fuzz tests each run 256 cases.

[Paid escrow source](https://testnet.monadscan.com/address/0xB15097FcB9DE04A2CEb844f1a9C88929E3d8cAd7#code) · [Cup escrow source](https://testnet.monadscan.com/address/0xeEe983581d5f747eC31Cda37C2645F65af31CB5E#code)

Actual Monad testnet receipts and token transfers prove paid winner/platform payments, Cup 70/30 and refunds. The public Vercel/Railway demo passed browser/payment/mobile acceptance. Network proxy tests completed ten bot matches near 100 ms RTT and one near 200 ms, with uniform jitter ±15 ms per direction and 1% input/snapshot message loss. Both clients and deterministic replay agreed. This is application-message loss, not TCP packet loss or a physical WAN test.

Physical devices, device frame benchmarks and four-human Cup feedback are still unverified. Simulated wallets and Forfeit-based settlement tests do not establish adoption, engagement or sponsor ROI.

## Source and attribution

This repository is a reviewer snapshot of the CHOG Clash working source. It does not reproduce the original working repository's entire history. The combat engine adapts [Aether Clash by Bang Tutorial](https://github.com/bangtutorial/aether-clash), original commit 1ac9751f86569b6b8c177994d5074a0d85faf94d, under MIT. The original copyright is retained in [LICENSE](LICENSE).

CHOG references and their owners' rights, generated art, local rigs/music and synthetic announcer cues are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE-ASSETS.md](LICENSE-ASSETS.md). This is a community fan adaptation and does not claim official CHOG affiliation. Existing engine code is attributed separately from the CHOG presentation, multiplayer backend, escrows and product flows built for this project.

Credentials, session tokens, player databases, dependency installs and private deployment packets are excluded. Build artifacts can be regenerated. Runtime assets and original generated-art inputs are included.

## In-game AUSD faucet

The paid duel create/join/funding UI includes a Claim testnet AUSD button. Players use their own connected wallet on Monad testnet to call Agora’s published faucet; MON testnet gas is required. The UI verifies the AUSD transfer to the recipient, shows the balance/transaction link, handles cooldown and wallet rejection, and recovers pending transactions across reload. Seven faucet tests use a simulated EIP-1193 provider. [Public release checks](validation/final/faucet-release.json) and [simulated-wallet UI tests on the public deployment](validation/final/faucet-public-browser/report.json) record the current behavior.

## 1v1 stake selection

The main 1v1 Duel menu shows the 1 AUSD stake choice alongside explicit Free 1v1. Invitation and automatic matchmaking both use the existing PaidDuelEscrow. Players deposit one test AUSD each before the match locks; the winner receives 1.90 and the treasury 0.10. The result screen shows reward/refund progress and only marks a payment verified after its token transfer. Existing free invitations remain free. [Full local-EVM browser acceptance](validation/final/pvp-stakes-local/report.json), [public entry/mobile checks](validation/final/pvp-entry-public/report.json), [public deployment checks](validation/final/pvp-stakes-release.json).

## Fewer wallet confirmations

Active, matching backend wallet sessions are reused; expired or changed-account sessions still require a signature. Chain switching is skipped when already correct. Entry funding offers a bounded 10 AUSD spending limit for up to ten one-token entries, with a one-token limit option. The token, spender, entry and calldata are checked before preparing the larger limit. Each deposit remains 1 AUSD and requires the player’s own confirmation. [Local-EVM browser evidence](validation/final/simple-wallet-local/report.json) records one login signature per player and a later entry funded with one transaction. [Public release](validation/final/simple-wallet-release.json), [UI edge cases](validation/final/simple-wallet-faucet/report.json).

## Connect from the landing page

Connect Wallet is available on the landing page and the hub/PvP/Cup headers. The same HttpOnly game session carries across pages, so an active wallet login does not need another SIWE signature. The address button disconnects the site login in one click without a transaction. Logout invalidates pending login proofs and unpaired paid queues while preserving the game session and invitation ownership; other tabs refresh their wallet state. The first connection still needs the wallet’s own approval and signature. Auth tokens and signatures are not stored in localStorage.

[Local browser acceptance](validation/final/landing-wallet-local/report.json), [paid duel regression](validation/final/landing-wallet-paid/report.json), [public UI checks](validation/final/landing-wallet-public/report.json). [Public release evidence](validation/final/landing-wallet-release.json) matches the current deployed source, including protection against a stale session response restoring wallet auth after logout.
