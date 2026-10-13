/* Validate the deployed instance, then request explorer verification. */
import fs from 'node:fs';
import path from 'node:path';
import {createPublicClient,defineChain,http,isAddress} from 'viem';
import {verifiedRuntime} from '../chain.mjs';

const fail=error=>{console.error(error?.shortMessage||(/https?:\/\//.test(error?.message||'')?'Instance verification failed; credentials were not printed':error?.message||'Instance verification failed'));process.exit(1);};
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);

const root=path.resolve(import.meta.dirname,'../..'),args=process.argv.slice(2);
const option=name=>{const at=args.indexOf('--'+name);return at<0?null:args[at+1];};
const directory=path.resolve(option('packet')||path.join(root,'server/deployment'));
const packet=JSON.parse(fs.readFileSync(path.join(directory,'deployment.json'))),verification=JSON.parse(fs.readFileSync(path.join(directory,'verification.json')));
const address=option('address')||packet.predictedAddress;
if(!isAddress(address||''))throw Error('Provide the deployed contract address');
if(packet.predictedAddress&&address.toLowerCase()!==packet.predictedAddress.toLowerCase())throw Error('Deployment address does not match the simulated packet');
const rpc=process.env.MONAD_TESTNET_RPC_URL||'https://testnet-rpc.monad.xyz';
const chain=defineChain({id:10143,name:'Monad testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:[rpc]}}});
const client=createPublicClient({chain,transport:http(rpc,{timeout:15000,retryCount:0})});
if(await client.getChainId()!==10143)throw Error('Verification supports Monad testnet only');
const contractName=packet.contractName||'HouseCupEscrow';if(!['HouseCupEscrow','PaidDuelEscrow'].includes(contractName))throw Error('Unknown escrow contract');
const artifact=JSON.parse(fs.readFileSync(path.join(root,`contracts/out/${contractName}.sol/${contractName}.json`)));
if(!verifiedRuntime(await client.getBytecode({address}),artifact))throw Error('Deployed runtime does not match the compiled escrow');
const checks={token:packet.token,nextSigner:packet.resultSigner,relay:packet.relay,owner:packet.owner,...(packet.kind==='duel'?{treasury:packet.treasury,feeBps:packet.feeBps}:{})};
for(const [functionName,expected] of Object.entries(checks)){
 const actual=await client.readContract({address,abi:artifact.abi,functionName});
 if(typeof expected==='number'?BigInt(actual)!==BigInt(expected):actual.toLowerCase()!==expected.toLowerCase())throw Error('Deployed '+functionName+' does not match the deployment packet');
}
const report={chainId:10143,address,instanceChecks:'PASS',compiler:verification.compilerVersion,verificationRequested:false};
if(args.includes('--submit')){
 const response=await fetch('https://agents.devnads.com/v1/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...verification,contractAddress:address}),signal:AbortSignal.timeout(60000)});
 let result;try{result=await response.json();}catch{result={message:'Verification API did not return JSON'};}
 report.verificationHttpStatus=response.status;report.verificationResponse=result;report.verificationRequested=response.ok;
 if(!response.ok){fs.writeFileSync(path.join(directory,'verification-result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});throw Error('Verification API failed; inspect verification-result.json and use the documented Sourcify fallback');}
 // A successful request is not proof every explorer has completed indexing.
 report.explorerConfirmation='Pending: inspect API results and explorer source status';
}
fs.writeFileSync(path.join(directory,'verification-result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report,null,2));
