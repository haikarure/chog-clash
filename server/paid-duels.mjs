import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {encodeFunctionData,decodeEventLog,parseAbi,zeroAddress,isAddress} from 'viem';
import {BUILD_HASH} from '../online/build.mjs';
import {verifiedRuntime,cupHash,slotHash} from './chain.mjs';

const tokenAbi=parseAbi(['function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const fields=[{name:'duelId',type:'bytes32'},{name:'matchId',type:'bytes32'},{name:'participantA',type:'address'},{name:'participantB',type:'address'},{name:'winnerRecipient',type:'address'},{name:'outcomeType',type:'uint8'},{name:'rulesetHash',type:'bytes32'},{name:'replayHash',type:'bytes32'},{name:'finishedAt',type:'uint64'},{name:'resultSequence',type:'uint32'},{name:'signerEpoch',type:'uint32'},{name:'expiresAt',type:'uint64'}];
const normalize=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const hashPattern=/^0x[0-9a-f]{64}$/i;
export class PaidDuels {
 constructor({chain,store,createRoom,env=process.env}){
  Object.assign(this,{chain,store,createRoom,address:env.DUEL_ESCROW_ADDRESS,enabled:false,feeBps:500,treasury:null,busy:false});
  this.reason='Paid test-token duels are unavailable on this host.';this.expectedFee=Number(env.DUEL_FEE_BPS||500);this.expectedTreasury=env.DUEL_TREASURY_ADDRESS||env.CONTRACT_OWNER_ADDRESS;
 }
 async initialize(){
  if(!this.chain.enabled||!isAddress(this.address||''))return;
  const file=path.resolve(import.meta.dirname,'../contracts/out/PaidDuelEscrow.sol/PaidDuelEscrow.json');if(!fs.existsSync(file))return;
  this.artifact=JSON.parse(fs.readFileSync(file));this.abi=this.artifact.abi;
  try{
   const [code,token,relay,signer,fee,treasury]=await Promise.all([
    this.chain.public.getBytecode({address:this.address}),...['token','relay','nextSigner','feeBps','treasury'].map(name=>this.read(name))]);
   if(!verifiedRuntime(code,this.artifact)||!same(token,this.chain.token)||!same(relay,this.chain.relay.address)||!same(signer,this.chain.signer.address)||Number(fee)!==this.expectedFee||(this.expectedTreasury&&!same(treasury,this.expectedTreasury)))throw Error('Duel contract mismatch');
   this.feeBps=Number(fee);this.treasury=treasury;this.enabled=true;this.reason=null;
  }catch{this.reason='Paid duel contract/network verification failed. Free modes are available.';}
 }
 info(){return {enabled:this.enabled,chainId:this.chain.chainId,contract:this.enabled?this.address:null,token:this.enabled?this.chain.token:null,entry:'1',pool:'2',feeBps:this.feeBps,winnerAward:(2000000n-2000000n*BigInt(this.feeBps)/10000n).toString(),treasury:this.treasury,label:this.chain.label,reason:this.reason};}
 read(functionName,args=[]){return this.chain.public.readContract({address:this.address,abi:this.abi,functionName,args});}
 async chainTime(){if(this.clockRead&&Date.now()-this.clockRead.at<1000)return this.clockRead.time;const block=await this.chain.public.getBlock();this.clockRead={at:Date.now(),time:Number(block.timestamp)*1000};return this.clockRead.time;}
 events(receipt){return receipt.logs.filter(l=>same(l.address,this.address)).map(l=>{try{return decodeEventLog({abi:this.abi,...l});}catch{return null;}}).filter(Boolean);}
 requireEnabled(){if(!this.enabled)throw Error('Paid test-token duels are unavailable');}
 participant(duel,session,{wallet=false}={}){
  const seat=duel.players.indexOf(session.id);if(seat<0)throw Error('Duel participant access required');
  if(wallet&&(!session.wallet||session.wallet_expires<Date.now()||!same(session.wallet,duel.wallets[seat])))throw Error('Verify the wallet assigned to this duel');return seat;
 }
 report(id,sessionId){const d=this.store.duelReport(id,sessionId);if(!d)throw Error('Duel not found');return {...d,terms:this.info(),moneyLabel:this.chain.label+' · no monetary value'};}
 create(session,body,peer=null){this.requireEnabled();const d=this.store.createDuel(session,body,peer);if(peer)this.ensureCreate(d);return this.report(d.id,session.id);}
 join(id,invite,session,body){this.requireEnabled();const d=this.store.joinDuel(id,invite,session,body);if(d.state==='Creating')this.ensureCreate(d);return this.report(id,session.id);}
 ensureCreate(duel){this.store.enqueue({id:duel.id+':create',cupId:duel.id,kind:'duel-create',payload:{players:duel.wallets}});}
 progress(duel,wallet){
  this.store.db.prepare('INSERT OR IGNORE INTO duel_funding(duel_id,wallet,start_block,scan_block,updated) VALUES(?,?,?,?,?)').run(duel.id,wallet.toLowerCase(),duel.start_block,duel.start_block,Date.now());
  return this.store.db.prepare('SELECT * FROM duel_funding WHERE duel_id=? AND wallet=?').get(duel.id,wallet.toLowerCase());
 }
 note(duel,session,phase,hash){this.participant(duel,session,{wallet:true});if(!hashPattern.test(hash||'')||!['approval','deposit'].includes(phase))throw Error('Invalid funding transaction');this.progress(duel,session.wallet);this.store.db.prepare(`UPDATE duel_funding SET ${phase}_tx=?,updated=? WHERE duel_id=? AND wallet=?`).run(hash,Date.now(),duel.id,session.wallet.toLowerCase());return {ok:true};}
 verifyDeposit(receipt,duel,wallet){
  if(receipt.status!=='success'||!this.events(receipt).some(e=>e.eventName==='DuelFunded'&&e.args.duelId===cupHash(duel.id)&&same(e.args.player,wallet)&&e.args.amount===1000000n))throw Error('Duel entry receipt mismatch');
  if(!receipt.logs.some(log=>{if(!same(log.address,this.chain.token))return false;try{const e=decodeEventLog({abi:tokenAbi,...log});return e.eventName==='Transfer'&&same(e.args.from,wallet)&&same(e.args.to,this.address)&&e.args.value===1000000n;}catch{return false;}}))throw Error('Duel entry transfer was not verified');
 }
 async recoverDeposit(duel,wallet,progress){
  if(!progress.scan_block)return null;
  const tip=await this.chain.public.getBlockNumber(),event=this.abi.find(e=>e.type==='event'&&e.name==='DuelFunded');let cursor=BigInt(progress.scan_block);
  for(let n=0;n<4&&cursor<=tip;n++){
   const end=cursor+9n<tip?cursor+9n:tip;
   const logs=await this.chain.public.getLogs({address:this.address,event,args:{duelId:cupHash(duel.id),player:wallet},fromBlock:cursor,toBlock:end});
   for(const log of logs){const receipt=await this.chain.public.getTransactionReceipt({hash:log.transactionHash});this.verifyDeposit(receipt,duel,wallet);this.saveDeposit(duel,wallet,receipt);return receipt.transactionHash;}
   cursor=end+1n;this.store.db.prepare('UPDATE duel_funding SET scan_block=?,updated=? WHERE duel_id=? AND wallet=?').run(cursor.toString(),Date.now(),duel.id,wallet.toLowerCase());
  }return null;
 }
 saveDeposit(duel,wallet,receipt){this.store.transaction(()=>{this.store.db.prepare('UPDATE duel_funding SET deposit_tx=?,updated=? WHERE duel_id=? AND wallet=?').run(receipt.transactionHash,Date.now(),duel.id,wallet.toLowerCase());this.store.db.prepare('INSERT OR IGNORE INTO chain_receipts VALUES(?,?,?,?)').run(receipt.transactionHash,duel.id,'duel-entry',JSON.stringify(normalize(receipt)));});}
 async fundingStatus(duel,session){
  this.requireEnabled();const seat=this.participant(duel,session,{wallet:true});if(duel.state==='Draft'||duel.state==='Creating')return {phase:'preparing',canFund:false,report:this.report(duel.id,session.id)};
  const state=await this.read('getDuel',[cupHash(duel.id)]);this.store.updateDuel(duel.id,{funded_mask:Number(state.fundedMask)});
  const p=this.progress(duel,session.wallet),onchainFunded=!!(Number(state.fundedMask)&(1<<seat));let depositHash=p.deposit_tx,depositReceipt=null;
  if(depositHash){try{depositReceipt=await this.chain.public.getTransactionReceipt({hash:depositHash});}catch{}}
  if(onchainFunded){if(depositReceipt){try{this.verifyDeposit(depositReceipt,duel,session.wallet);this.saveDeposit(duel,session.wallet,depositReceipt);}catch{depositHash=null;}}else depositHash=null;if(!depositHash)depositHash=await this.recoverDeposit(duel,session.wallet,p);}
  let phase=onchainFunded?'confirmed':state.state!==1?'closed':depositHash&&!depositReceipt?'pending':depositReceipt?.status==='success'?'unknown':'ready';
  const allowance=onchainFunded?1000000n:await this.chain.public.readContract({address:this.chain.token,abi:tokenAbi,functionName:'allowance',args:[session.wallet,this.address]});
  const approvalNeeded=allowance<1000000n;if(phase==='ready')phase=approvalNeeded?'approval-ready':'deposit-ready';else if(phase==='pending')phase='deposit-pending';
  return {phase,onchainFunded,alreadyFunded:onchainFunded,canFund:['approval-ready','deposit-ready'].includes(phase)&&duel.state==='Funding'&&Number(state.state)===1&&Number(state.fundingDeadline)*1000>=await this.chainTime(),approvalNeeded,approvalTx:p.approval_tx,depositTx:depositHash,depositFailed:depositReceipt?.status==='reverted',report:this.report(duel.id,session.id)};
 }
 async funding(duel,session){const status=await this.fundingStatus(duel,session);if(status.onchainFunded)return {...status,status,steps:[]};if(!status.canFund)throw Error('Check the pending entry or wait for the duel escrow');return {...status,chainId:this.chain.chainId,amount:'1000000',contract:this.address,token:this.chain.token,steps:[...(status.approvalNeeded?[{phase:'approval',transaction:{to:this.chain.token,data:encodeFunctionData({abi:tokenAbi,functionName:'approve',args:[this.address,1000000n]}),value:'0x0'}}]:[]),{phase:'deposit',transaction:{to:this.address,data:encodeFunctionData({abi:this.abi,functionName:'fundDuel',args:[cupHash(duel.id)]}),value:'0x0'}}]};}
 async confirmFunding(duel,session,hash){this.requireEnabled();this.participant(duel,session,{wallet:true});if(!hashPattern.test(hash||''))throw Error('Invalid entry hash');this.progress(duel,session.wallet);const receipt=await this.chain.public.getTransactionReceipt({hash});this.verifyDeposit(receipt,duel,session.wallet);this.saveDeposit(duel,session.wallet,receipt);await this.reconcile(duel);return this.report(duel.id,session.id);}
 cancel(duel,session){this.participant(duel,session);if(duel.state==='Draft'){this.store.updateDuel(duel.id,{state:'Cancelled',cancel_reason:'cancelled_before_peer'});return;}if(!['Creating','Funding','Cancelling'].includes(duel.state))throw Error('A locked duel can only finish or expire');this.requireEnabled();const activation=this.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(duel.id+':activate');if(activation?.tx_hash)throw Error('Both entries are confirmed and the duel is locking. Open the match.');this.store.transaction(()=>{if(activation)this.store.updateOutbox(activation.id,{state:'cancelled'});this.store.updateDuel(duel.id,{state:'Cancelling'});this.store.enqueue({id:duel.id+':cancel',cupId:duel.id,kind:'duel-cancel',payload:{}});});}
 enqueueResult(duelId,matchId,result){return {id:matchId+':result',cupId:duelId,matchId,kind:'duel-result',payload:{result}};}
 async reconcile(duel){
  const state=await this.read('getDuel',[cupHash(duel.id)]);if(!state.state)return;const now=await this.chainTime();
  this.store.updateDuel(duel.id,{funded_mask:Number(state.fundedMask)});
  if(state.state===4){const recipients=[...new Set([...duel.wallets,this.treasury].filter(Boolean).map(a=>a.toLowerCase()))],credits=await Promise.all(recipients.map(recipient=>this.read('credits',[cupHash(duel.id),recipient])));this.store.transaction(()=>{this.store.updateDuel(duel.id,{state:'Cancelled',cancel_reason:duel.cancel_reason||'onchain_cancelled'});recipients.forEach((recipient,i)=>{if(credits[i]>0n)this.store.enqueue({id:duel.id+':withdraw:'+recipient,cupId:duel.id,kind:'duel-withdraw',payload:{recipient,amount:credits[i].toString()}});});});}
  else if(state.state===1&&Number(state.fundingDeadline)*1000<now)this.store.enqueue({id:duel.id+':expiry',cupId:duel.id,kind:'duel-refund',payload:{}});
  else if(state.state===1&&state.fundedMask===3&&!this.store.db.prepare('SELECT id FROM outbox WHERE id=?').get(duel.id+':cancel'))this.store.enqueue({id:duel.id+':activate',cupId:duel.id,kind:'duel-activate',payload:{}});
  else if(state.state===2&&Number(state.settlementDeadline)*1000<now)this.store.enqueue({id:duel.id+':expiry',cupId:duel.id,kind:'duel-refund',payload:{}});
 }
 async advance(id){
  const d=this.store.duel(id);if(d?.state==='Active'&&!d.match_id){
   const matchId=this.store.newMatch(null,'paid',d.players);this.store.updateDuel(id,{match_id:matchId});
   try{const roomId=await this.createRoom({matchId,sessions:d.players,characters:d.characters,nicknames:d.nicknames,restricted:true,duelId:id,matchKind:'paid',cupLockedAt:d.locked,stage:'house-cup'});this.store.updateDuel(id,{room_id:roomId});}
   catch{const result={winner:null,winnerSession:null,outcome:'Void',reason:'room_creation_failed',wins:[0,0],replayHash:'0x'+createHash('sha256').update(JSON.stringify({matchId,reason:'room_creation_failed'})).digest('hex'),finishedAt:Math.floor(await this.chainTime()/1000)};this.store.recordResult(matchId,result,[],this.enqueueResult(id,matchId,result));this.store.updateDuel(id,{state:'Settling'});}
  }
 }
 async poll(){
  if(!this.enabled||this.busy)return;this.busy=true;
  try{for(const row of this.store.db.prepare('SELECT id FROM paid_duels WHERE state IN (?,?,?,?) ORDER BY created LIMIT 20').all('Creating','Funding','Active','Settling')){
   const d=this.store.duel(row.id);if(d.state==='Creating')this.ensureCreate(d);else await this.reconcile(d);await this.advance(d.id);
  }}finally{this.busy=false;}
 }
 async prepare(job){
  this.requireEnabled();const d=this.store.duel(job.cup_id),id=cupHash(d.id),base={address:this.address,abi:this.abi};
  if(job.kind==='duel-create')return {...base,functionName:'createDuel',args:[id,job.payload.players,BUILD_HASH]};
  if(job.kind==='duel-activate')return {...base,functionName:'activateDuel',args:[id]};
  if(job.kind==='duel-cancel')return {...base,functionName:'cancelBeforeStart',args:[id]};
  if(job.kind==='duel-refund')return {...base,functionName:'refundExpired',args:[id]};
  if(job.kind==='duel-withdraw')return {...base,functionName:'withdrawFor',args:[id,job.payload.recipient]};
  if(job.kind!=='duel-result')throw Error('Duel relay method is not allowed');
  if(!job.payload.signed){const state=await this.read('getDuel',[id]),r=job.payload.result,seat=d.players.indexOf(r.winnerSession);
   if(!same(state.signer,this.chain.signer.address))throw Error('Locked duel signer is unavailable');
   const message={duelId:id,matchId:slotHash(d.id,0),participantA:d.wallets[0],participantB:d.wallets[1],winnerRecipient:r.winnerSession?d.wallets[seat]:zeroAddress,outcomeType:{Finished:0,Forfeit:1,Void:2}[r.outcome],rulesetHash:state.rulesetHash,replayHash:r.replayHash,finishedAt:BigInt(r.finishedAt),resultSequence:1,signerEpoch:state.signerEpoch,expiresAt:state.settlementDeadline};
   const signature=await this.chain.signer.signTypedData({domain:{name:'CHOG Paid Duel',version:'1',chainId:this.chain.chainId,verifyingContract:this.address},types:{Result:fields},primaryType:'Result',message});job.payload.signed={message:normalize(message),signature};this.store.updateOutbox(job.id,{payload:job.payload});
  }
  const {message,signature}=job.payload.signed;return {...base,functionName:'submitResult',args:[{...message,finishedAt:BigInt(message.finishedAt),expiresAt:BigInt(message.expiresAt)},signature]};
 }
 awardJobs(id,events){const awards=new Map();for(const e of events.filter(e=>e.eventName==='CreditAwarded')){const key=e.args.recipient.toLowerCase(),a=awards.get(key)||{recipient:e.args.recipient,amount:0n};a.amount+=e.args.amount;awards.set(key,a);}for(const [key,a] of awards)this.store.enqueue({id:id+':withdraw:'+key,cupId:id,kind:'duel-withdraw',payload:{recipient:a.recipient,amount:a.amount.toString()}});}
 async confirm(job,receipt){
  const events=this.events(receipt),id=cupHash(job.cup_id);if(!events.some(e=>e.args.duelId===id))throw Error('Receipt does not contain this duel');const state=await this.read('getDuel',[id]);
  if(job.kind==='duel-create'){const e=events.find(e=>e.eventName==='DuelCreated');if(!e||e.args.rulesetHash!==BUILD_HASH||e.args.players.some((a,i)=>!same(a,job.payload.players[i])))throw Error('Created duel terms mismatch');this.store.updateDuel(job.cup_id,{state:this.store.duel(job.cup_id).state==='Cancelling'?'Cancelling':'Funding',start_block:receipt.blockNumber.toString()});}
  else if(job.kind==='duel-activate'){if(!events.some(e=>e.eventName==='DuelActivated')||state.state!==2||state.fundedMask!==3)throw Error('Duel activation mismatch');this.store.updateDuel(job.cup_id,{state:'Active',locked:Number(state.lockedAt)*1000,funded_mask:3});}
  else if(job.kind==='duel-result'){const e=events.find(e=>e.eventName==='DuelSettled'),r=job.payload.signed.message;if(!e||!same(e.args.winner,r.winnerRecipient)||e.args.outcomeType!==r.outcomeType||e.args.replayHash!==r.replayHash||![3,4].includes(Number(state.state)))throw Error('Duel result mismatch');this.store.updateDuel(job.cup_id,{state:state.state===3?'Complete':'Cancelled',cancel_reason:state.state===4?'verified_void':null});this.awardJobs(job.cup_id,events);}
  else if(job.kind==='duel-cancel'||job.kind==='duel-refund'){if(state.state!==4||!events.some(e=>e.eventName==='DuelCancelled'))throw Error('Duel cancellation mismatch');this.store.updateDuel(job.cup_id,{state:'Cancelled',cancel_reason:job.kind==='duel-refund'?'expired':'cancelled_before_start'});this.awardJobs(job.cup_id,events);}
  else if(job.kind==='duel-withdraw'){
   const e=events.find(e=>e.eventName==='Paid');if(!e||!same(e.args.recipient,job.payload.recipient)||e.args.amount!==BigInt(job.payload.amount)||!same(e.args.token,this.chain.token))throw Error('Duel payout mismatch');
   const transferred=receipt.logs.some(log=>{if(!same(log.address,this.chain.token))return false;try{const event=decodeEventLog({abi:tokenAbi,...log});return event.eventName==='Transfer'&&same(event.args.from,this.address)&&same(event.args.to,job.payload.recipient)&&event.args.value===BigInt(job.payload.amount);}catch{return false;}});if(!transferred)throw Error('Duel payout transfer was not verified');
  }else throw Error('Unknown duel confirmation');
  this.store.transaction(()=>{this.store.db.prepare('INSERT OR IGNORE INTO chain_receipts VALUES(?,?,?,?)').run(receipt.transactionHash,job.cup_id,job.kind,JSON.stringify(normalize(receipt)));this.store.updateOutbox(job.id,{state:job.kind==='duel-withdraw'?'paid':'confirmed',tx_hash:receipt.transactionHash,error:null});});
  await this.advance(job.cup_id);
 }
 async claim(duel,session){this.requireEnabled();const seat=this.participant(duel,session,{wallet:true}),recipient=duel.wallets[seat],amount=await this.read('credits',[cupHash(duel.id),recipient]);if(amount<=0n)throw Error('No unpaid test-token credit remains');return {chainId:this.chain.chainId,to:this.address,data:encodeFunctionData({abi:this.abi,functionName:'withdrawFor',args:[cupHash(duel.id),recipient]}),value:'0x0'};}
 async confirmClaim(duel,session,hash){const seat=this.participant(duel,session,{wallet:true});if(!hashPattern.test(hash||''))throw Error('Invalid claim hash');const row=this.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(duel.id+':withdraw:'+duel.wallets[seat].toLowerCase());if(!row)throw Error('Award has not been recorded');await this.confirm({...row,payload:JSON.parse(row.payload)},await this.chain.public.getTransactionReceipt({hash}));return this.report(duel.id,session.id);}
}
