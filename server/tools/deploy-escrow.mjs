/* Monad testnet deployment helper. Reads secrets only from environment; never prints them. */
import fs from 'node:fs';
import {createPublicClient,createWalletClient,defineChain,http,isAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {AUSD} from '../chain.mjs';
const env=process.env;
if(!env.DEPLOYER_PRIVATE_KEY||!env.RESULT_SIGNER_PRIVATE_KEY||!env.RELAY_PRIVATE_KEY)throw Error('Configure DEPLOYER_PRIVATE_KEY, RESULT_SIGNER_PRIVATE_KEY and RELAY_PRIVATE_KEY in the local .env. Do not send keys in chat.');
const accounts=[env.DEPLOYER_PRIVATE_KEY,env.RESULT_SIGNER_PRIVATE_KEY,env.RELAY_PRIVATE_KEY].map(key=>privateKeyToAccount(key));
if(new Set(accounts.map(a=>a.address)).size!==3)throw Error('Deployer, result signer and relay must be separate accounts');
const chain=defineChain({id:10143,name:'Monad testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:[env.MONAD_TESTNET_RPC_URL||'https://testnet-rpc.monad.xyz']}}});
const transport=http(chain.rpcUrls.default.http[0]),publicClient=createPublicClient({chain,transport}),wallet=createWalletClient({chain,transport,account:accounts[0]});
if(await publicClient.getChainId()!==10143)throw Error('Deployment supports Monad testnet chain 10143 only');
const code=await publicClient.getBytecode({address:AUSD});if(!code)throw Error('AUSD test token has no code on this RPC');
const artifact=JSON.parse(fs.readFileSync(new URL('../../contracts/out/HouseCupEscrow.sol/HouseCupEscrow.json',import.meta.url)));
const owner=env.CONTRACT_OWNER_ADDRESS||accounts[0].address;if(!isAddress(owner))throw Error('Invalid contract owner address');
const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object,args:[AUSD,accounts[1].address,accounts[2].address,owner]});
const receipt=await publicClient.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error('Contract deployment failed');
console.log(JSON.stringify({chainId:10143,token:AUSD,contract:receipt.contractAddress,transactionHash:hash,owner,resultSigner:accounts[1].address,relay:accounts[2].address},null,2));
