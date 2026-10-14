/* Run Foundry without exposing deployer credentials in terminal output. */
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createPublicClient, defineChain, encodeDeployData, formatEther, http, isAddress, parseEther, zeroAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {verifyArcDeployment} from './verify-arc-deployment.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const broadcast = process.argv.includes('--broadcast');
const deployer = process.env.ARC_DEPLOYER_ADDRESS;
const key = process.env.ARC_DEPLOYER_PRIVATE_KEY;
const rpc = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const output = path.join(root, 'server/deployment/arc-mainnet');
const checkBudget = process.argv.includes('--check-budget');
const budgetUSDC = process.env.ARC_DEPLOYMENT_BUDGET_USDC || (checkBudget || broadcast ? '0.1' : null);
process.umask(0o077);

async function estimateBudget() {
  const chain = defineChain({id: 5042, name: 'Arc', nativeCurrency: {name: 'USDC', symbol: 'USDC', decimals: 18}, rpcUrls: {default: {http: [rpc]}}});
  const client = createPublicClient({chain, transport: http(rpc, {timeout: 15000, retryCount: 0})});
  if (await client.getChainId() !== 5042) throw Error('Arc mainnet chain 5042 required');
  const [balance, gasPrice, block] = await Promise.all([
    client.getBalance({address: deployer}), client.getGasPrice(), client.getBlock(),
  ]);
  const feeCap = (gasPrice * 105n + 99n) / 100n;
  const priorityFee = gasPrice > (block.baseFeePerGas || gasPrice) ? gasPrice - block.baseFeePerGas : 0n;
  const token = '0x3600000000000000000000000000000000000000';
  const signer = process.env.ARC_RESULT_SIGNER_ADDRESS;
  const relay = process.env.ARC_RELAY_ADDRESS;
  const owner = process.env.ARC_OWNER_ADDRESS;
  const treasury = process.env.ARC_TREASURY_ADDRESS;
  const feeBps = Number(process.env.ARC_DUEL_FEE_BPS || 500);
  const deployments = await Promise.all([
    ['PaidDuelEscrow', [token, signer, relay, treasury, feeBps, owner]],
    ['HouseCupEscrow', [token, signer, relay, owner]],
  ].map(async ([name, args]) => {
    const artifact = JSON.parse(fs.readFileSync(path.join(root, `contracts/out/${name}.sol/${name}.json`)));
    const data = encodeDeployData({abi: artifact.abi, bytecode: artifact.bytecode.object, args});
    // Only the estimation call uses a virtual balance; the live balance above is unchanged.
    const estimate = await client.estimateGas({account: deployer, data, gasPrice, blockNumber: block.number,
      stateOverride: [{address: deployer, balance: parseEther('1')}],
    });
    return {name, estimate, gasLimit: (estimate * 105n + 99n) / 100n};
  }));
  const expected = deployments.reduce((total, item) => total + item.estimate * gasPrice, 0n);
  const maximum = deployments.reduce((total, item) => total + item.gasLimit * feeCap, 0n);
  const budget = parseEther(budgetUSDC);
  const report = {checkedAt: new Date().toISOString(), chainId: 5042, deployer, budgetUSDC,
    deployerBalanceUSDC: formatEther(balance), estimatedCostUSDC: formatEther(expected),
    maximumReservedUSDC: formatEther(maximum), fitsBudget: maximum <= budget, walletFunded: balance >= maximum,
    gasEstimateMultiplier: 105, maxFeePerGasWei: feeCap.toString(), maxPriorityFeePerGasWei: priorityFee.toString(),
    deployments: deployments.map(item => ({contract: item.name, estimatedGas: item.estimate.toString(), gasLimit: item.gasLimit.toString()})),
    transactionBroadcast: false};
  fs.mkdirSync(output, {recursive: true, mode: 0o700});
  fs.writeFileSync(path.join(output, 'budget.json'), JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
  console.log(JSON.stringify(report, null, 2));
  if (maximum > budget) throw Error('Estimated deployment reservation exceeds the configured USDC budget');
  if (broadcast && balance < maximum) throw Error('Deployer wallet needs USDC before broadcasting');
  return {feeCap, priorityFee};
}

function redact(value) {
  let result = value || '';
  if (key) {
    result = result.replace(new RegExp(key.replace(/^0x/i, ''), 'gi'), '[PRIVATE_KEY_REDACTED]');
    try { result = result.replaceAll(BigInt(key).toString(), '[PRIVATE_KEY_REDACTED]'); } catch {}
  }
  return result.replaceAll(rpc, '[ARC_RPC]');
}

async function runForge(args, mode) {
  let stdout = '', stderr = '', exitCode = 0;
  try {
    ({stdout, stderr} = await promisify(execFile)('forge', args, {
      cwd: path.join(root, 'contracts'), env: process.env, timeout: 180_000, maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (error) {
    stdout = error.stdout || '';
    stderr = error.stderr || '';
    exitCode = typeof error.code === 'number' ? error.code : 1;
  }
  const safeOutput = redact(stdout + '\n' + stderr);
  fs.mkdirSync(output, {recursive: true, mode: 0o700});
  const log = path.join(output, mode === 'BROADCAST' ? 'broadcast.log' : 'dry-run.log');
  fs.writeFileSync(log, safeOutput, {mode: 0o600});
  console.log(JSON.stringify({mode, exitCode, log, credentialsPrinted: false}));
  for (const line of safeOutput.split('\n')) {
    if (/^(Script ran|Gas used:|duel:|cup:|Chain |Estimated |Error:|Warning:|ONCHAIN EXECUTION)/.test(line.trim())) {
      console.log(line.slice(0, 500));
    }
  }
  return exitCode;
}

try {
  if (!isAddress(deployer || '') || deployer.toLowerCase() === zeroAddress) throw Error('Configure a valid ARC_DEPLOYER_ADDRESS');
  if (!/^0x[0-9a-f]{64}$/i.test(key || '')) throw Error('Configure the deployer private key locally for this helper');
  let account;
  try { account = privateKeyToAccount(key); } catch { throw Error('Deployer private key is invalid'); }
  if (account.address.toLowerCase() !== deployer.toLowerCase()) throw Error('Private key does not match deployer address');
  const budgetFees = budgetUSDC ? await estimateBudget() : null;
  if (checkBudget) process.exit(0);
  const args = ['script', 'script/DeployArcMainnet.s.sol:DeployArcMainnet', '--rpc-url', rpc, '--sender', deployer];
  if (budgetFees) args.push('--gas-estimate-multiplier', '105', '--with-gas-price', budgetFees.feeCap.toString(), '--priority-gas-price', budgetFees.priorityFee.toString());
  if (broadcast) {
    if (await runForge(args, 'DRY_RUN') !== 0) throw Error('Pre-broadcast Foundry simulation failed; no deployment sent');
    const plan = await verifyArcDeployment({plan: true, feeCap: budgetFees.feeCap});
    console.log(JSON.stringify({status: plan.status, maximumReservedUSDC: plan.maximumReservedUSDC, contracts: plan.contracts}));
    args.push('--broadcast', '--slow');
  }
  process.exitCode = await runForge(args, broadcast ? 'BROADCAST' : 'DRY_RUN');
} catch (error) {
  if (error?.shortMessage) {
    fs.mkdirSync(output, {recursive: true, mode: 0o700});
    const log = path.join(output, 'runner-error.log');
    fs.writeFileSync(log, redact(error.message), {mode: 0o600});
    console.error(`Arc RPC request failed; sanitized details: ${log}`);
  } else {
    console.error(redact(error.message));
  }
  process.exitCode = 1;
}
