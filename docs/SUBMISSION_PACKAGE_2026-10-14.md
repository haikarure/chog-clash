# CHOG Clash — submission package

14 October 2026 WIB. The user will submit the hackathon form. This package does not claim the form has been submitted.

## Project name

CHOG Clash

## One-liner

A browser fighting game for the CHOG community, with free matchmaking, optional paid duels and sponsor-funded tournaments settled on Monad.

## Project description

CHOG Clash turns a community rivalry into a playable browser game. Choose one of 12 CHOG fighters, invite a friend or use Quick Match, and fight with keyboard or touch controls. CPU and Training modes let anyone try the game without a wallet.

Paid duels add a clear settlement flow. Two different wallets each deposit 1 AUSD testnet. A verified winner receives 1.90 AUSD and the platform receives 0.10 AUSD. Cancellation before lock, Void and expiry return the applicable deposits in full, without a platform fee. House Cup uses a separate model: four players enter free, a sponsor funds 100 AUSD testnet, and the champion and runner-up receive 70/30.

The server runs combat in real time; Monad handles escrow and signed-result settlement. Results, transaction receipts and token transfers are checked before a payout is displayed as paid. Reload recovery prevents duplicate deposits. Interrupted matches become Void instead of inventing a winner.

Both contracts are deployed and source-verified on Monad testnet. Funding, winner/platform transfers and refunds have actual transaction evidence. The public demo runs on Vercel and a persistent Railway backend.

This is a testnet hackathon demo. Tokens have no monetary value. Gameplay depends on the server/result signer. Automated test clients are not evidence of human adoption.

## Primary track suggestion

Social, Attention & Culture. The product centers on community play and tournaments. This is a positioning suggestion, not a verified eligibility or judging outcome. Choose one primary track in the form. No Privy/Envio bounty integration is claimed.

## What was built

- CHOG artwork/rigs, comic landing and UI, 12-character presentation, five arenas, original music and synthetic announcer cues.
- Browser combat, CPU/Training, keyboard/touch, transform/summon presentation and mobile landscape shell.
- Shared server/browser combat, authoritative PvP, invite and Quick Match, reconnect/reload and rematch.
- Four-seat tournament bracket, SIWE wallet binding, funding/recovery, durable SQLite result/outbox and relay nonce allocation.
- Two Solidity escrows with EIP-712 result binding, fixed amounts, credits, cancellation/Void/expiry refunds and checked transfers.
- Public Vercel/Railway deployment, verified testnet contracts and acceptance artifacts.

The combat engine adapts MIT-licensed Aether Clash by Bang Tutorial. The original engine and CHOG character rights are attributed in the source notices. This is a fan adaptation and does not claim official CHOG affiliation.

## Links

