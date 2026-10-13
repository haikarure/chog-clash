import test from 'node:test';
import assert from 'node:assert/strict';
import {CupFunding,sendWalletTransaction} from '../../online/payments.mjs';

const wallet='0x'+'11'.repeat(20),contract='0x'+'22'.repeat(20),token='0x'+'33'.repeat(20);
function fixture(){
 const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const state={approved:false,deposited:false,accepted:false,pendingPhase:null,failEstimate:false,rejectWallet:false,failConfirm:false,hashes:{},sent:[],calls:[]};
 const phase=transaction=>transaction.to===token?'approval':'deposit';
 const provider={async request(args){
  state.calls.push(args);
  if(args.method==='eth_chainId')return '0x7a69';
  if(args.method==='eth_accounts')return [wallet];
  if(args.method==='eth_estimateGas'){if(state.failEstimate)throw Error('execution reverted');return '0x186a1';}
  if(args.method==='eth_gasPrice')return '0x174876e800';
  if(args.method==='eth_sendTransaction'){
   if(state.rejectWallet){const error=Error('Wallet request rejected');error.code=4001;throw error;}
   const tx=args.params[0],step=phase(tx),hash='0x'+String(state.sent.length+1).padStart(64,'0');
   state.sent.push(tx);state.hashes[step]=hash;
   if(state.pendingPhase!==step)state[step==='approval'?'approved':'deposited']=true;
   return hash;
  }
  if(args.method==='eth_getTransactionReceipt'){
   const step=Object.entries(state.hashes).find(([,hash])=>hash===args.params[0])?.[0];
   return step&&state[step==='approval'?'approved':'deposited']?{status:'0x1',transactionHash:args.params[0]}:null;
  }
  throw Error('Unexpected wallet method '+args.method);
 }};
 const request=async(path,body)=>{
  if(path.endsWith('/funding-progress'))return {saved:true};
  if(path.endsWith('/funding-status')){
   if(state.deposited){state.accepted=true;return {phase:'confirmed',canFund:false,approvalNeeded:false,depositTx:state.hashes.deposit,report:{id:'cup',state:'Funded'}};}
   return {phase:state.hashes.deposit?'deposit-pending':state.hashes.approval&&!state.approved?'approval-pending':state.approved?'deposit-ready':'approval-ready',canFund:!state.hashes.deposit&&(!state.hashes.approval||state.approved),approvalNeeded:!state.approved,approvalTx:state.hashes.approval||null,depositTx:state.hashes.deposit||null};
  }
  if(path.endsWith('/funding'))return {steps:[...(!state.approved?[{phase:'approval',transaction:{to:token,data:'0x01',value:'0x0'}}]:[]),{phase:'deposit',transaction:{to:contract,data:'0x02',value:'0x0'}}]};
  if(path.endsWith('/confirm-funding')){if(state.failConfirm)throw Error('Temporary backend outage');assert.equal(body.hash,state.hashes.deposit);state.accepted=true;return {state:'Funded'};}
  throw Error('Unexpected API path '+path);
 };
 const context={cupId:'cup',chainId:31337,contract,wallet};
 const create=(overrides={})=>new CupFunding({context,storage,provider:()=>provider,request,receiptOptions:{attempts:1,interval:0},...overrides});
 return {state,storage,data,provider,context,create};
}

test('funding reload after approval resumes with only one deposit',async()=>{
 const f=fixture();f.state.pendingPhase='approval';
 await assert.rejects(f.create().run(),/still pending/);assert.equal(f.state.sent.length,1);
 f.state.approved=true;f.state.pendingPhase=null;
 const resumed=f.create();await resumed.run();
 assert.equal(f.state.sent.filter(tx=>tx.to===token).length,1);
 assert.equal(f.state.sent.filter(tx=>tx.to===contract).length,1);
 assert.equal(resumed.snapshot().phase,'confirmed');assert.equal(f.data.size,0);
});
test('funding reload after a mined deposit recovers a failed backend confirmation without resending',async()=>{
 const f=fixture();f.state.failConfirm=true;
 await assert.rejects(f.create().run(),/backend outage/);assert.equal(f.state.sent.length,2);
 f.state.failConfirm=false;const resumed=f.create();await resumed.run();
 assert.equal(resumed.snapshot().phase,'confirmed');assert.equal(f.state.sent.length,2);
});
test('pending deposit survives reload and cannot submit another deposit',async()=>{
 const f=fixture();f.state.pendingPhase='deposit';
 await assert.rejects(f.create().run(),/still pending/);
 const resumed=f.create();await resumed.sync();assert.equal(resumed.snapshot().canFund,false);
 await assert.rejects(resumed.run(),/still pending/);assert.equal(f.state.sent.length,2);
 f.state.deposited=true;await resumed.sync();assert.equal(resumed.snapshot().phase,'confirmed');
});
test('failed gas estimation never opens a transaction request; successful retry sends explicit bounded gas',async()=>{
 const f=fixture();f.state.failEstimate=true;const flow=f.create();
 await assert.rejects(flow.run(),/Could not estimate/);assert.equal(f.state.sent.length,0);
 f.state.failEstimate=false;await flow.run();assert.equal(f.state.sent.length,2);
 for(const tx of f.state.sent){assert.equal(BigInt(tx.gas),110002n);assert.equal(tx.value,'0x0');assert.equal(tx.from,wallet);}
});
test('wallet rejection permits retry; an interrupted wallet request requires reconciliation',async()=>{
 const f=fixture();f.state.rejectWallet=true;
 await assert.rejects(f.create().run(),/rejected/);f.state.rejectWallet=false;
 await f.create().run();assert.equal(f.state.sent.length,2);
 const g=fixture();g.provider.request=async args=>{if(args.method==='eth_sendTransaction')throw Error('Provider disconnected');return f.provider.request(args);};
 await assert.rejects(g.create().run(),/Provider disconnected/);
 await assert.rejects(g.create().run(),/interrupted/);assert.equal(g.state.sent.length,0);
});
test('funding journals are isolated by Cup, chain and sponsor; wrong chain cannot send',async()=>{
 const f=fixture();f.state.pendingPhase='deposit';await assert.rejects(f.create().run(),/still pending/);
 for(const context of [{...f.context,cupId:'another'},{...f.context,chainId:10143},{...f.context,wallet:'0x'+'44'.repeat(20)}])assert.deepEqual(f.create({context}).snapshot().steps,{});
 await assert.rejects(sendWalletTransaction({provider:f.provider,transaction:{to:contract,data:'0x02'},wallet,chainId:10143}),/Switch your wallet/);assert.equal(f.state.sent.length,2);
});
test('two concurrent funding actions send only one approval and one deposit',async()=>{
 const f=fixture(),flow=f.create();await Promise.allSettled([flow.run(),flow.run()]);assert.equal(f.state.sent.length,2);assert.equal(f.state.accepted,true);
});
