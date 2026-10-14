import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {WalletSession} from '../../online/wallet-session.mjs';
import {Store} from '../store.mjs';
import {createChallenge,verifyChallenge} from '../auth.mjs';
import {startServer} from '../app.mjs';

const wallet='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20);
function fixture({bound=null,expires=0}={}){
 const state={wallet:bound,walletExpires:expires,token:'fixture-token',calls:[],rpc:[],events:[],listeners:{},address:wallet};
 const provider={on:(event,fn)=>state.listeners[event]=fn,removeListener:()=>{},async request({method}){
  state.rpc.push(method);if(method==='eth_chainId')return '0x279f';if(method==='eth_accounts')return [state.address];if(method==='personal_sign')return state.signature?state.signature():'0x'+'ab'.repeat(65);throw Error(method);
 }};
 const fetcher=async(path,options)=>{
  state.calls.push(path);
  if(path==='/api/auth/logout'&&state.failLogout)throw Error('Offline');
  let data;
  if(path==='/api/config')data={settlement:{chainId:10143}};
  else if(path==='/api/session')data={token:state.token,wallet:state.wallet,walletExpires:state.walletExpires};
  else if(path==='/api/auth/challenge')data={message:'Fixture login'};
  else if(path==='/api/auth/verify'){state.wallet=state.address;state.walletExpires=3601000;data={wallet:state.address};}
  else if(path==='/api/auth/logout'){state.wallet=null;state.walletExpires=0;data={wallet:null,walletExpires:0};}
  else throw Error(path);
  return {ok:true,json:async()=>data};
 };
 const auth=new WalletSession({provider:()=>provider,fetcher,now:()=>1000,publish:type=>state.events.push(type)});
 return {auth,state,provider};
}
test('landing/session initialization is silent, deduplicated, and reuses an active login',async()=>{
 const f=fixture({bound:wallet,expires:2000});await Promise.all([f.auth.initialize(),f.auth.initialize()]);assert.equal(f.state.calls.filter(x=>x==='/api/session').length,1);assert.equal(f.state.rpc.length,0);
 await Promise.all([f.auth.connect(),f.auth.connect()]);assert.equal(f.state.rpc.filter(x=>x==='personal_sign').length,0);assert.equal(f.auth.snapshot().wallet,wallet);assert.equal('token' in f.auth.snapshot(),false);
});
test('disconnect revokes wallet auth and the next connection needs one new signature',async()=>{
 const f=fixture();await f.auth.connect();await f.auth.disconnect();assert.equal(f.auth.snapshot().wallet,null);assert.equal(f.auth.token(),'fixture-token');await f.auth.connect();assert.equal(f.state.rpc.filter(x=>x==='personal_sign').length,2);assert.deepEqual(f.state.events,['connected','disconnected','connected']);
});
test('logout during a pending signature prevents a late login from restoring auth',async()=>{
 const f=fixture();let resolve,started;const signatureStarted=new Promise(r=>started=r);f.state.signature=()=>{started();return new Promise(r=>resolve=r);};
 const pending=f.auth.connect();await signatureStarted;await f.auth.disconnect();resolve('0x'+'ab'.repeat(65));await assert.rejects(pending,/connection changed/);assert.equal(f.auth.snapshot().wallet,null);assert.equal(f.state.calls.includes('/api/auth/verify'),false);
});
test('a failed logout retains visible auth and allows retry; an account change clears it',async()=>{
 const f=fixture({bound:wallet,expires:2000});await f.auth.initialize();f.state.failLogout=true;await assert.rejects(f.auth.disconnect());assert.equal(f.auth.snapshot().wallet,wallet);assert.deepEqual(f.state.events,[]);
 f.state.failLogout=false;f.state.listeners.accountsChanged([other]);await new Promise(r=>setTimeout(r,0));assert.equal(f.auth.snapshot().wallet,null);assert.deepEqual(f.state.events,['disconnected']);
});
test('account changes during a wallet operation are signed out when that operation finishes',async()=>{
 const f=fixture({bound:wallet,expires:2000});await f.auth.initialize();f.auth.setBlocked(true);f.state.listeners.accountsChanged([other,wallet]);assert.equal(f.auth.snapshot().wallet,wallet);f.auth.setBlocked(false);await new Promise(r=>setTimeout(r,0));assert.equal(f.auth.snapshot().wallet,null);
});
test('a changed account during the signature cannot verify the old wallet',async()=>{
 const f=fixture();f.state.signature=async()=>{f.state.address=other;return '0x'+'ab'.repeat(65);};await assert.rejects(f.auth.connect(),/account or network changed/);assert.equal(f.state.calls.includes('/api/auth/verify'),false);assert.equal(f.auth.snapshot().wallet,null);
});
test('a session refresh started during logout cannot restore its stale wallet response',async()=>{
 const f=fixture({bound:wallet,expires:2000});await f.auth.initialize();const original=f.auth.fetcher;
 let finishLogout,finishRefresh;f.auth.fetcher=async(path,options)=>{
  if(path==='/api/auth/logout')return {ok:true,json:()=>new Promise(r=>finishLogout=r)};
  if(path==='/api/session')return {ok:true,json:()=>new Promise(r=>finishRefresh=r)};
  return original(path,options);
 };
 const logout=f.auth.disconnect();await new Promise(r=>setTimeout(r,0));const refresh=f.auth.refresh();await new Promise(r=>setTimeout(r,0));
 finishLogout({wallet:null,walletExpires:0});await logout;finishRefresh({token:'fixture-token',wallet,walletExpires:2000});await refresh;assert.equal(f.auth.snapshot().wallet,null);
});
test('server logout invalidates signed and pending nonces while preserving game ownership',async()=>{
 const account=privateKeyToAccount('0x'+'11'.repeat(32)),store=new Store();let server;
 try{
  server=await startServer({port:0,store,env:{}});
  const base=`http://localhost:${server.port}/api`,session=await (await fetch(base+'/session')).json();
  const post=async(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify(body)});
  const current=()=>store.session(session.token),cup=store.createCup(current(),'Logout ownership regression');
  const proof=createChallenge(store,current(),account.address,server.origin),signature=await account.signMessage({message:proof.message});await verifyChallenge(store,current(),proof.message,signature,server.origin);
  const pending=createChallenge(store,current(),account.address,server.origin),pendingSignature=await account.signMessage({message:pending.message});
  store.queueJoin(current(),{chog:'yot',kind:'paid'});
  const response=await post('/auth/logout',{});assert.equal(response.status,200);assert.deepEqual(await response.json(),{wallet:null,walletExpires:0});assert.equal(current().id,cup.host);assert.equal(current().wallet,null);assert.equal(store.requireHost(cup.id,current()).id,cup.id);
  assert.equal(store.queueStatus(current().id),null);
  await assert.rejects(verifyChallenge(store,current(),pending.message,pendingSignature,server.origin),/nonce|mismatch/i);assert.equal(store.db.prepare('SELECT count(*) n FROM nonces WHERE session_id=?').get(current().id).n,0);
 }finally{if(server)await server.close();else store.close();}
});
