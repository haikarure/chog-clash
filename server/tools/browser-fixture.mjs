// Development-only real EVM fixture. No private keys leave this process.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import httpNode from 'node:http';
import {spawn} from 'node:child_process';
import {createPublicClient,createWalletClient,defineChain,http} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
import {startServer} from '../app.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const root=path.resolve(import.meta.dirname,'../..');
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const child=spawn('anvil',['--silent','--port',String(port),'--chain-id','31337'],{stdio:'ignore'});
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'chog-browser-'));
const accounts=Array.from({length:10},(_,addressIndex)=>mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex}));
const rpc=`http://127.0.0.1:${port}`,chain=defineChain({id:31337,name:'Local mock',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:[rpc]}}});
const client=createPublicClient({chain,transport:http(rpc,{retryCount:0})});
let server,bridge;
try{
 for(let i=0;;i++){try{if(await client.getChainId()===31337)break;}catch{}if(i>100)throw Error('Anvil not ready');await sleep(100);}
 const wallets=accounts.map(account=>createWalletClient({account,chain,transport:http(rpc)}));
 const artifact=name=>JSON.parse(fs.readFileSync(path.join(root,'contracts/out',name)));
 const deploy=async(a,args=[])=>{const r=await client.waitForTransactionReceipt({hash:await wallets[0].deployContract({abi:a.abi,bytecode:a.bytecode.object,args})});if(r.status!=='success')throw Error('Fixture deployment failed');return r.contractAddress;};
 const tokenArtifact=artifact('HouseCupEscrow.t.sol/MockToken.json'),token=await deploy(tokenArtifact);
 const cup=await deploy(artifact('HouseCupEscrow.sol/HouseCupEscrow.json'),[token,accounts[8].address,accounts[9].address,accounts[0].address]);
 const duel=await deploy(artifact('PaidDuelEscrow.sol/PaidDuelEscrow.json'),[token,accounts[8].address,accounts[9].address,accounts[0].address,500,accounts[0].address]);
 for(const a of accounts.slice(1,7))await client.waitForTransactionReceipt({hash:await wallets[0].writeContract({address:token,abi:tokenArtifact.abi,functionName:'mint',args:[a.address,500000000n]})});
 server=await startServer({port:0,dbPath:path.join(directory,'browser.sqlite'),env:{CHAIN_MODE:'local-mock',MONAD_TESTNET_RPC_URL:rpc,LOCAL_MOCK_TOKEN:token,CUP_ESCROW_ADDRESS:cup,DUEL_ESCROW_ADDRESS:duel,DUEL_TREASURY_ADDRESS:accounts[0].address,DUEL_FEE_BPS:'500',RESULT_SIGNER_PRIVATE_KEY:'0x'+Buffer.from(accounts[8].getHdKey().privateKey).toString('hex'),RELAY_PRIVATE_KEY:'0x'+Buffer.from(accounts[9].getHdKey().privateKey).toString('hex')}});
 const stats={transactions:[],methods:{}};
 const allowedContracts=new Set([token,cup,duel].map(a=>a.toLowerCase()));
 bridge=httpNode.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  try{
   if(req.method==='GET'&&req.url==='/stats')return res.end(JSON.stringify(stats));
   if(req.method!=='POST'||!/^\/wallet\/[0-5]$/.test(req.url))throw Error('Fixture RPC only');
   const index=Number(req.url.split('/').at(-1))+1,account=accounts[index];let body='';for await(const part of req){body+=part;if(body.length>12000)throw Error('Too much data');}
   const {method,params=[]}=JSON.parse(body),key=index+':'+method;stats.methods[key]=(stats.methods[key]||0)+1;let result;
   if(['eth_accounts','eth_requestAccounts'].includes(method))result=[account.address];
   else if(method==='eth_chainId')result='0x7a69';
   else if(method==='wallet_switchEthereumChain'){if(BigInt(params[0].chainId)!==31337n)throw Error('Fixture cannot use another chain');result=null;}
   else if(method==='personal_sign'){if(params[1].toLowerCase()!==account.address.toLowerCase())throw Error('Wrong fixture signer');result=await account.signMessage({message:{raw:params[0]}});}
   else if(method==='eth_sendTransaction'){
    const tx=params[0];if(tx.from?.toLowerCase()!==account.address.toLowerCase()||!allowedContracts.has(tx.to?.toLowerCase())||!tx.gas)throw Error('Invalid fixture transaction');
    result=await wallets[index].sendTransaction({to:tx.to,data:tx.data,value:BigInt(tx.value||0),gas:BigInt(tx.gas)});stats.transactions.push({player:index-1,hash:result,to:tx.to,gas:tx.gas});
   }else if(['eth_estimateGas','eth_gasPrice','eth_getTransactionReceipt','eth_getBalance','eth_call'].includes(method))result=await client.request({method,params});
   else throw Error('Unsupported fixture method');
   res.end(JSON.stringify({result},(_,v)=>typeof v==='bigint'?'0x'+v.toString(16):v));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.shortMessage||'Fixture request failed'}));}
 });
 await new Promise(resolve=>bridge.listen(0,'127.0.0.1',resolve));
 const config={base:`http://localhost:${server.port}`,bridge:`http://127.0.0.1:${bridge.address().port}`,chainId:31337,wallets:accounts.slice(1,7).map(a=>a.address)};
 const output=process.argv[2];if(output)fs.writeFileSync(output,JSON.stringify(config),{mode:0o600});console.log(JSON.stringify(config));
 await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
}finally{if(bridge)await new Promise(resolve=>bridge.close(resolve));if(server)await server.close();child.kill('SIGTERM');fs.rmSync(directory,{recursive:true,force:true});}
