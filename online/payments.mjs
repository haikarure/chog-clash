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
export async function sendWalletTransaction({provider,transaction,wallet,chainId,beforeSend,onSubmitted,estimateError}){
 if(!provider)throw Error('Connect an EVM wallet to send this transaction');
 const network=await provider.request({method:'eth_chainId'});
 if(BigInt(network)!==BigInt(chainId))throw Error('Switch your wallet to the required network before continuing');
 const accounts=await provider.request({method:'eth_accounts'});
 if(!accounts?.some(address=>same(address,wallet)))throw Error('Select the verified sponsor or recipient account in your wallet');
 const tx={to:transaction.to,data:transaction.data,value:transaction.value||'0x0',from:wallet};
 let estimate;
 try{estimate=await provider.request({method:'eth_estimateGas',params:[tx]});}catch(error){throw Error(estimateError?estimateError(error):'Could not estimate this transaction. Check your token balance, approval and network, then retry.');}
 const gas=gasWithBuffer(estimate);tx.gas='0x'+gas.toString(16);
 let feeWei=null;try{feeWei=(gas*BigInt(await provider.request({method:'eth_gasPrice'}))).toString();}catch{}
 await beforeSend?.({gas:gas.toString(),feeWei});
 const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});
 if(!hashPattern.test(hash||''))throw Error('The wallet did not return a transaction hash. Check the wallet before retrying.');
 await onSubmitted?.(hash);
 return hash;
}

