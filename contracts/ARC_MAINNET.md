# CHOG escrows on Circle's Arc mainnet

This checkout includes an Arc mainnet deployment script for both existing escrows.
The Solidity escrows already accept any verified six-decimal ERC-20 token; the
Arc script supplies canonical USDC instead of Monad's AUSD test token. The original
escrow sources are retained so their compiler metadata stays reproducible.
The game server and browser still target Monad testnet. Deploying these contracts
does not migrate wallet login, matchmaking, faucet, or payment UI to Arc.

## Confirmed deployment

Both escrows were deployed on 2026-10-14 and their successful receipts, creation
input, runtime bytecode, roles, fee and EIP-712 domains were checked on the mainnet RPC.

| Contract | Mainnet address | Creation transaction |
| --- | --- | --- |
| PaidDuelEscrow | [`0xA6505430759EabF189b275251F72FDD357B0Abdc`](https://explorer.arc.io/address/0xA6505430759EabF189b275251F72FDD357B0Abdc) | [Transaction](https://explorer.arc.io/tx/0xcfa1f5a6780cc781213f111aaaaebacee9b812f00e6c255aeae496c90e8021d3) |
| HouseCupEscrow | [`0x38C8093907f6085e7c2Ad22335F3f4DA15466Efe`](https://explorer.arc.io/address/0x38C8093907f6085e7c2Ad22335F3f4DA15466Efe) | [Transaction](https://explorer.arc.io/tx/0x4398d615a8c37311f5eb8d764ea14669b1f805cdf4de07227a8d78adc3ce0a22) |

The combined deployment fee was `0.087863505873674975 USDC`, within the configured
`0.1 USDC` budget. The duel's immutable fee is `500` basis points (5%); its treasury
is `0xEA2d8827B331C80649353f6f28525d10bfa44796`. Settlement creates treasury credit;
`withdrawFor(duelId, treasury)` transfers that credit to the treasury wallet.

Public evidence is in [ARC_MAINNET_VALIDATION.json](../docs/ARC_MAINNET_VALIDATION.json).
Explorer source verification is pending: the Blockscout API returned a Cloudflare
challenge for both submissions. Exact standard JSON compiler inputs and encoded
constructor arguments are included in [arc-mainnet-verification/](../docs/arc-mainnet-verification/)
for manual submission in the explorer. No further transaction or gas payment is needed.
The local configuration stores both addresses as `ARC_DUEL_ESCROW_ADDRESS` and
`ARC_CUP_ESCROW_ADDRESS`. Recheck deployment without signing or spending gas:

```bash
npm --prefix server run verify:arc-mainnet
```

This verification command uses the local broadcast records and populated private
configuration. For another checkout, use the public transaction hashes and
production roles from [the migration notes](../docs/ARC_MAINNET_MIGRATION.md).

Network configuration is from the official [connection reference](https://docs.arc.io/arc/references/connect-to-arc)
and [contract address reference](https://docs.arc.io/arc/references/contract-addresses), checked on 2026-10-14:

| Setting | Value |
| --- | --- |
| Chain | Arc mainnet, `5042` |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.arc.io` |
| Payment token | USDC, `0x3600000000000000000000000000000000000000` |
| ERC-20 precision | 6 decimals |
| Native gas precision | 18 decimals |

Native and ERC-20 USDC share one underlying balance. The escrows use only ERC-20
transfers and six-decimal accounting; they expose no native sweep or admin withdrawal.
The deploy script checks chain ID, canonical token code and decimals, nonzero roles,
separate owner/signer/relay addresses, an EOA result signer, and a fee of at most 10%.
The owner may be a multisig. Treasury may equal owner.

Default duel terms: 1 USDC per player, a 2 USDC pool, 1.90 USDC for the winner and
0.10 USDC for the treasury. `ARC_DUEL_FEE_BPS` defaults to `500` and is immutable
after deployment. Cup terms: sponsor deposits 100 USDC; champion receives 70 and
runner-up 30, with no Cup fee. Cancellation, Void and expiry preserve full refunds.
Withdrawals and expiry refunds remain available while results are paused.

Gameplay truth still depends on the server result signer. The contracts are
non-upgradeable. An invalid treasury/relay configuration requires redeployment;
owner can rotate the signer for future games, but locked games retain their signer.
USDC transfer restrictions may prevent a withdrawal; a reverting transfer retains
the recipient's credit for a later retry.

## Build and configure

Run from the repository root:

```bash
npm --prefix server ci --ignore-scripts
forge build --root contracts
forge test --root contracts
cp contracts/arc-mainnet.env.example contracts/arc-mainnet.env
```

Fill the four public role addresses and `ARC_DEPLOYER_ADDRESS` in
`contracts/arc-mainnet.env`. The deployer may also be the owner and treasury.
The owner, signer and relay must be distinct. The backend
will need its signer and relay credentials separately when an Arc integration is built.

For deployment signing, fill `ARC_DEPLOYER_PRIVATE_KEY` locally with the `0x`-prefixed
private key for `ARC_DEPLOYER_ADDRESS`, or leave it blank and use a Foundry keystore
or hardware wallet. The script rejects a key that does not match the deployer address.
The populated `.env` is ignored by Git; keep its permissions at `600` and do not share
it or run shell tracing (`set -x`) while loading it. The read-only checker never reads
the private key.

```bash
set -a
source contracts/arc-mainnet.env
set +a
npm --prefix server run check:arc-mainnet
npm --prefix server run check:arc-mainnet -- --simulate-deployment
```

With no role addresses set, the check only verifies the network and token. With
roles set, it also validates them. It never broadcasts a transaction.
`--simulate-deployment` requires all four role addresses and compiled artifacts.
It executes each constructor through `eth_call` on the live RPC without persisting
state, signing, or spending gas. It does not prove the complete payment flow.

## Simulate and deploy

The deployer needs USDC for gas. Run this from `contracts/` after loading the
configuration above. Both `.env` signing and keystore signing use the same dry run:

For `.env` signing, these repository-root commands load the configuration and
redact the deployer key from Foundry logs:

```bash
npm --prefix server run simulate:arc-mainnet
# After reviewing the dry run, this command sends the two deployment transactions:
npm --prefix server run deploy:arc-mainnet
```

The commands below are the equivalent direct Foundry commands run from `contracts/`:

For a limited gas balance, set `ARC_DEPLOYMENT_BUDGET_USDC` in the local `.env` and
run `npm --prefix server run budget:arc-mainnet`. The helper estimates both
constructors on the live RPC, adds 5% gas and fee margins, and refuses a reservation
above the budget or a broadcast with insufficient deployer funds. Estimation uses
a temporary RPC balance override only; it does not fund the wallet. The Foundry
simulation runs automatically before broadcasting. The helper also checks its exact
creation input, nonce, predicted addresses and combined gas reservation before sending.

```bash
forge script script/DeployArcMainnet.s.sol:DeployArcMainnet \
  --rpc-url "$ARC_MAINNET_RPC_URL" \
  --sender "$ARC_DEPLOYER_ADDRESS"
```

This dry run simulates the two deployments without broadcasting. Review the
constructor roles, fee, estimated gas and addresses in its output before deploying.
If `ARC_DEPLOYER_PRIVATE_KEY` is filled in the local `.env`, the broadcast command is:

```bash
forge script script/DeployArcMainnet.s.sol:DeployArcMainnet \
  --rpc-url "$ARC_MAINNET_RPC_URL" \
  --sender "$ARC_DEPLOYER_ADDRESS" \
  --broadcast
```

To use a local keystore instead, leave `ARC_DEPLOYER_PRIVATE_KEY` blank. For a
configured keystore named `chog-arc-deployer`, the broadcast command is:

```bash
forge script script/DeployArcMainnet.s.sol:DeployArcMainnet \
  --rpc-url "$ARC_MAINNET_RPC_URL" \
  --account chog-arc-deployer \
  --sender "$ARC_DEPLOYER_ADDRESS" \
  --broadcast
```

The two contract creations are separate transactions. If the second fails, keep
the first address and inspect the broadcast record before retrying. Save both
addresses and transaction hashes from `contracts/broadcast/`. Confirm successful
receipts and read `token`, `owner`, `relay`, `nextSigner`, plus the duel's `treasury`
and `feeBps`, on the configured mainnet RPC.
`npm --prefix server run verify:arc-mainnet` checks these roles, the successful
receipts, confirmed creation input, runtime bytecode and EIP-712 domains, then saves
the public result to `server/deployment/arc-mainnet/deployment.json`.

For source verification, generate compiler input using the exact local build:

```bash
forge verify-contract YOUR_DUEL_ADDRESS src/PaidDuelEscrow.sol:PaidDuelEscrow \
  --chain 5042 --show-standard-json-input > duel-standard-input.json
forge verify-contract YOUR_CUP_ADDRESS src/HouseCupEscrow.sol:HouseCupEscrow \
  --chain 5042 --show-standard-json-input > cup-standard-input.json
```

Submit these to the explorer's contract verification UI with Solidity 0.8.27,
optimizer 200 runs, Cancun and via-IR enabled, and the actual constructor arguments.
Explorer verification is separate from successful deployment.

## Validation scope

`ArcMainnetDeployment.t.sol` exercises mainnet chain guards, canonical token
selection, six-decimal enforcement, role validation, fee bounds and both deployed
EIP-712 domains. The existing suites cover funding, payouts, refunds, replay
protection and withdrawal failure. They run on a standard EVM with a mock token.

Validation evidence is recorded in [ARC_MAINNET_VALIDATION.json](../docs/ARC_MAINNET_VALIDATION.json).

Arc-specific runtime behavior needs [Arc Foundry](https://docs.arc.io/arc/tutorials/porting-contracts-to-arc)
or an Arc testnet acceptance run with real USDC. Generic Foundry tests and the
read-only mainnet check do not establish that acceptance or a security audit.
