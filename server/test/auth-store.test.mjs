import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {Store} from '../store.mjs';
import {createChallenge,verifyChallenge} from '../auth.mjs';

// Public development key only; never used on a public chain.
const account=privateKeyToAccount('0x'+'11'.repeat(32));
test('SIWE binds session, domain, chain and single-use nonce',async()=>{
 const store=new Store();try{const a=store.newSession(),b=store.newSession(),session=store.session(a.token),origin='http://localhost:5174';
  const proof=createChallenge(store,session,account.address,origin),signature=await account.signMessage({message:proof.message});
  await assert.rejects(verifyChallenge(store,store.session(b.token),proof.message,signature,origin),/mismatch/);
  await assert.rejects(verifyChallenge(store,session,proof.message,signature,origin,31337),/mismatch/);
  await assert.rejects(verifyChallenge(store,session,proof.message,signature,'https://other.example'),/mismatch/);
  await verifyChallenge(store,session,proof.message,signature,origin);assert.equal(store.session(a.token).wallet,account.address.toLowerCase());
  await assert.rejects(verifyChallenge(store,session,proof.message,signature,origin),/mismatch/);
 }finally{store.close();}
});
test('check-in replacement revokes old invite; result and outbox commit once',()=>{
 const store=new Store();try{const host=store.newSession(),a=store.newSession(),cup=store.createCup(host,'Test Cup'),invite=store.report(cup.id,host.id).participants[0].invite;
  store.joinCup(cup.id,invite,a,'Player','yot');const replacement=store.uncheck(cup.id,host,0);assert.notEqual(invite,replacement);assert.throws(()=>store.joinCup(cup.id,invite,a,'Player','yot'),/Invitation/);
  const id=store.newMatch(cup.id,'SF1',[a.id,host.id]),result={winnerSession:a.id,outcome:'Forfeit',reason:'surrender'},job={id:id+':result',cupId:cup.id,matchId:id,kind:'result',payload:result};
  assert.equal(store.recordResult(id,result,[],job),true);assert.equal(store.recordResult(id,{...result,winnerSession:host.id},[],job),false);assert.equal(store.matches(cup.id)[0].winner,a.id);assert.equal(store.outbox().length,1);
 }finally{store.close();}
});
