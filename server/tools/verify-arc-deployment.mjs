/* Read-only checks of the exact Arc deployment plan and confirmed contracts. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPublicClient, encodeDeployData, formatEther, getContractAddress, http, isAddress, parseEther, zeroAddress} from 'viem';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'server/deployment/arc-mainnet');
const token = '0x3600000000000000000000000000000000000000';
const equalAddress = (a, b) => a?.toLowerCase() === b?.toLowerCase();
function requireCheck(condition, message) { if (!condition) throw Error(message); }
function save(name, report) {
  fs.mkdirSync(output, {recursive: true, mode: 0o700});
  fs.writeFileSync(path.join(output, name), JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
}
function runtimeMatches(code, artifact) {
  if (!code || code === '0x') return false;
  const expected = Buffer.from(artifact.deployedBytecode.object.replace(/^0x/, ''), 'hex');
  const actual = Buffer.from(code.slice(2), 'hex');
  if (expected.length !== actual.length) return false;
  for (const refs of Object.values(artifact.deployedBytecode.immutableReferences || {})) {
    for (const {start, length} of refs) {
      actual.fill(0, start, start + length);
      expected.fill(0, start, start + length);
    }
  }
  return expected.equals(actual);
}

export async function verifyArcDeployment({plan = false, feeCap} = {}) {
  const deployer = process.env.ARC_DEPLOYER_ADDRESS;
  const roles = Object.fromEntries(['OWNER', 'RESULT_SIGNER', 'RELAY', 'TREASURY'].map(name => [name, process.env[`ARC_${name}_ADDRESS`]]));
  for (const address of [deployer, ...Object.values(roles)]) {
    requireCheck(isAddress(address || '') && !equalAddress(address, zeroAddress), 'Valid deployer and role addresses required');
  }
  const feeBps = Number(process.env.ARC_DUEL_FEE_BPS || 500);
  const budget = parseEther(process.env.ARC_DEPLOYMENT_BUDGET_USDC || '0.1');
  const recordPath = path.join(root, `contracts/broadcast/DeployArcMainnet.s.sol/5042/${plan ? 'dry-run/' : ''}run-latest.json`);
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  requireCheck(Number(record.chain) === 5042 && record.transactions.length === 2, 'Expected exactly two Arc mainnet deployments');
  const client = createPublicClient({transport: http(process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io', {timeout: 15000, retryCount: 0})});
  requireCheck(await client.getChainId() === 5042, 'Arc mainnet chain 5042 required');
  const [balance, latestNonce, pendingNonce, blockNumber] = await Promise.all([
    client.getBalance({address: deployer}),
    client.getTransactionCount({address: deployer, blockTag: 'latest'}),
    client.getTransactionCount({address: deployer, blockTag: 'pending'}),
    client.getBlockNumber(),
  ]);
  const budgetReport = JSON.parse(fs.readFileSync(path.join(output, 'budget.json'), 'utf8'));
  const maximumFee = feeCap ?? BigInt(budgetReport.maxFeePerGasWei);
  let reserved = 0n;
  let totalPaid = 0n;
  const contracts = [];
  const names = ['PaidDuelEscrow', 'HouseCupEscrow'];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const item = record.transactions[i];
    const tx = item.transaction;
    const artifact = JSON.parse(fs.readFileSync(path.join(root, `contracts/out/${name}.sol/${name}.json`), 'utf8'));
    const args = i === 0 ? [token, roles.RESULT_SIGNER, roles.RELAY, roles.TREASURY, feeBps, roles.OWNER] : [token, roles.RESULT_SIGNER, roles.RELAY, roles.OWNER];
    const expectedInput = encodeDeployData({abi: artifact.abi, bytecode: artifact.bytecode.object, args});
    requireCheck(item.contractName === name && item.transactionType === 'CREATE', 'Unexpected deployment transaction');
    requireCheck(equalAddress(tx.from, deployer) && !tx.to && BigInt(tx.value) === 0n && Number(tx.chainId) === 5042, 'Unexpected sender, value or chain');
    requireCheck(tx.input.toLowerCase() === expectedInput.toLowerCase(), `${name} creation bytecode or constructor arguments differ`);
    const nonce = BigInt(tx.nonce);
    const address = getContractAddress({from: deployer, nonce});
    requireCheck(equalAddress(item.contractAddress, address), `${name} predicted address differs`);
    requireCheck(BigInt(tx.gas) > 0n, 'Missing transaction gas limit');
    reserved += BigInt(tx.gas) * maximumFee;
    if (plan) {
      requireCheck(latestNonce === pendingNonce && nonce === BigInt(pendingNonce + i), 'Nonce changed or pending transaction exists; simulate again');
      const code = await client.getBytecode({address});
      requireCheck(!code || code === '0x', `${name} already has code; inspect prior receipts before retrying`);
      contracts.push({contract: name, address, nonce: nonce.toString(), gasLimit: BigInt(tx.gas).toString()});
      continue;
    }
    requireCheck(/^0x[0-9a-f]{64}$/i.test(item.hash || ''), `${name} has no broadcast hash`);
    const [receipt, minedTx, code] = await Promise.all([
      client.getTransactionReceipt({hash: item.hash}),
      client.getTransaction({hash: item.hash}),
      client.getBytecode({address}),
    ]);
    requireCheck(receipt.status === 'success' && equalAddress(receipt.contractAddress, address), `${name} deployment receipt is not successful`);
    requireCheck(equalAddress(minedTx.from, deployer) && !minedTx.to && minedTx.value === 0n && minedTx.input.toLowerCase() === expectedInput.toLowerCase(), `${name} confirmed creation transaction differs`);
    requireCheck((minedTx.maxFeePerGas ?? minedTx.gasPrice) <= maximumFee, `${name} fee cap exceeded the reviewed plan`);
    requireCheck(runtimeMatches(code, artifact), `${name} runtime does not match the compiled artifact`);
    const fields = ['token', 'owner', 'relay', 'nextSigner', 'nextSignerEpoch', 'paused', 'eip712Domain', 'POOL', ...(i === 0 ? ['treasury', 'feeBps', 'ENTRY'] : ['CHAMPION_AWARD', 'RUNNER_UP_AWARD'])];
    const values = await Promise.all(fields.map(functionName => client.readContract({address, abi: artifact.abi, functionName})));
    const state = Object.fromEntries(fields.map((field, index) => [field, values[index]]));
    for (const [field, expected] of Object.entries({token, owner: roles.OWNER, relay: roles.RELAY, nextSigner: roles.RESULT_SIGNER, ...(i === 0 ? {treasury: roles.TREASURY} : {})})) {
      requireCheck(equalAddress(state[field], expected), `${name} ${field} differs from configuration`);
    }
    requireCheck(Number(state.nextSignerEpoch) === 1 && state.paused === false, `${name} initial signer epoch or pause state differs`);
    const domainName = i === 0 ? 'CHOG Paid Duel' : 'CHOG House Cup';
    const domain = state.eip712Domain;
    requireCheck(domain[1] === domainName && domain[2] === '1' && domain[3] === 5042n && equalAddress(domain[4], address), `${name} EIP-712 domain differs`);
    if (i === 0) {
      requireCheck(Number(state.feeBps) === feeBps && state.ENTRY === 1_000_000n && state.POOL === 2_000_000n, 'Duel fee or pool differs');
    } else {
      requireCheck(state.POOL === 100_000_000n && state.CHAMPION_AWARD === 70_000_000n && state.RUNNER_UP_AWARD === 30_000_000n, 'Cup awards differ');
    }
    const paid = receipt.gasUsed * receipt.effectiveGasPrice;
    totalPaid += paid;
    contracts.push({contract: name, address, transactionHash: item.hash, blockNumber: receipt.blockNumber.toString(),
      receiptStatus: receipt.status, gasUsed: receipt.gasUsed.toString(), effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
      feeUSDC: formatEther(paid), runtimeBytes: (code.length - 2) / 2, runtimeMatchesArtifact: true,
      configurationVerified: true, eip712DomainVerified: true,
      explorer: `https://explorer.arc.io/address/${address}`});
  }
  requireCheck(reserved <= budget, 'Exact transaction reservation exceeds the configured budget');
  if (plan) requireCheck(balance >= reserved, 'Deployer balance cannot cover the exact transaction reservation');
  else requireCheck(totalPaid <= budget, 'Actual deployment fee exceeds the configured budget');
  const report = {checkedAt: new Date().toISOString(), status: plan ? 'PLAN_VERIFIED' : 'DEPLOYMENT_VERIFIED', chainId: 5042,
    blockNumber: blockNumber.toString(), deployer, roles, token, feeBps, budgetUSDC: formatEther(budget),
    maximumReservedUSDC: formatEther(reserved), deployerBalanceUSDC: formatEther(balance),
    ...(!plan ? {totalDeploymentFeeUSDC: formatEther(totalPaid)} : {}), contracts, transactionBroadcast: !plan};
  save(plan ? 'preflight.json' : 'deployment.json', report);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  try {
    console.log(JSON.stringify(await verifyArcDeployment({plan: process.argv.includes('--plan')}), null, 2));
  } catch (error) {
    // Provider errors can contain URLs with credentials. Print only local validation errors.
    console.error(error?.shortMessage ? 'Arc RPC verification failed; check connectivity and existing broadcast receipts.' : error.message);
    process.exitCode = 1;
  }
}
