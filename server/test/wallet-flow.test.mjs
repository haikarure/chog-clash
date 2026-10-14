import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi} from 'viem';
import {connectVerifiedWallet,ensureWalletNetwork,DuelFunding} from '../../online/payments.mjs';

const wallet='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20),escrow='0x'+'33'.repeat(20),token='0x'+'44'.repeat(20);
const now=1000000;
function loginFixture({bound=wallet,expires=now+1000,network='0x279f'}={}){
 const state={wallet:bound,expires,network,calls:[],api:[],token:'session-token',activeToken:null};
 const provider={async request({method,params=[]}){
  state.calls.push(method);
  if(method==='eth_chainId')return state.network;
  if(method==='eth_accounts'||method==='eth_requestAccounts')return [wallet];
  if(method==='wallet_switchEthereumChain'){state.network=params[0].chainId;return null;}
  if(method==='personal_sign')return '0x'+'ab'.repeat(65);
  throw Error('Unexpected provider method '+method);
 }};
 const request=async(path,body)=>{state.api.push(path);
  if(path==='/session')return {token:state.token,wallet:state.wallet,walletExpires:state.expires};
  assert.equal(state.activeToken,state.token,'Refresh the session token before authenticating');
  if(path==='/auth/challenge'){assert.equal(body.address,wallet);return {message:'Fixture wallet login'};}
  if(path==='/auth/verify'){state.wallet=wallet;state.expires=now+3600000;return {wallet};}
  throw Error('Unexpected API method '+path);
 };
 const run=()=>connectVerifiedWallet({provider,chainId:10143,request,onSession:s=>state.activeToken=s.token,now:()=>now});
 return {state,provider,run};
}
test('an active matching wallet login needs no network switch, permission prompt or new signature',async()=>{
 const f=loginFixture();assert.equal((await f.run()).reused,true);await f.run();assert.deepEqual(f.state.calls,['eth_chainId','eth_accounts','eth_chainId','eth_accounts']);assert.deepEqual(f.state.api,['/session','/session']);
});
test('expired or different-account sessions require one fresh signature then become reusable',async()=>{
 for(const config of [{expires:now-1},{bound:other}]){
  const f=loginFixture(config);assert.equal((await f.run()).reused,false);assert.equal((await f.run()).reused,true);assert.equal(f.state.calls.filter(method=>method==='personal_sign').length,1);
 }
});
test('unknown Monad network is added once and a failed chain switch cannot start login',async()=>{
 const calls=[];let network='0x1',added=false;
 const provider={async request({method,params=[]}){calls.push(method);if(method==='eth_chainId')return network;if(method==='wallet_switchEthereumChain'){if(!added)throw Object.assign(Error('Unknown chain'),{code:4902});network=params[0].chainId;return null;}if(method==='wallet_addEthereumChain'){assert.equal(params[0].chainId,'0x279f');added=true;return null;}throw Error(method);}};
 await ensureWalletNetwork(provider,10143);await ensureWalletNetwork(provider,10143);assert.equal(calls.filter(method=>method==='wallet_addEthereumChain').length,1);
 const f=loginFixture({network:'0x1'});f.provider.request=async({method})=>method==='eth_chainId'?'0x1':null;await assert.rejects(f.run(),/did not switch/);assert.equal(f.state.api.length,0);
});
function fundingFixture(entries=10){
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},context={cupId:'duel',chainId:10143,wallet,contract:escrow,token};
 const abi=parseAbi(['function approve(address,uint256) returns (bool)']);
 const plan={amount:'1000000',token,contract:escrow,steps:[{phase:'approval',transaction:{to:token,data:encodeFunctionData({abi,functionName:'approve',args:[escrow,1000000n]}),value:'0x0'}},{phase:'deposit',transaction:{to:escrow,data:'0x1234',value:'0x0'}}]};
 const flow=new DuelFunding({context,storage,provider:()=>null,request:async()=>{},approvalEntries:entries});return {flow,plan,abi};
}
test('the reusable approval is bounded at ten entries and never changes the one-token deposit',()=>{
 const f=fundingFixture(),prepared=f.flow.prepareFundingPlan(f.plan);assert.equal(prepared.steps[0].transaction.data,encodeFunctionData({abi:f.abi,functionName:'approve',args:[escrow,10000000n]}));assert.deepEqual(prepared.steps[1],f.plan.steps[1]);
 f.flow.setApprovalEntries(1);assert.deepEqual(f.flow.prepareFundingPlan(f.plan),f.plan);assert.throws(()=>f.flow.setApprovalEntries(100),/1 or 10/);
});
test('reusable approval rejects a changed token, spender, entry, native value or approval calldata',()=>{
 for(const change of [p=>p.token=other,p=>p.contract=other,p=>p.amount='2000000',p=>p.steps[0].transaction.to=other,p=>p.steps[0].transaction.value='0x1',p=>p.steps[0].transaction.data='0x095ea7b3']){
  const f=fundingFixture();change(f.plan);assert.throws(()=>f.flow.prepareFundingPlan(f.plan),/does not match/);
 }
 const f=fundingFixture(),depositOnly={...f.plan,steps:[f.plan.steps[1]]};assert.deepEqual(f.flow.prepareFundingPlan(depositOnly),depositOnly);
});