- Demo: [CHOG Clash](https://chog-clash-two.vercel.app)
- Source: [reviewer repository](https://github.com/haikarure/chog-clash).
- Demo video: [two-minute MP4](https://github.com/haikarure/chog-clash/releases/download/hackathon-2026-10-14/chog-clash-demo.mp4).
- Paid escrow: [verified source](https://testnet.monadscan.com/address/0xB15097FcB9DE04A2CEb844f1a9C88929E3d8cAd7#code)
- Cup escrow: [verified source](https://testnet.monadscan.com/address/0xeEe983581d5f747eC31Cda37C2645F65af31CB5E#code)

## Transaction evidence

- Public Cup champion 70 AUSD: [transfer](https://testnet.monadscan.com/tx/0x74e92773814c31b580351adb67e92952b7e00eabb305653442cf1cc8f8105dbb)
- Public Cup runner-up 30 AUSD: [transfer](https://testnet.monadscan.com/tx/0xc2d2710902451a3d007db39861cf187db280e654f05964136eff4ec4a693f1e7)
- Public paid winner 1.90 AUSD: [transfer](https://testnet.monadscan.com/tx/0x38d8d6d314e271a823de1cea07fd95561ec0db65cf30dad139da2bd353fcd969)
- Public platform fee 0.10 AUSD: [transfer](https://testnet.monadscan.com/tx/0xb321a242b0878645fc3aacb1418235716026e5cc595618be76f7a26ef14d33e5)
- Paid duel and refund hashes: [testnet acceptance](../validation/testnet/paid-duel-acceptance.json).
- Public Cup: [acceptance](../validation/final/public-cup.json).
- Network: [10 played matches plus 200 ms stress](../validation/final/network.json).

## Reviewer walkthrough

1. Open the demo. Connect Wallet is available from the landing navigation, with one-click Disconnect after login. VS Computer and Training work immediately without a wallet.
2. Choose 1v1 Duel and Free 1v1. Create an invitation or select Quick Match in two browser sessions. Both players confirm Ready.
3. Choose 1 AUSD Duel. Use two distinct EVM wallets on Monad testnet with test AUSD and test MON. An active landing-page login is reused. Create an invitation or enter the paid queue; pairing does not charge an entry.
4. On first funding, set the token spending limit and deposit exactly 1 test AUSD each. Later entries need only the deposit confirmation while the login and allowance are valid. Open the match after both entries lock. A surrender is explicitly a Forfeit. View verified winner/platform transactions in the escrow report.
5. Host a House Cup: Practice needs no wallet; Testnet Cup needs a sponsor's 100 test AUSD and four separate SIWE wallets. Player entry is free. Only the locked final allocates 70/30.

Keyboard: A/D movement, W jump, Space basic, I/O skills, P ultimate. Touch controls appear on mobile. Settings do not pause the opponent in online play.

## Validation and limits

51 Node tests and 38 contract tests passed. Local real-EVM browser tests cover seven viewports, lost confirmation/reload, paid queue refund and mobile URLs. Ten played bot matches completed at around 100 ms RTT, plus one at around 200 ms, with ordered uniform jitter ±15 ms per direction and 1% input/snapshot message loss. Both clients and deterministic replay agreed with the server. This simulates application-message loss through a WebSocket proxy, not TCP packet loss or a physical WAN benchmark.

Public Cup acceptance uses four simulated wallet clients and three Forfeits, not a four-human event. Physical device frame performance, two-device testing, human tournament feedback and adoption/retention are not yet measured. The 5% duel fee is a demo product choice, not a proven optimal business model.

## Before sending the form

Use the same portal login provider used to register. Attach the final source and MP4/video URL, verify the demo opens, and copy only the fields the form requests. The user handles submission and its final confirmation. Do not claim the project was submitted from this document.

## Testnet onboarding update

Paid duel create/join/funding screens include a Claim testnet AUSD button using the published Agora faucet. Players approve the transaction in their own wallet and pay MON testnet gas. The UI shows the balance, verifies the token Transfer before confirming a claim, links its transaction and recovers a pending hash after reload. Seven faucet tests use a simulated EIP-1193 provider; UI tests cover seven viewports. The public deployment and actual backend configuration were checked separately.

## 1v1 stake selection update

The main 1v1 Duel entry shows a 1 AUSD stake option and an explicit Free 1v1 option. Both friend invitation and automatic matchmaking support stakes using the existing deployed PaidDuelEscrow. Players approve their own entries before the match locks. The result screen shows the 1.90 AUSD winner reward and payout progress; it marks payout verified only after the winner token transfer is verified. Free rooms already created remain free. Four additional Node tests and a full local-EVM browser run cover the payout display and selection/reload flow.

## Fewer wallet confirmations

Active matching wallet sessions are reused, and network switching is skipped when already correct. Players can authorize a bounded 10 AUSD spending limit for up to ten one-token entries, or choose a one-token limit. Each deposit still requires the player’s confirmation. Local-EVM browser tests verify one login signature per player and one transaction for later entries. First-time funding still needs token approval and deposit confirmations; expired or changed-account sessions still require login.
