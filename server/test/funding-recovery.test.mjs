import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../store.mjs';
import {FundingRecovery} from '../funding-recovery.mjs';

test('funding recovery handles a ten-block RPC limit and resumes its persisted scan after restart',async()=>{
 const store=new Store(),created=store.newSession(),session=store.session(created.token);
 const wallet='0x'+'12'.repeat(20),contract='0x'+'34'.repeat(20),id='0x'+'56'.repeat(32),hash='0x'+'78'.repeat(32),build='0x'+'90'.repeat(32);
 session.wallet=wallet;session.wallet_expires=Date.now()+60000;
 const cup=store.createCup(session,'Provider limit regression','testnet');
 store.beginFunding(cup.id,wallet,10143,contract,100n);
 const ranges=[],chain={store,enabled:true,mode:'testnet',chainId:10143,address:contract,buildHash:build,
  abi:[{type:'event',name:'CupFunded',inputs:[]}],
  async read(){return {state:1,sponsor:wallet,rulesetHash:build,reserved:100000000n};},
  public:{async getBlockNumber(){return 149n;},async getLogs({fromBlock,toBlock}){
   assert.ok(toBlock-fromBlock<10n,'Free RPC rejects more than ten blocks');ranges.push([fromBlock,toBlock]);
   // An unrelated sponsor must not satisfy the funding proof.
   const unrelated={args:{sponsor:'0x'+'ab'.repeat(20),amount:100000000n},transactionHash:'0x'+'cd'.repeat(32)};
   return fromBlock<=129n&&toBlock>=129n?[unrelated,{args:{sponsor:wallet,amount:100000000n},transactionHash:hash}]:[unrelated];
  }},
  async confirmFunding(c,s,h){assert.equal(c.id,cup.id);assert.equal(s.id,session.id);assert.equal(h,hash);store.updateCup(c.id,{state:'Funded',funding_tx:h});}
 };
 try{
  let recovery=new FundingRecovery(chain,()=>id);
  assert.equal((await recovery.status(cup,session)).phase,'recovering-confirmation');
  assert.equal(store.fundingProgress(cup.id).scan_block,'110');
  recovery=new FundingRecovery(chain,()=>id); // New process uses the persisted cursor.
  assert.equal((await recovery.status(cup,session)).phase,'recovering-confirmation');
  const confirmed=await recovery.status(cup,session);
  assert.equal(confirmed.phase,'confirmed');assert.equal(confirmed.depositTx,hash);
  assert.equal(store.fundingProgress(cup.id).deposit_tx,hash);
  assert.deepEqual(ranges,[[100n,109n],[110n,119n],[120n,129n]]);
  assert.equal((await recovery.status(store.cup(cup.id),session)).phase,'confirmed');
  assert.equal(ranges.length,3,'Confirmed funding does not scan or deposit again');
 }finally{store.close();}
});
