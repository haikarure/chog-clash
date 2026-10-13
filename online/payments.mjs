const hashPattern=/^0x[0-9a-f]{64}$/i;
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function gasWithBuffer(estimate){
 const gas=BigInt(estimate);if(gas<=0n||gas>30000000n)throw Error('This transaction has an invalid gas estimate');
 const buffered=(gas*110n+99n)/100n;return buffered>30000000n?30000000n:buffered;
}
export async function walletReceipt(provider,hash,{attempts=120,interval=1500}={}){
 for(let i=0;i<attempts;i++){
  const receipt=await provider.request({method:'eth_getTransactionReceipt',params:[hash]});
  if(receipt){if(receipt.status!=='0x1'){const error=Error('The transaction failed. Its test tokens were not deposited or paid.');error.reverted=true;throw error;}return receipt;}
  if(i+1<attempts)await sleep(interval);
 }
 throw Error('The transaction is still pending. Check its status before sending another.');
}
export async function sendWalletTransaction({provider,transaction,wallet,chainId,beforeSend,onSubmitted}){
 if(!provider)throw Error('Connect an EVM wallet to send this transaction');
 const network=await provider.request({method:'eth_chainId'});
 if(BigInt(network)!==BigInt(chainId))throw Error('Switch your wallet to the Cup network before continuing');
 const accounts=await provider.request({method:'eth_accounts'});
 if(!accounts?.some(address=>same(address,wallet)))throw Error('Select the verified sponsor or recipient account in your wallet');
 const tx={to:transaction.to,data:transaction.data,value:transaction.value||'0x0',from:wallet};
 let estimate;
 try{estimate=await provider.request({method:'eth_estimateGas',params:[tx]});}catch{throw Error('Could not estimate this transaction. Check your token balance, approval and network, then retry.');}
 const gas=gasWithBuffer(estimate);tx.gas='0x'+gas.toString(16);
 let feeWei=null;try{feeWei=(gas*BigInt(await provider.request({method:'eth_gasPrice'}))).toString();}catch{}
 await beforeSend?.({gas:gas.toString(),feeWei});
 const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});
 if(!hashPattern.test(hash||''))throw Error('The wallet did not return a transaction hash. Check the wallet before retrying.');
 await onSubmitted?.(hash);
 return hash;
}

