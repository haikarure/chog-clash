/* Read-only Arc mainnet checks. This tool never signs or sends transactions. */
import fs from 'node:fs';
import {createPublicClient, defineChain, encodeDeployData, http, isAddress, parseAbi, zeroAddress} from 'viem';

const rpc = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const token = '0x3600000000000000000000000000000000000000';
const chain = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: {name: 'USDC', symbol: 'USDC', decimals: 18},
  rpcUrls: {default: {http: [rpc]}},
});
const client = createPublicClient({chain, transport: http(rpc, {timeout: 15000, retryCount: 0})});
const tokenAbi = parseAbi(['function decimals() view returns (uint8)', 'function symbol() view returns (string)']);

try {
  if (await client.getChainId() !== chain.id) throw Error('Arc mainnet chain 5042 required');
  const [code, decimals, symbol, blockNumber, gasPrice] = await Promise.all([
    client.getBytecode({address: token}),
    client.readContract({address: token, abi: tokenAbi, functionName: 'decimals'}),
    client.readContract({address: token, abi: tokenAbi, functionName: 'symbol'}),
    client.getBlockNumber(),
    client.getGasPrice(),
  ]);
  if (!code || code === '0x' || decimals !== 6 || symbol !== 'USDC') {
    throw Error('Canonical six-decimal USDC could not be verified');
  }

  const roles = Object.fromEntries(['OWNER', 'RESULT_SIGNER', 'RELAY', 'TREASURY'].map(role =>
    [role, process.env[`ARC_${role}_ADDRESS`] || null]));
  const configured = Object.values(roles).some(Boolean);
  if (configured) {
    for (const [role, address] of Object.entries(roles)) {
      if (!isAddress(address || '') || address.toLowerCase() === zeroAddress) throw Error(`Provide a nonzero ARC_${role}_ADDRESS`);
    }
    if (new Set([roles.OWNER, roles.RESULT_SIGNER, roles.RELAY].map(address => address.toLowerCase())).size !== 3) {
      throw Error('Owner, result signer and relay must differ');
    }
    const signerCode = await client.getBytecode({address: roles.RESULT_SIGNER});
    if (signerCode && signerCode !== '0x') throw Error('Result signer must be an EOA');
  }
  const feeBps = Number(process.env.ARC_DUEL_FEE_BPS || 500);
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) throw Error('Fee must be between 0 and 1000 basis points');
  const deployer = process.env.ARC_DEPLOYER_ADDRESS || null;
  if (deployer && (!isAddress(deployer) || deployer.toLowerCase() === zeroAddress)) {
    throw Error('Provide a nonzero ARC_DEPLOYER_ADDRESS');
  }
  const deployerGasBalance = deployer ? (await client.getBalance({address: deployer})).toString() : null;
  const constructorSimulation = [];
  if (process.argv.includes('--simulate-deployment')) {
    if (!configured) throw Error('Configure all public role addresses before simulating deployment');
    for (const [name, args] of [
      ['PaidDuelEscrow', [token, roles.RESULT_SIGNER, roles.RELAY, roles.TREASURY, feeBps, roles.OWNER]],
      ['HouseCupEscrow', [token, roles.RESULT_SIGNER, roles.RELAY, roles.OWNER]],
    ]) {
      const artifact = JSON.parse(fs.readFileSync(new URL(`../../contracts/out/${name}.sol/${name}.json`, import.meta.url)));
      const data = encodeDeployData({abi: artifact.abi, bytecode: artifact.bytecode.object, args});
      // eth_call executes contract creation on the RPC without persisting state or paying gas.
      const result = await client.call({data, gas: 15_000_000n, blockNumber});
      if (!result.data || result.data === '0x') throw Error(`${name} constructor returned no runtime code`);
      constructorSimulation.push({contract: name, status: 'PASS_READONLY', runtimeBytes: (result.data.length - 2) / 2});
    }
  }
  console.log(JSON.stringify({
    status: 'NETWORK_VERIFIED', chainId: chain.id, token, tokenDecimals: decimals,
    nativeGasDecimals: 18, blockNumber: blockNumber.toString(), gasPrice: gasPrice.toString(),
    rolesConfigured: configured, roles, deployer, deployerGasBalance, feeBps, constructorSimulation, transactionBroadcast: false,
  }, null, 2));
} catch (error) {
  // RPC errors can contain provider credentials. Use a generic message for provider failures.
  console.error(error?.shortMessage ? 'Arc RPC check failed; verify RPC connectivity and access.' : error.message);
  process.exitCode = 1;
}
