/* Prepare unsigned Monad testnet deployment/verification data. Never signs. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createPublicClient,defineChain,http,isAddress,zeroAddress,encodeDeployData,encodeAbiParameters,encodeFunctionData,parseAbi,keccak256} from 'viem';
import {AUSD} from '../chain.mjs';
import {gasWithBuffer} from '../../online/payments.mjs';

const fail=error=>{console.error(error?.shortMessage||(/https?:\/\//.test(error?.message||'')?'Deployment preparation failed; credentials were not printed':error?.message||'Deployment preparation failed'));process.exit(1);};
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);

const root=path.resolve(import.meta.dirname,'../..'),args=process.argv.slice(2);
function option(name){const at=args.indexOf('--'+name);return at<0?null:args[at+1];}
const owner=option('owner'),signer=option('result-signer'),relay=option('relay'),caller=option('caller')||owner;
const kind=option('kind')||'cup';if(!['cup','duel'].includes(kind))throw Error('Deployment kind must be cup or duel');
const contractName=kind==='duel'?'PaidDuelEscrow':'HouseCupEscrow',treasury=option('treasury')||owner,feeBps=Number(option('fee-bps')??500);
if(kind==='duel'&&(!isAddress(treasury)||treasury.toLowerCase()===zeroAddress||!Number.isInteger(feeBps)||feeBps<0||feeBps>1000))throw Error('Provide a treasury address and fee between 0 and 1000 basis points');
for(const [name,value] of Object.entries({owner,resultSigner:signer,relay,caller}))if(!isAddress(value||'')||value.toLowerCase()===zeroAddress)throw Error(`Provide the public ${name} address; private keys are not accepted`);
if(new Set([owner,signer,relay].map(value=>value.toLowerCase())).size!==3)throw Error('Owner, result signer and relay must be separate accounts');
const artifact=JSON.parse(fs.readFileSync(path.join(root,`contracts/out/${contractName}.sol/${contractName}.json`)));
const metadata=typeof artifact.metadata==='string'?JSON.parse(artifact.metadata):artifact.metadata;
const constructorValues=kind==='duel'?[AUSD,signer,relay,treasury,feeBps,owner]:[AUSD,signer,relay,owner];
const initCode=encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode.object,args:constructorValues});
const constructorArgs=encodeAbiParameters(artifact.abi.find(entry=>entry.type==='constructor').inputs,constructorValues).slice(2);
// CreateX guards the salt. Bind it to the real EVM caller and chain; predict by
// simulating deployCreate2, rather than computing with the unguarded salt.
const salt=option('salt')||'0x'+caller.slice(2).toLowerCase()+'01'+randomBytes(11).toString('hex');
if(!/^0x[0-9a-f]{64}$/i.test(salt))throw Error('Salt must be a bytes32 hex value');
const factory='0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed';
const factoryAbi=parseAbi(['function deployCreate2(bytes32 salt,bytes initCode) payable returns (address newContract)']);
const transaction={from:caller,to:factory,data:encodeFunctionData({abi:factoryAbi,functionName:'deployCreate2',args:[salt,initCode]}),value:'0x0'};
const packet={scope:'Unsigned preparation only; no transaction broadcast or contract deployed',kind,contractName,chainId:10143,token:AUSD,owner,resultSigner:signer,relay,...(kind==='duel'?{treasury,feeBps}:{}),caller,factory,salt,initCode,initCodeHash:keccak256(initCode),predictedAddress:null,transaction};
const rpc=process.env.MONAD_TESTNET_RPC_URL||'https://testnet-rpc.monad.xyz';
if(args.includes('--simulate')){
 const chain=defineChain({id:10143,name:'Monad testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:[rpc]}}});
 const client=createPublicClient({chain,transport:http(rpc,{timeout:15000,retryCount:0})});
 if(await client.getChainId()!==10143)throw Error('Preparation supports chain 10143 only');
 const [factoryCode,tokenCode,decimals,signerCode,relayCode]=await Promise.all([
  client.getBytecode({address:factory}),client.getBytecode({address:AUSD}),
  client.readContract({address:AUSD,abi:parseAbi(['function decimals() view returns (uint8)']),functionName:'decimals'}),
  client.getBytecode({address:signer}),client.getBytecode({address:relay})
 ]);
 if(!factoryCode||!tokenCode||decimals!==6)throw Error('Factory or six-decimal AUSD testnet token could not be verified');
 if(signerCode&&signerCode!=='0x'||relayCode&&relayCode!=='0x')throw Error('This escrow requires EOA result signer and relay accounts');
 const {result}=await client.simulateContract({address:factory,abi:factoryAbi,functionName:'deployCreate2',args:[salt,initCode],account:caller});
 packet.predictedAddress=result;
 if(await client.getBytecode({address:result}))throw Error('The predicted address already has code; inspect it before redeployment');
 const estimate=await client.estimateContractGas({address:factory,abi:factoryAbi,functionName:'deployCreate2',args:[salt,initCode],account:caller});
 packet.transaction.gas='0x'+gasWithBuffer(estimate).toString(16);
 packet.simulation={status:'PASS_READONLY',estimatedGas:estimate.toString(),gasLimit:gasWithBuffer(estimate).toString(),rpcOrigin:new URL(rpc).origin};
}
const standardJsonInput=JSON.parse(execFileSync('forge',['verify-contract',packet.predictedAddress||owner,`src/${contractName}.sol:${contractName}`,'--chain','10143','--show-standard-json-input'],{cwd:path.join(root,'contracts'),encoding:'utf8',maxBuffer:20*1024*1024}));
const verification={chainId:10143,contractAddress:packet.predictedAddress,contractName:`src/${contractName}.sol:${contractName}`,compilerVersion:'v'+metadata.compiler.version,standardJsonInput,foundryMetadata:metadata,constructorArgs};
const output=path.resolve(option('output')||path.join(root,'server/deployment',kind==='duel'?'duel':''));fs.mkdirSync(output,{recursive:true,mode:0o700});
fs.writeFileSync(path.join(output,'deployment.json'),JSON.stringify(packet,null,2)+'\n',{mode:0o600});
fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(verification,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:packet.simulation?'PREPARED_AND_SIMULATED':'PREPARED_OFFLINE_REQUIRES_SIMULATION',chainId:10143,compiler:metadata.compiler.version,creationBytes:(initCode.length-2)/2,owner,resultSigner:signer,relay,caller,predictedAddress:packet.predictedAddress,gasLimit:packet.simulation?.gasLimit||null,output,verificationReady:!!packet.predictedAddress,transactionBroadcast:false},null,2));
