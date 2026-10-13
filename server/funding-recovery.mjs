import {parseAbi, TransactionReceiptNotFoundError} from 'viem';

const allowanceAbi=parseAbi(['function allowance(address owner,address spender) view returns (uint256)']);
const hashPattern=/^0x[0-9a-f]{64}$/i;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const pool=100000000n;

// Receipt recovery is scoped to one Cup, chain, contract and verified sponsor.
// Client-supplied hashes are hints; only Chain.confirmFunding accepts a deposit.
export class FundingRecovery {
 constructor(chain,cupHash){this.chain=chain;this.store=chain.store;this.cupHash=cupHash;this.checks=new Map();}
 require(cup,session){
  if(!this.chain.enabled||!cup||cup.mode!==this.chain.mode)throw Error('Test-token funding is unavailable');
  if(cup.host!==session.id)throw Error('Host access required');
 }
 async receipt(hash){if(!hash)return null;try{return await this.chain.public.getTransactionReceipt({hash});}catch(error){if(error instanceof TransactionReceiptNotFoundError||error.name==='TransactionReceiptNotFoundError')return null;throw error;}}
 async begin(cup,session){
  this.require(cup,session);
  if(!session.wallet||session.wallet_expires<Date.now())throw Error('Verify the sponsor wallet first');
  const existing=this.store.fundingProgress(cup.id);
  if(existing&&(!same(existing.wallet,session.wallet)||existing.chain_id!==String(this.chain.chainId)||!same(existing.contract,this.chain.address)))throw Error('Use the sponsor wallet and network that began this Cup funding');
  if(existing)return existing;
  return this.store.beginFunding(cup.id,session.wallet,this.chain.chainId,this.chain.address,await this.chain.public.getBlockNumber({cacheTime:0}));
 }
 async note(cup,session,phase,hash){
  this.require(cup,session);
  if(!['approval','deposit'].includes(phase)||!hashPattern.test(hash||''))throw Error('Invalid funding transaction');
  if(cup.state!=='Draft')throw Error('This Cup is already funded');
  const progress=await this.begin(cup,session),previous=progress[phase+'_tx'];
  if(previous&&previous.toLowerCase()!==hash.toLowerCase()){
   const receipt=await this.receipt(previous);
   if(!receipt||(phase==='deposit'&&receipt.status==='success'))throw Error('Check the existing funding transaction before sending another');
  }
  this.store.noteFunding(cup.id,phase,hash.toLowerCase());
  return {saved:true};
 }
 status(cup,session){
  this.require(cup,session);
  if(this.checks.has(cup.id))return this.checks.get(cup.id);
  const task=this.check(cup,session);this.checks.set(cup.id,task);
  return task.finally(()=>this.checks.delete(cup.id));
 }
 async check(cup,session){
  if(cup.state!=='Draft')return {phase:'confirmed',canFund:false,report:this.store.report(cup.id,session.id)};
  let progress=this.store.fundingProgress(cup.id);
  const wallet=progress?.wallet||session.wallet;
  if(!wallet)return {phase:'wallet-needed',canFund:false};
  if(progress&&(progress.chain_id!==String(this.chain.chainId)||!same(progress.contract,this.chain.address)))throw Error('Funding belongs to another network or contract');
  const state=await this.chain.read('getCup',[this.cupHash(cup.id)]);
  const result={wallet,approvalTx:progress?.approval_tx||null,depositTx:progress?.deposit_tx||null,approvalNeeded:true,canFund:false};
  if(state.state!==0){
   if(state.state!==1||!same(state.sponsor,wallet)||state.rulesetHash!==this.chain.buildHash||state.reserved!==pool)throw Error('Onchain funding does not match this Cup and sponsor');
   if(!progress){const head=await this.chain.public.getBlockNumber({cacheTime:0});progress=this.store.beginFunding(cup.id,wallet,this.chain.chainId,this.chain.address,head>1000n?head-1000n:0n);}
   let hash=progress.deposit_tx;
   if(hash){const receipt=await this.receipt(hash),event=receipt&&this.chain.events(receipt).find(event=>event.eventName==='CupFunded'&&event.args.cupId===this.cupHash(cup.id)&&same(event.args.sponsor,wallet)&&event.args.amount===pool);if(!receipt||receipt.status!=='success'||!event)hash=null;}
   if(!hash){
    // Alchemy's free Monad RPC permits at most ten blocks per eth_getLogs call.
    // Persist each completed window so provider limits never skip a deposit.
    const head=await this.chain.public.getBlockNumber({cacheTime:0}),fromBlock=BigInt(progress.scan_block),toBlock=fromBlock+9n<head?fromBlock+9n:head;
    if(fromBlock<=head){
     const logs=await this.chain.public.getLogs({address:this.chain.address,event:this.chain.abi.find(item=>item.type==='event'&&item.name==='CupFunded'),args:{cupId:this.cupHash(cup.id)},fromBlock,toBlock});
     hash=logs.find(log=>same(log.args.sponsor,wallet)&&log.args.amount===pool)?.transactionHash;
     if(!hash)this.store.advanceFundingScan(cup.id,toBlock===head?head:toBlock+1n);
    }
   }
   if(hash){
    await this.chain.confirmFunding(cup,session,hash);
    this.store.noteFunding(cup.id,'deposit',hash);
    return {...result,depositTx:hash,phase:'confirmed',onchainFunded:true,report:this.store.report(cup.id,session.id)};
   }
   return {...result,phase:'recovering-confirmation',onchainFunded:true};
  }
  if(progress?.deposit_tx){
   const receipt=await this.receipt(progress.deposit_tx);
   if(!receipt)return {...result,phase:'deposit-pending'};
   if(receipt.status==='success')throw Error('Deposit receipt does not match the current Cup state');
   result.depositFailed=true;
  }
  if(progress?.approval_tx){
   const receipt=await this.receipt(progress.approval_tx);
   if(!receipt)return {...result,phase:'approval-pending'};
   result.approvalFailed=receipt.status!=='success';
  }
  const allowance=await this.chain.public.readContract({address:this.chain.token,abi:allowanceAbi,functionName:'allowance',args:[wallet,this.chain.address]});
  return {...result,approvalNeeded:allowance<pool,canFund:true,phase:allowance<pool?'approval-ready':'deposit-ready'};
 }
 async plan(cup,session){
  await this.begin(cup,session);
  const status=await this.status(cup,session);
  if(status.phase==='confirmed')return {alreadyFunded:true,transactions:[],steps:[],status};
  if(!status.canFund)throw Error('Funding is pending. Check confirmation before sending another transaction');
  return status;
 }
}