// Only public transaction progress is persisted. Never store sessions/signatures.
export class CupFunding {
 constructor({context,storage,provider,request,onChange=()=>{},receiptOptions,resourcePath,journalNamespace='chog-funding-v1'}){
  this.context={...context,wallet:context.wallet.toLowerCase(),contract:context.contract.toLowerCase()};
  this.key=[journalNamespace,context.cupId,context.chainId,this.context.contract,this.context.wallet].join(':');
  this.resourcePath=resourcePath||`/cups/${context.cupId}`;
  this.storage=storage;this.provider=provider;this.request=request;this.onChange=onChange;this.receiptOptions=receiptOptions;
  this.steps={};this.backend={phase:'not-started',canFund:false};this.busy=false;this.error='';
  try{const saved=JSON.parse(storage.getItem(this.key)||'null');if(saved?.version===1){for(const phase of ['approval','deposit']){const step=saved.steps?.[phase];if(step&&['awaiting-wallet','pending','confirmed','failed'].includes(step.status)&&(!step.hash||hashPattern.test(step.hash)))this.steps[phase]=step;}}}catch{}
 }
 save(){try{this.storage.setItem(this.key,JSON.stringify({version:1,steps:this.steps}));}catch{throw Error('Could not save transaction progress. Enable browser storage before funding this Cup.');}}
 snapshot(){
  const uncertain=Object.values(this.steps).some(step=>['awaiting-wallet','pending'].includes(step.status))||(this.steps.deposit?.status==='confirmed'&&this.backend.phase!=='confirmed');
  return {...this.backend,steps:structuredClone(this.steps),busy:this.busy,canFund:!!this.backend.canFund&&!this.busy&&!uncertain,error:this.error};
 }
 emit(){this.onChange(this.snapshot());}
 async sync(){
  if(this.syncing)return this.syncing;
  this.syncing=this.reconcile();try{return await this.syncing;}finally{this.syncing=null;}
 }
 async reconcile(){
  try{
   // Recover hashes saved locally before the server saw them. Do not discard
   // any local pending hash merely because a server response is older.
   for(const phase of ['approval','deposit'])if(this.steps[phase]?.hash&&this.steps[phase].status==='pending'){
    try{await this.request(`${this.resourcePath}/funding-progress`,{phase,hash:this.steps[phase].hash});}catch{}
   }
   this.backend=await this.request(`${this.resourcePath}/funding-status`);
   for(const phase of ['approval','deposit']){
    const hash=this.backend[phase+'Tx'];if(hash&&!this.steps[phase]?.hash)this.steps[phase]={status:'pending',hash};
   }
   if(this.backend.approvalFailed)this.steps.approval={...this.steps.approval,status:'failed'};
   if(this.backend.depositFailed)this.steps.deposit={...this.steps.deposit,status:'failed'};
   if(!this.backend.approvalNeeded&&['deposit-ready','deposit-pending','recovering-confirmation','confirmed'].includes(this.backend.phase))this.steps.approval={...this.steps.approval,status:'confirmed'};
   if(this.backend.phase==='confirmed'){
    this.steps.deposit={...this.steps.deposit,status:'confirmed',hash:this.backend.depositTx||this.steps.deposit?.hash};
    this.storage.removeItem(this.key);
   }else this.save();
   this.error='';this.emit();return this.snapshot();
  }catch(error){this.error=error.message;this.emit();throw error;}
 }
 async run(){
  if(this.busy)return;
  const work=async()=>{
   this.busy=true;this.error='';this.emit();
   try{
    await this.sync();
    if(this.backend.phase==='confirmed')return;
    for(const phase of ['approval','deposit']){
     const step=this.steps[phase];
     if(step?.status==='awaiting-wallet'&&!step.hash)throw Error('A wallet request was interrupted. Check its status or paste the submitted transaction hash before continuing.');
     if(step?.status==='pending'&&step.hash){
      try{await walletReceipt(this.provider(),step.hash,this.receiptOptions);this.steps[phase]={...step,status:'confirmed'};this.save();}
      catch(error){if(error.reverted){this.steps[phase]={...step,status:'failed'};this.save();}throw error;}
     }
    }
    await this.sync();
    if(this.backend.phase==='confirmed')return;
    if(!this.backend.canFund)throw Error('The deposit is pending or its receipt is being recovered. Check confirmation before sending another.');
    const plan=await this.request(`${this.resourcePath}/funding`,{});
    if(plan.alreadyFunded){this.backend=plan.status;this.emit();return;}
    for(const {phase,transaction} of plan.steps){
     try{
      const hash=await sendWalletTransaction({provider:this.provider(),transaction,wallet:this.context.wallet,chainId:this.context.chainId,
       beforeSend:info=>{this.steps[phase]={status:'awaiting-wallet',...info};this.save();this.emit();},
       onSubmitted:async hash=>{this.steps[phase]={...this.steps[phase],hash,status:'pending'};this.save();this.emit();try{await this.request(`${this.resourcePath}/funding-progress`,{phase,hash});}catch{}}
      });
      await walletReceipt(this.provider(),hash,this.receiptOptions);
      this.steps[phase]={...this.steps[phase],status:'confirmed'};this.save();this.emit();
      if(phase==='deposit')await this.request(`${this.resourcePath}/confirm-funding`,{hash});
     }catch(error){if(error.code===4001||error.reverted){this.steps[phase]={...this.steps[phase],status:'failed'};this.save();}throw error;}
    }
    await this.sync();
   }catch(error){this.error=error.message;throw error;}
   finally{this.busy=false;this.emit();}
  };
  if(globalThis.navigator?.locks)return navigator.locks.request(this.key,{ifAvailable:true},lock=>{if(!lock)throw Error('This Cup is being funded in another tab. Check its status here.');return work();});
  return work();
 }
 async recover(hash){
  if(!hashPattern.test(hash||''))throw Error('Paste the complete transaction hash from your wallet');
  if(this.busy)return;
  const phase=this.backend.onchainFunded?'deposit':this.steps.deposit?.status==='awaiting-wallet'?'deposit':this.steps.approval?.status==='awaiting-wallet'?'approval':'deposit';
  if(phase==='deposit'){
   try{await this.request(`${this.resourcePath}/confirm-funding`,{hash});return this.sync();}catch{}
  }
  await this.request(`${this.resourcePath}/funding-progress`,{phase,hash});
  this.steps[phase]={status:'pending',hash};this.save();return this.sync();
 }
}

export class DuelFunding extends CupFunding {
 constructor(options){super({...options,resourcePath:`/duels/${options.context.cupId}`,journalNamespace:'chog-duel-funding-v1'});}
}