// Agora's published Monad testnet deployments. No mainnet faucet is exposed.
export const AUSD_FAUCET=Object.freeze({chainId:10143,address:'0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C',token:'0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC'});
const addressPattern=/^0x[0-9a-f]{40}$/i;
const addressWord=address=>address.slice(2).toLowerCase().padStart(64,'0');
const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export function formatTestAUSD(units){const amount=BigInt(units),whole=amount/1000000n,fraction=(amount%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return whole.toLocaleString('en-US')+(fraction?'.'+fraction:'');}
function faucetError(error){
 let detail='';try{detail=JSON.stringify(error);}catch{}
 if(/20e5bc67|MaxFrequencyExceeded/i.test(detail+' '+error?.message))return 'The AUSD faucet is cooling down. Please try again shortly.';
 if(error?.code===4001)return 'Claim cancelled in your wallet. You can try again.';
 return error?.message||'The faucet could not complete this claim. Check your MON testnet gas balance and try again.';
}
export class TestnetFaucet {
 constructor({wallet,storage,provider,onChange=()=>{},receiptOptions}){
  if(!addressPattern.test(wallet||''))throw Error('Connect a valid EVM wallet first');
  this.wallet=wallet;this.storage=storage;this.provider=provider;this.onChange=onChange;this.receiptOptions=receiptOptions;
  this.key=['chog-ausd-faucet-v1',AUSD_FAUCET.chainId,AUSD_FAUCET.address.toLowerCase(),wallet.toLowerCase()].join(':');
  this.state={phase:'idle',hash:null,amount:null,balance:null,busy:false,error:''};
  try{const saved=JSON.parse(storage.getItem(this.key)||'null');if(saved?.version===1&&['awaiting-wallet','pending','confirmed'].includes(saved.phase)&&(!saved.hash||hashPattern.test(saved.hash))){this.state.phase=saved.phase;this.state.hash=saved.hash||null;if(saved.phase==='confirmed'&&/^\d+$/.test(saved.amount||''))this.state.amount=saved.amount;}}catch{}
 }
 snapshot(){return {...this.state};}
 emit(){this.onChange(this.snapshot());}
 save(){try{this.storage.setItem(this.key,JSON.stringify({version:1,phase:this.state.phase,hash:this.state.hash,amount:this.state.amount}));}catch{throw Error('Enable browser storage before claiming so your transaction can be recovered.');}}
 async network(){const provider=this.provider();if(!provider)throw Error('Connect an EVM wallet to claim testnet AUSD');if(BigInt(await provider.request({method:'eth_chainId'}))!==10143n)throw Error('Switch your wallet to Monad testnet to check or claim AUSD');return provider;}
 async balance(provider){const value=await provider.request({method:'eth_call',params:[{to:AUSD_FAUCET.token,data:'0x70a08231'+addressWord(this.wallet)},'latest']});this.state.balance=BigInt(value).toString();}
 confirm(receipt){
  if(receipt.status!=='0x1'){this.state.phase='idle';this.state.hash=null;this.storage.removeItem(this.key);throw Error('The faucet transaction reverted. No AUSD was claimed; you can try again.');}
  if(!same(receipt.to,AUSD_FAUCET.address)||!same(receipt.transactionHash,this.state.hash))throw Error('The claim receipt does not match the AUSD faucet transaction');
  let amount=0n;
  for(const log of receipt.logs||[])if(same(log.address,AUSD_FAUCET.token)&&same(log.topics?.[0],transferTopic)&&same(log.topics?.[1],'0x'+addressWord(AUSD_FAUCET.address))&&same(log.topics?.[2],'0x'+addressWord(this.wallet)))amount+=BigInt(log.data);
  if(amount<=0n)throw Error('The transaction mined, but an AUSD transfer to this wallet has not been verified. Check the transaction link.');
  this.state.phase='confirmed';this.state.amount=amount.toString();this.save();
 }
 async sync(){
  if(this.state.busy)return this.snapshot();
  try{const provider=await this.network();if(this.state.phase==='pending'&&this.state.hash){const receipt=await provider.request({method:'eth_getTransactionReceipt',params:[this.state.hash]});if(receipt)this.confirm(receipt);}await this.balance(provider);this.state.error='';}
  catch(error){this.state.error=faucetError(error);}
  this.emit();return this.snapshot();
 }
 async run(){
  if(this.state.busy)return;this.state.busy=true;this.state.error='';this.emit();
  try{
   const provider=await this.network();
   if(this.state.phase==='awaiting-wallet'&&!this.state.hash)throw Error('A wallet request was interrupted. Check your wallet and paste its transaction hash below before claiming again.');
   if(this.state.phase!=='pending'||!this.state.hash){
    // requestFunds(address); encode only this connected wallet as the recipient.
    const transaction={to:AUSD_FAUCET.address,data:'0x544c7cf9'+addressWord(this.wallet),value:'0x0'};
    await provider.request({method:'eth_call',params:[{...transaction,from:this.wallet},'latest']});
    const balance=BigInt(await provider.request({method:'eth_getBalance',params:[this.wallet,'latest']}));
    if(balance===0n)throw Error('You need MON testnet in this wallet to pay the claim gas fee.');
    await sendWalletTransaction({provider,transaction,wallet:this.wallet,chainId:10143,estimateError:faucetError,
     beforeSend:({feeWei})=>{if(feeWei&&balance<BigInt(feeWei))throw Error('You need more MON testnet to pay the claim gas fee.');this.state.phase='awaiting-wallet';this.state.hash=null;this.state.amount=null;this.save();this.emit();},
     onSubmitted:hash=>{this.state.phase='pending';this.state.hash=hash;this.save();this.emit();}});
   }
   const receipt=await walletReceipt(provider,this.state.hash,this.receiptOptions);this.confirm(receipt);await this.balance(provider);
  }catch(error){if(error.reverted||(error.code===4001&&this.state.phase==='awaiting-wallet')){this.state.phase='idle';this.state.hash=null;this.storage.removeItem(this.key);}this.state.error=faucetError(error);throw Error(this.state.error);}
  finally{this.state.busy=false;this.emit();}
 }
 async recover(hash){
  if(this.state.busy)return;if(!hashPattern.test(hash||''))throw Error('Paste the complete claim transaction hash from your wallet');
  const provider=await this.network(),receipt=await provider.request({method:'eth_getTransactionReceipt',params:[hash]});
  if(receipt&&(!same(receipt.to,AUSD_FAUCET.address)||!receipt.logs?.some(log=>same(log.address,AUSD_FAUCET.token)&&same(log.topics?.[0],transferTopic)&&same(log.topics?.[2],'0x'+addressWord(this.wallet)))))throw Error('That transaction is not an AUSD faucet claim for this wallet');
  if(!receipt){const tx=await provider.request({method:'eth_getTransactionByHash',params:[hash]});if(!tx||!same(tx.to,AUSD_FAUCET.address)||!same(tx.from,this.wallet)||!same(tx.input||tx.data,'0x544c7cf9'+addressWord(this.wallet)))throw Error('That pending transaction is not this wallet’s AUSD faucet claim');}
  this.state.phase='pending';this.state.hash=hash;this.save();await this.sync();
 }
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
