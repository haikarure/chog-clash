// Testnet browser acceptance: simulated players use ephemeral fixture EOAs.
// The owner's agent wallet continues to sign remotely through Alchemy.
import fs from 'node:fs';
import httpNode from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createPublicClient,createWalletClient,defineChain,http,parseAbi} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
const run=promisify(execFile),rpc=process.env.MONAD_TESTNET_RPC_URL;
if(process.env.CHAIN_MODE!=='testnet'||!rpc)throw Error('Explicit testnet configuration required');
const base='https://chog-clash-two.vercel.app',config=await(await fetch(base+'/api/config')).json();
if(!config.paidDuel?.enabled||config.paidDuel.chainId!==10143)throw Error('Public paid testnet service is not enabled');
const chain=defineChain({id:10143,name:'Monad testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:[rpc]}}});
const client=createPublicClient({chain,transport:http(rpc,{timeout:10000,retryCount:0})});
if(await client.getChainId()!==10143)throw Error('Wrong fixture chain');
const token=config.paidDuel.token,allowed=new Set([token,config.paidDuel.contract,config.settlement.contract].map(a=>a.toLowerCase()));
const env={...process.env,ALCHEMY_CONFIG:process.env.ALCHEMY_CONFIG||'/home/haikaru/.local/share/chog-alchemy-cli/config.json'};
const ownerStatus=JSON.parse((await run('alchemy',['--json','--no-interactive','wallet','status','--verify'],{env,timeout:20000})).stdout);
if(!ownerStatus.valid||ownerStatus.walletAddress?.toLowerCase()!==process.env.CONTRACT_OWNER_ADDRESS?.toLowerCase())throw Error('Verified owner remote session required');
const accounts=Array.from({length:3},()=>privateKeyToAccount(generatePrivateKey())),wallets=accounts.map(account=>createWalletClient({chain,account,transport:http(rpc)}));
for(const p of accounts.slice(0,2)){
 const r=await fetch('https://agents.devnads.com/v1/faucet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chainId:10143,address:p.address}),signal:AbortSignal.timeout(30000)}),f=await r.json();
 if(!r.ok||!f.txHash)throw Error('Player test MON faucet unavailable');await client.waitForTransactionReceipt({hash:f.txHash});
 const transfer=JSON.parse((await run('alchemy',['--json','--no-interactive','evm','contract','call',token,'transfer(address,uint256)','--args',JSON.stringify([p.address,'5000000']),'--signer','session','-n','monad-testnet'],{env,timeout:60000,maxBuffer:1024*1024})).stdout);
 if((await client.waitForTransactionReceipt({hash:transfer.txHash})).status!=='success')throw Error('Fixture tokens not funded');
}
const stats={transactions:[],methods:{}};
const bridge=httpNode.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 try{
  if(req.headers.origin)throw Error('Only local acceptance harness calls are allowed');
  if(req.method==='GET'&&req.url==='/stats')return res.end(JSON.stringify(stats));
  if(req.method!=='POST'||!/^\/wallet\/[0-2]$/.test(req.url))throw Error('Fixture RPC only');
  const i=Number(req.url.split('/').at(-1)),a=accounts[i];let text='';for await(const b of req){text+=b;if(text.length>12000)throw Error('Request too large');}
  const{method,params=[]}=JSON.parse(text),key=i+':'+method;stats.methods[key]=(stats.methods[key]||0)+1;let result;
  if(['eth_accounts','eth_requestAccounts'].includes(method))result=[a.address];
  else if(method==='eth_chainId')result='0x279f';
  else if(method==='wallet_switchEthereumChain'){if(BigInt(params[0].chainId)!==10143n)throw Error('Testnet only');result=null;}
  else if(method==='personal_sign'){if(params[1].toLowerCase()!==a.address.toLowerCase())throw Error('Wrong simulated player');result=await a.signMessage({message:{raw:params[0]}});}
  else if(method==='eth_sendTransaction'){
   const t=params[0];if(t.from?.toLowerCase()!==a.address.toLowerCase()||!allowed.has(t.to?.toLowerCase())||!t.gas||BigInt(t.value||0)!==0n||BigInt(t.gas)>30000000n)throw Error('Invalid testnet transaction');
   if(stats.transactions.filter(t=>t.player===i).length>=10)throw Error('Fixture transaction budget reached');
   result=await wallets[i].sendTransaction({to:t.to,data:t.data,value:0n,gas:BigInt(t.gas)});stats.transactions.push({player:i,to:t.to,hash:result,gas:t.gas});
  }else if(['eth_estimateGas','eth_gasPrice','eth_getTransactionReceipt','eth_getBalance','eth_call'].includes(method))result=await client.request({method,params});
  else throw Error('Unsupported fixture method');
  res.end(JSON.stringify({result},(_,v)=>typeof v==='bigint'?'0x'+v.toString(16):v));
 }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.shortMessage||'Public testnet fixture request failed'}));}
});
await new Promise(resolve=>bridge.listen(0,'127.0.0.1',resolve));const metadata={base,bridge:`http://127.0.0.1:${bridge.address().port}`,chainId:10143,wallets:accounts.map(a=>a.address)};
fs.writeFileSync(process.argv[2],JSON.stringify(metadata),{mode:0o600});console.log(JSON.stringify(metadata));
await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});await new Promise(resolve=>bridge.close(resolve));
