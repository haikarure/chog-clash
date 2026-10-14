# Switch game settlement from Monad testnet to Arc mainnet

The Arc contracts are already deployed. Use the existing addresses below when
switching the game; deployment is complete and no replacement deployment is needed.
The current backend/browser integration still uses Monad testnet. This document
records the remaining integration work for the developer handling that change.

## Production contract configuration

| Setting | Value |
| --- | --- |
| Chain ID | `5042` (`0x13b2`) |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.arc.io` |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` |
| Payment decimals | `6` |
| Native USDC gas decimals | `18` |
| PaidDuelEscrow | `0xA6505430759EabF189b275251F72FDD357B0Abdc` |
| HouseCupEscrow | `0x38C8093907f6085e7c2Ad22335F3f4DA15466Efe` |
| Owner | `0xd52e8a92937826e9874A0B972de01Ae5FA6D6c79` |
| Result signer | `0xE3D7014A9DC4B3D1d89ACF6ECFfB713155217990` |
| Relay | `0x0950E77E0c108E8442351f9cEBD9695499b5C357` |
| Duel treasury | `0xEA2d8827B331C80649353f6f28525d10bfa44796` |
| Duel fee | `500` basis points (5%), immutable |

Both escrows use the existing Solidity sources and ABI. Duel terms are 1 USDC per
player, a 2 USDC pool, winner 1.90 USDC and treasury 0.10 USDC. Cup terms are a
100 USDC sponsor pool and 70/30 USDC prizes, with no Cup fee. Treasury settlement
creates a credit that must be transferred using `withdrawFor(duelId, treasury)`.

EIP-712 domains are `CHOG Paid Duel` and `CHOG House Cup`, version `1`, chain
`5042`, with the respective Arc escrow address as `verifyingContract`. The signer
epoch starts at `1`; locked games retain their signer when the owner rotates it.

Public deployment receipts, roles and bytecode checks are recorded in
[ARC_MAINNET_VALIDATION.json](ARC_MAINNET_VALIDATION.json). The addresses and
transaction links are also in the [deployment guide](../contracts/ARC_MAINNET.md).

## Integration files

| File | Work needed |
| --- | --- |
| `server/chain.mjs` | Introduce explicit Arc mainnet configuration for chain, RPC, USDC, native gas and prize enablement. Current nonlocal defaults are Monad `10143`, AUSD and `ENABLE_TESTNET_PRIZES`. Preserve runtime/role/decimal verification. |
| `server/paid-duels.mjs` | Configure the Arc duel address, expected treasury and fee. It shares the chain's RPC, signer and relay. Update test-token wording and keep receipt/Transfer checks. |
| `server/.env.example` | Document Arc backend settings and role secrets separately from deployment signing. Changing only escrow addresses will leave the current chain guard on Monad. |
| `server/auth.mjs`, `server/app.mjs` | Verify SIWE uses Arc chain `5042`; routes already pass `chain.chainId`. Update Monad defaults and keep signature/session checks. |
| `online/payments.mjs` | Support adding Arc to wallets with USDC native gas metadata. Keep transaction account/chain checks and bounded token approvals. Disable the Monad AUSD faucet on mainnet. |
| `online/wallet-session.mjs` | Read Arc chain configuration and avoid a fallback to Monad for production wallet login. |
| `online/client.mjs` | Replace Monad transaction links, AUSD/testnet labels and MON gas text with Arc/USDC. Remove mainnet faucet prompts. |
| `server/store.mjs`, `server/funding-recovery.mjs` | Check persisted modes, chain IDs, funding journals and outbox jobs during the network switch. Old Monad jobs and signed/raw transactions belong to their original chain and contracts. |

Expose chain/token/explorer information consistently through `/api/config` so the
browser, login, funding, result display and claim flow agree on the network. Native
and ERC-20 USDC share one underlying balance on Arc; use the token's six-decimal
units for payments and 18-decimal native units for gas, without double-counting funds.

The backend needs the private keys corresponding to the deployed result signer
and relay above, stored through the host's private environment or secret manager.
Those keys are not in Git. The deployment key is a separate credential and is not
needed for gameplay. Fund the relay with native USDC to pay for its transactions.
Do not generate replacement role addresses silently: the relay is immutable and
the owner must authorize a signer rotation.

## Verification and acceptance

Local Solidity validation passed 49 tests, including funding, refunds, replay
protection and deployment guards. Read-only mainnet checks confirmed the creation
transactions, deployed runtime, roles, fee and EIP-712 domains. These checks do not
establish full payment acceptance on Arc or an independent security audit.

Source publication is pending because the explorer API returned a Cloudflare
challenge. Exact compiler inputs and encoded constructor arguments are included
in [arc-mainnet-verification/](arc-mainnet-verification/). Use Solidity
`0.8.27+commit.40a35a09`, optimizer 200 runs, Cancun and via-IR. Publishing source
does not require redeploying or spending gas.

For integration acceptance, cover wallet login/network addition, approval and
deposit, signed settlement, winner/treasury withdrawals, cancellation/refunds,
pending transaction recovery, reloads and rejection of the wrong chain. Confirm
receipts and actual USDC Transfer events before reporting a payment as complete.
The Cup contract requires a real 100 USDC sponsor deposit for a funded Cup; the
deployment gas balance does not establish that funding.

Keep old Monad settlements accessible on their original chain until handled.
Balances, allowances, credits, match state and signatures do not move automatically
when the application switches to the Arc addresses.
