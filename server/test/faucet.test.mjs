import test from 'node:test';
import assert from 'node:assert/strict';
import {AUSD_FAUCET,TestnetFaucet,formatTestAUSD} from '../../online/payments.mjs';
import {encodeFunctionData,encodeEventTopics,parseAbi} from 'viem';

const wallet='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20),hash='0x'+'aa'.repeat(32);
const abi=parseAbi(['function requestFunds(address to)','event Transfer(address indexed from,address indexed to,uint256 value)']);
function fixture(){
 const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const state={chain:'0x279f',account:wallet,balance:0n,native:1000000000000000000n,pending:false,receipt:null,cooldown:false,reject:false,disconnect:false,omitTransfer:false,revert:false,sent:[],calls:[]};
 const provider={async request(args){state.calls.push(args);
  if(args.method==='eth_chainId')return state.chain;
  if(args.method==='eth_accounts')return [state.account];
  if(args.method==='eth_call'){if(args.params[0].to===AUSD_FAUCET.token)return '0x'+state.balance.toString(16).padStart(64,'0');if(state.cooldown)throw Object.assign(Error('execution reverted'),{data:'0x20e5bc67'});return '0x';}
  if(args.method==='eth_getBalance')return '0x'+state.native.toString(16);
  if(args.method==='eth_estimateGas')return '0x1bb39';
  if(args.method==='eth_gasPrice')return '0x174876e800';
  if(args.method==='eth_sendTransaction'){
   if(state.reject)throw Object.assign(Error('User rejected request'),{code:4001});
   if(state.disconnect)throw Error('Provider disconnected');
   state.sent.push(args.params[0]);
   state.receipt={status:state.revert?'0x0':'0x1',transactionHash:hash,to:AUSD_FAUCET.address,logs:state.omitTransfer||state.revert?[]:[{address:AUSD_FAUCET.token,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:AUSD_FAUCET.address,to:wallet}}),data:'0x'+(10000000000n).toString(16).padStart(64,'0')}]};
   if(!state.pending&&!state.revert)state.balance+=10000000000n;return hash;
  }
  if(args.method==='eth_getTransactionReceipt')return state.pending?null:state.receipt;
  if(args.method==='eth_getTransactionByHash')return {from:wallet,to:AUSD_FAUCET.address,input:encodeFunctionData({abi,functionName:'requestFunds',args:[wallet]})};
  throw Error('Unexpected method '+args.method);
 }};
 const create=(overrides={})=>new TestnetFaucet({wallet,storage,provider:()=>provider,receiptOptions:{attempts:1,interval:0},...overrides});
 return {state,provider,storage,data,create};
}
test('faucet targets only the connected recipient and verifies actual token credit with bounded gas',async()=>{
 const f=fixture(),flow=f.create();await flow.run();assert.equal(f.state.sent.length,1);
 const tx=f.state.sent[0];assert.equal(tx.to,AUSD_FAUCET.address);assert.equal(tx.from,wallet);assert.equal(tx.value,'0x0');assert.equal(tx.data,encodeFunctionData({abi,functionName:'requestFunds',args:[wallet]}));assert.equal(BigInt(tx.gas),124812n);
 assert.equal(flow.snapshot().phase,'confirmed');assert.equal(flow.snapshot().amount,'10000000000');assert.equal(flow.snapshot().balance,'10000000000');assert.equal(formatTestAUSD('19900123456'),'19,900.123456');
});
test('pending faucet claim survives reload and is confirmed without sending a second request',async()=>{
 const f=fixture();f.state.pending=true;await assert.rejects(f.create().run(),/still pending/);assert.equal(f.state.sent.length,1);
 const reloaded=f.create();await reloaded.sync();assert.equal(reloaded.snapshot().phase,'pending');await assert.rejects(reloaded.run(),/still pending/);assert.equal(f.state.sent.length,1);
 f.state.pending=false;f.state.balance=10000000000n;await reloaded.sync();assert.equal(reloaded.snapshot().phase,'confirmed');assert.equal(f.state.sent.length,1);
 const confirmed=f.create();await confirmed.sync();assert.equal(confirmed.snapshot().phase,'confirmed');assert.equal(f.state.sent.length,1);
});
test('cooldown, wrong network, mismatched account and insufficient gas never ask the wallet to send',async()=>{
 for(const [setup,message] of [[s=>s.cooldown=true,/cooling down/],[s=>s.chain='0x1',/Monad testnet/],[s=>s.account=other,/verified.*account/],[s=>s.native=0n,/MON testnet/],[s=>s.native=1n,/more MON testnet/]]){
  const f=fixture();setup(f.state);await assert.rejects(f.create().run(),message);assert.equal(f.state.sent.length,0);
 }
});
test('wallet rejection allows retry, while an unknown wallet result blocks another send',async()=>{
 const f=fixture();f.state.reject=true;await assert.rejects(f.create().run(),/cancelled/);assert.equal(f.data.size,0);f.state.reject=false;await f.create().run();assert.equal(f.state.sent.length,1);
 const g=fixture();g.state.disconnect=true;await assert.rejects(g.create().run(),/disconnected/);g.state.disconnect=false;await assert.rejects(g.create().run(),/interrupted/);assert.equal(g.state.sent.length,0);
});
test('a successful receipt without the expected AUSD transfer never reports a successful claim',async()=>{
 const f=fixture();f.state.omitTransfer=true;const flow=f.create();await assert.rejects(flow.run(),/has not been verified/);assert.equal(flow.snapshot().phase,'pending');assert.equal(flow.snapshot().amount,null);
 await assert.rejects(f.create().run(),/has not been verified/);assert.equal(f.state.sent.length,1);
});
test('reverted faucet claims can be retried and journals are isolated between wallets',async()=>{
 const f=fixture();f.state.revert=true;await assert.rejects(f.create().run(),/transaction failed/);assert.equal(f.data.size,0);f.state.revert=false;await f.create().run();assert.equal(f.state.sent.length,2);
 const g=fixture();g.state.pending=true;await assert.rejects(g.create().run(),/pending/);assert.equal(g.create({wallet:other}).snapshot().phase,'idle');
});
test('recovery verifies the faucet receipt and recipient without opening another wallet transaction',async()=>{
 const f=fixture();await f.create().run();const sent=f.state.sent.length;
 const flow=f.create();await flow.recover(hash);assert.equal(flow.snapshot().phase,'confirmed');assert.equal(f.state.sent.length,sent);
 f.state.receipt={...f.state.receipt,to:other};await assert.rejects(flow.recover(hash),/not an AUSD faucet claim/);
});
