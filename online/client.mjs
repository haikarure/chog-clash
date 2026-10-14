import {createCombat,BUTTONS,RULESET} from './core.mjs';
import {BUILD_HASH} from './build.mjs';
import {CupFunding,DuelFunding,TestnetFaucet,AUSD_FAUCET,formatTestAUSD,connectVerifiedWallet,ensureWalletNetwork,sendWalletTransaction,walletReceipt} from './payments.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=address=>address?address.slice(0,6)+'…'+address.slice(-4):'Connect wallet';
const game=()=>window.__game;
const get=id=>window.CHOG.byId[id];
let app=null;
export async function openOnline(view='friend') {
 if(!app)app=new OnlineApp();await app.open(view);
}
// Read-only diagnostics: no session tokens, invitations or wallet signatures.
export function onlineDiagnostics(){return app?{view:app.view,connected:app.connected,seat:app.seat,authority:app.net,rendered:app.model?.snapshot(),pending:app.pending.length,corrections:app.corrections.slice()}:null;}
export function paidPrizeStatus(duel,winnerSeat,playerSeat){
 const refund=winnerSeat===null,recipient=duel?.participants?.find(p=>p.seat===(refund?playerSeat:winnerSeat))?.wallet,amount=refund?1000000n:1900000n;
 const transfer=duel?.transactions?.find(t=>t.kind==='duel-withdraw'&&recipient&&t.recipient?.toLowerCase()===recipient.toLowerCase()&&/^\d+$/.test(t.amount||'')&&BigInt(t.amount)>=amount);
 return {refund,playerWon:!refund&&winnerSeat===playerSeat,amount:amount.toString(),confirmed:transfer?.state==='paid',hash:transfer?.hash||null};
}
class OnlineApp {
 constructor(){
  this.root=document.createElement('section');this.root.id='online-root';this.root.setAttribute('aria-label','CHOG online arcade');this.root.hidden=true;document.body.append(this.root);
  this.view='entry';this.nickname='CHOG player';this.chog='yot';this.stage='house-cup';this.cupName='CHOG House Cup';this.cupMode='practice';this.error='';this.room=null;this.net=null;this.seat=0;this.model=null;this.prepared='';this.preparing=false;this.seq=0;this.bits=0;this.pulses=0;this.pending=[];this.confirmedEvents=new Set();this.currentMatch=null;this.cup=null;this.lastRender='';this.connected=true;this.corrections=[];this.timer=null;this.lastStep=performance.now();
  this.onlineReady=false;this.creating=false;this.queue=null;this.queueActive=false;this.queueRefreshing=false;this.duel=null;this.duelId=null;this.duelInvite=null;this.duelPayment=null;this.pvpMode='paid';this.duelApprovalEntries=10;
  this.root.addEventListener('click',e=>{const button=e.target.closest('button');if(button&&!button.disabled)this.action(button.dataset.action,button.dataset).catch(error=>this.notify(error.message));});
  this.root.addEventListener('input',e=>{if(e.target.id==='online-nickname')this.nickname=e.target.value;if(e.target.id==='cup-name')this.cupName=e.target.value;});
  this.root.addEventListener('input',e=>{if(e.target.id==='funding-recovery-hash')this.fundingInput=e.target.value;});
  this.root.addEventListener('input',e=>{if(e.target.id==='faucet-recovery-hash')this.faucetInput=e.target.value;});
  this.root.addEventListener('change',e=>{if(e.target.id==='online-stage'){this.stage=e.target.value;this.room?.send('select',{stage:this.stage});}if(e.target.id==='cup-mode'){this.cupMode=e.target.value;this.render(true);}});
  this.root.addEventListener('change',e=>{if(e.target.id==='duel-reuse-approval'){this.duelApprovalEntries=e.target.checked?10:1;try{localStorage.setItem('chog-duel-approval-choice-v1:'+this.wallet.toLowerCase(),String(this.duelApprovalEntries));}catch{}if(this.duelFunding&&!this.duelFunding.busy)this.duelFunding.setApprovalEntries(this.duelApprovalEntries);this.render(true);}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.input(null,false);});
  window.addEventListener('blur',()=>this.input(null,false));
 }
 async request(path,body){const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(this.token?{'Authorization':'Bearer '+this.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});let result;try{result=await response.json();}catch{throw Error('Online play is unavailable on this host. Return to the local arcade.');}if(!response.ok)throw Error(result.error||'The request could not be verified');return result;}
 navigate(address){const url=new URL(address,location.href),current=new URLSearchParams(location.search);for(const key of ['touch','embed'])if(current.has(key))url.searchParams.set(key,current.get(key));history.replaceState(null,'',url.href);if(window.parent!==window)window.parent.postMessage({type:'chog-navigation',query:url.search},location.origin);}
 async open(view){
  this.onlineReady=false;
  this.root.hidden=false;game().setMenuOpen(true);document.querySelector('#front-menu').hidden=true;
  this.pvpMode=view==='casual'?'casual':'paid';this.view=view==='cup'?'cup-create':view==='paid'?'paid-create':'entry';this.error='';this.render(true);
  try{
   this.config=await this.request('/config');if(this.config.buildHash!==BUILD_HASH)throw Error('Your game version changed. Reload to join online.');
   const session=await this.request('/session');this.token=session.token;this.wallet=Number(session.walletExpires)>Date.now()?session.wallet:null;
   await this.sdk();
   const params=new URLSearchParams(location.search);
   if(params.has('room')){this.cupId=params.get('cup');this.duelId=params.get('duel');await this.join(params.get('room'),params.get('invite'));}
   else if(params.has('cup')){this.cupId=params.get('cup');this.cupInvite=params.get('invite');await this.refreshCup();this.view='cup';}
   else if(params.has('duel')){this.duelId=params.get('duel');this.duelInvite=params.get('invite');await this.refreshDuel();this.view='duel';}
   else if(params.has('queue')){this.queueActive=true;this.view='queue';await this.refreshQueue();}
   this.onlineReady=true;this.render(true);if(this.wallet&&this.faucetAvailable())this.faucetController().sync();
   if(!this.timer){this.lastStep=performance.now();this.debt=0;this.timer=setInterval(()=>{const now=performance.now();this.debt+=Math.min(100,now-this.lastStep);this.lastStep=now;let steps=0;while(this.debt>=1000/60&&steps++<5){this.debt-=1000/60;this.step();}},8);}
   if(!this.poll)this.poll=setInterval(()=>{if(this.root.hidden)return;if(this.cupId)this.refreshCup().catch(()=>{});if(this.duelId)this.refreshDuel().catch(()=>{});if(this.queueActive)this.refreshQueue().catch(error=>this.notify(error.message));},1500);
  }catch(error){this.notify(error.message);}
 }
 async sdk(){if(window.Colyseus)return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='online/vendor/colyseus.js';script.onload=resolve;script.onerror=()=>reject(Error('Could not load the online connection. Retry.'));document.head.append(script);});}
 header(label='PLAY TOGETHER'){return `<header class="online-header"><button class="online-brand" data-action="exit"><img src="assets/chog/ui/favicon.svg" alt=""><span>CHOG <b>CLASH</b><small>THE HOUSE CUP</small></span></button><span class="online-location">${label}</span><button class="paper-button" data-action="exit">BACK TO ARCADE</button></header>`;}
 message(){return `<p class="online-message" id="online-message" role="status" ${this.error?'':'hidden'}>${escape(this.error)}</p>`;}
 personaGrid(selected=this.chog,disabled=false){return `<div class="online-roster" role="group" aria-label="Choose your CHOG">${CHOG.characters.map(c=>`<button class="online-persona ${c.id===selected?'selected':''}" data-action="pick" data-chog="${c.id}" aria-label="${c.displayName}" aria-pressed="${c.id===selected}" ${disabled?'disabled':''} style="--persona:${c.color}"><img src="${c.portrait}" alt=""><span>${c.id==='ping'?'Ping ×4':c.displayName}</span></button>`).join('')}</div>`;}
 preview(chog,side,label){const c=get(chog)||get('yot');return `<article class="online-showcase ${side}"><small>${escape(label)}</small><img src="${c.reference}" alt="${c.displayName}"><h2>${c.displayName}</h2><p>${c.title}</p></article>`;}
 nicknameField(){return `<label class="online-field">YOUR NAME<input id="online-nickname" maxlength="24" value="${escape(this.nickname)}" autocomplete="nickname"></label>`;}
 queueView(){return `${this.header('QUICK MATCH')}<main class="online-cup-create"><section class="online-title"><span class="eyebrow">YOUR NEXT RIVAL</span><h1>FIND THE <em>FIGHT.</em></h1><p>Your CHOG is ${escape(get(this.chog).displayName)}. Two waiting players enter the same arena.</p>${this.preview(this.chog,'player','YOUR PICK')}</section><section class="online-form-panel"><h2>${this.queue?.state==='Pairing'?'MATCH FOUND':'SEARCHING FOR A CHOG…'}</h2><p role="status">${this.queue?.state==='Pairing'?'Preparing your arena.':'Keep this page open. You can cancel while waiting; search expires after two minutes.'}</p><p class="online-test-label">${this.queue?.kind==='paid'?escape(this.config?.paidDuel.label||'Monad testnet')+' · 1 '+this.duelUnit()+' each after pairing · no monetary value':'Free casual match · no wallet or entry fee'}</p><button class="paper-button" data-action="cancel-queue">CANCEL SEARCH</button>${this.message()}</section></main>`;}
 async refreshQueue(){
  if(!this.queueActive||this.queueRefreshing)return;this.queueRefreshing=true;
  try{const q=await this.request('/queue');this.queue=q;
   if(q.state==='Matched'&&q.duelId){this.queueActive=false;this.duelId=q.duelId;this.duelInvite=null;this.view='duel';this.navigate(`play.html?duel=${q.duelId}`);await this.refreshDuel();await this.request('/queue/ack',{});}
   else if(q.state==='Matched'&&q.roomId){this.queueActive=false;await this.join(q.roomId,null);await this.request('/queue/ack',{});}
   else if(q.state==='Idle'){this.queueActive=false;this.pvpMode=(q.kind||this.pvpMode)==='paid'?'paid':'casual';this.view='entry';this.navigate('play.html?online='+this.pvpMode);this.error='Search ended. Choose Quick Match to try again.';}
   this.render();
  }finally{this.queueRefreshing=false;}
 }
 duelUnit(){return this.config?.paidDuel.chainId===31337?'MOCK':'AUSD';}
 pvpModePicker(){const paid=this.pvpMode==='paid';return `<div class="online-pvp-modes" role="group" aria-label="1v1 stakes"><button class="paper-button ${paid?'selected':''}" data-action="pvp-mode" data-mode="paid" aria-pressed="${paid}"><b>1 ${this.duelUnit()} DUEL</b><small>Winner 1.90 · fee 0.10</small></button><button class="paper-button ${paid?'':'selected'}" data-action="pvp-mode" data-mode="casual" aria-pressed="${!paid}"><b>FREE 1v1</b><small>No entry · no payout</small></button></div>`;}
 paidTransaction(hash){return this.config?.paidDuel.chainId===31337?`<code>${escape(hash)}</code>`:`<a href="https://testnet.monadscan.com/tx/${escape(hash)}" target="_blank" rel="noopener noreferrer">VIEW TRANSACTION ↗</a>`;}
 paidTerms(){const c=this.config?.paidDuel,fee=(c?.feeBps??500)/100;return `<div class="online-pool"><small>${escape(c?.label||'Monad testnet')} · NO MONETARY VALUE</small><strong>1 + 1 ${this.duelUnit()}</strong><p>Winner ${(Number(c?.winnerAward||1900000)/1000000).toFixed(2)} · platform ${(2*fee/100).toFixed(2)} (${fee}%)</p></div><p>Two distinct wallets fund equal entries before the duel locks. Cancellation before lock, Void or expired settlement refunds deposited entries in full; no platform fee. MON network fees are separate.</p><p>90s rounds · up to 3 rounds + deciding overtime · Ready within 60s · 20s total reconnect budget. Surrender/disconnect may be a forfeit. The game server decides the result; escrow enforces payouts.</p>`;}
 faucetAvailable(){return this.config?.paidDuel.chainId===AUSD_FAUCET.chainId&&this.config.paidDuel.token?.toLowerCase()===AUSD_FAUCET.token.toLowerCase();}
 faucetController(){
  if(!this.faucetAvailable()||!this.wallet)throw Error('Connect a wallet on Monad testnet first');
  if(this.faucet?.wallet.toLowerCase()!==this.wallet.toLowerCase()){
   const flow=new TestnetFaucet({wallet:this.wallet,storage:localStorage,provider:()=>window.ethereum,onChange:()=>{if(this.faucet===flow&&this.wallet?.toLowerCase()===flow.wallet.toLowerCase())this.render();}});this.faucet=flow;this.faucetInput='';
  }return this.faucet;
 }
 faucetPanel(){
  if(!this.faucetAvailable())return '';
  const s=this.wallet?this.faucetController().snapshot():{},pending=s.phase==='pending',uncertain=s.phase==='awaiting-wallet'&&!s.busy;
  const label=s.busy?(s.phase==='awaiting-wallet'?'CONFIRM IN YOUR WALLET…':'CHECKING CLAIM…'):pending?'CHECK CLAIM STATUS':uncertain?'CHECK YOUR WALLET':this.wallet?'CLAIM TESTNET AUSD ↗':'CONNECT & CLAIM TESTNET AUSD ↗';
  const status=s.error|| (s.phase==='confirmed'?`${formatTestAUSD(s.amount)} AUSD received in your wallet.`:pending?'Claim submitted. Waiting for confirmation.':s.phase==='awaiting-wallet'?'Complete the request in your wallet.':'Get free test tokens from the Agora faucet.');
  return `<section class="online-faucet" aria-label="Testnet AUSD faucet"><div class="online-faucet-heading"><strong>NEED TEST AUSD?</strong><span>${s.balance!==null&&s.balance!==undefined?escape(formatTestAUSD(s.balance))+' AUSD':'Connect to check your balance'}</span></div><button class="paper-button" data-action="claim-faucet" ${!this.onlineReady||this.walletBusy||s.busy||uncertain?'disabled':''}>${label}</button><p>Monad testnet · MON needed for gas</p><p class="online-faucet-status" role="status">${escape(status)}</p>${s.hash?`<a href="https://testnet.monadscan.com/tx/${escape(s.hash)}" target="_blank" rel="noopener noreferrer">VIEW CLAIM TRANSACTION ↗</a>`:''}${uncertain?`<label class="online-field">SUBMITTED IN YOUR WALLET?<input id="faucet-recovery-hash" value="${escape(this.faucetInput||'')}" placeholder="Claim transaction hash" autocomplete="off" spellcheck="false"></label><button class="paper-button" data-action="recover-faucet" ${this.walletBusy?'disabled':''}>RECOVER CLAIM</button>`:''}</section>`;
 }
 paidCreate(){return `${this.header('1v1 DUEL · TESTNET STAKES')}<main class="online-cup-create"><section class="online-title"><span class="eyebrow">TWO ENTRIES. ONE WINNER.</span><h1>PUT YOUR <em>CHOG IN.</em></h1><p>Invite a rival or find another player. Test tokens demonstrate the complete escrow flow.</p>${this.preview(this.chog,'player','YOUR CHOG')}</section><section class="online-form-panel">${this.pvpModePicker()}${this.nicknameField()}${this.personaGrid()}${this.paidTerms()}<button class="paper-button" data-action="wallet" ${this.walletBusy?'disabled':''}>${escape(short(this.wallet))}</button>${this.faucetPanel()}<button class="solid-button" data-action="create-paid" ${this.onlineReady&&!this.creating&&this.config?.paidDuel.enabled?'':'disabled'}>${this.creating?'PREPARING DUEL…':'ACCEPT & INVITE FRIEND · 1 '+this.duelUnit()+' ↗'}</button><button class="paper-button" data-action="paid-queue" ${this.onlineReady&&!this.creating&&this.config?.paidDuel.enabled?'':'disabled'}>ACCEPT & QUICK MATCH · 1 ${this.duelUnit()}</button><button class="paper-button" data-action="friend">FREE CASUAL PvP</button>${!this.config?.paidDuel.enabled?`<p role="status">${escape(this.config?.paidDuel.reason||'Checking the prize service…')}</p>`:''}${this.message()}</section></main>`;}
 duelView(){const d=this.duel;if(!d)return this.header('PAID DUEL')+'<p class="online-loading">Loading your duel…</p>';const mine=d.participants.find(p=>p.isYou),canJoin=!mine&&this.duelInvite&&d.state==='Draft',p=this.duelPayment||{},canFund=mine&&d.state==='Funding'&&!mine.funded;
  const invite=d.invite?new URL(`play.html?duel=${d.id}&invite=${d.invite}`,location.href).href:null;
  return `${this.header('PAID TESTNET DUEL')}<main class="online-cup"><div class="online-cup-heading"><div><span class="eyebrow">${escape(d.moneyLabel)}</span><h1>THE PAID <em>DUEL.</em></h1></div><b class="online-state">${escape(d.state)}</b></div>${this.paidTerms()}<section class="online-participants online-duel-participants">${d.participants.map(player=>`<article><b>P${player.seat+1}${player.isYou?' · YOU':''}</b><img src="${get(player.chog||'yot').portrait}" alt=""><strong>${escape(player.nickname||'Waiting for your rival')}</strong><code>${escape(short(player.wallet))}</code><small>${player.funded?'✓ ENTRY CONFIRMED':'ENTRY NOT FUNDED'}</small></article>`).join('')}</section>
  ${invite?`<section class="online-check-in"><label class="online-field">DUEL INVITATION<input readonly aria-label="Paid duel invite link" value="${escape(invite)}"></label><button class="paper-button" data-action="copy-paid">COPY DUEL INVITE</button></section>`:''}
  ${canJoin?`<section class="online-check-in-form"><div><h2>JOIN YOUR RIVAL</h2>${this.nicknameField()}<button class="paper-button" data-action="wallet">${escape(short(this.wallet))}</button>${this.faucetPanel()}</div><div>${this.personaGrid()}<button class="solid-button" data-action="join-paid" ${this.creating?'disabled':''}>ACCEPT TERMS & JOIN ↗</button></div></section>`:''}
  ${canFund?`${this.faucetPanel()}<section class="online-funding"><div><h2>FUND YOUR ENTRY</h2><p>${p.approvalNeeded===false?'Your token permission is ready. Only the 1 '+this.duelUnit()+' deposit needs confirmation.':'Set a token spending limit once, then deposit 1 '+this.duelUnit()+' for this duel.'} Your character and recipient are fixed.</p>${p.approvalNeeded!==false?`<label class="online-approval-choice"><input type="checkbox" id="duel-reuse-approval" ${this.duelApprovalChoice()===10?'checked':''} ${p.busy||this.walletBusy||!this.wallet?'disabled':''}><span>FEWER WALLET PROMPTS<small>Allow up to 10 ${this.duelUnit()} for 10 entries. Only 1 ${this.duelUnit()} is deposited now; future entries still need your confirmation. Turn off for a 1 ${this.duelUnit()} limit.</small></span></label>`:''}<p role="status">${escape(p.error||p.phase||'Checking your entry…')}</p></div><div class="online-funding-buttons"><button class="paper-button" data-action="wallet" ${p.busy?'disabled':''}>${escape(short(this.wallet))}</button><button class="solid-button" data-action="fund-duel" ${p.busy||this.walletBusy||(this.wallet&&!p.canFund)?'disabled':''}>${p.busy||this.walletBusy?'WAITING FOR WALLET…':!this.wallet?'CONNECT & FUND 1 '+this.duelUnit():p.approvalNeeded?'ALLOW '+this.duelApprovalChoice()+' & DEPOSIT 1 '+this.duelUnit():'DEPOSIT 1 '+this.duelUnit()+' · ONE CONFIRMATION'}</button></div><details class="online-funding-details"><summary>TRANSACTION STATUS & RECOVERY</summary><button class="paper-button" data-action="check-duel-funding" ${p.busy?'disabled':''}>CHECK ENTRY STATUS</button><label class="online-field">ALREADY SUBMITTED IN YOUR WALLET?<input id="funding-recovery-hash" value="${escape(this.fundingInput||'')}" placeholder="Transaction hash" autocomplete="off" spellcheck="false"></label><button class="paper-button" data-action="recover-duel-funding" ${p.busy?'disabled':''}>RECOVER THIS ENTRY</button></details></section>`:''}
  <div class="online-cup-actions">${mine&&d.state==='Active'&&d.roomId?'<button class="solid-button" data-action="open-paid-match">BOTH ENTRIES LOCKED · OPEN MATCH ↗</button>':''}${mine&&['Draft','Creating','Funding'].includes(d.state)?'<button class="paper-button" data-action="cancel-duel">CANCEL BEFORE LOCK & REFUND</button>':''}${mine&&d.transactions.some(t=>t.error||t.state==='failed')?'<button class="paper-button" data-action="retry-duel">RETRY PENDING ESCROW TRANSACTION</button>':''}${mine&&['Complete','Cancelled'].includes(d.state)&&d.transactions.some(t=>t.kind==='duel-withdraw'&&t.state!=='paid'&&t.recipient?.toLowerCase()===mine.wallet?.toLowerCase())?`<button class="paper-button" data-action="claim-duel" ${this.walletBusy?'disabled':''}>CLAIM UNPAID CREDIT</button>`:''}</div>
  ${d.result?`<section class="online-cup-result"><span class="eyebrow">${escape(d.result.outcome)}</span><h2>${d.result.winnerSeat===null?'FULL ENTRY REFUND':escape(d.participants[d.result.winnerSeat]?.nickname)+' WINS'}</h2><p>${escape(d.result.reason?.replaceAll('_',' ')||'')} · ${escape(d.cancelReason||'')}</p></section>`:''}<section class="online-report"><h2>ESCROW TRANSACTIONS</h2><p>Payout is complete only when the token transfer is verified. Awaiting/failed transactions retain unpaid credits.</p>${d.transactions.length?d.transactions.map(t=>`<div class="online-tx"><span>${escape(t.kind.replace('duel-',''))} · ${escape(t.state)}${t.amount?' · '+(Number(t.amount)/1000000).toFixed(2)+' '+this.duelUnit():''}</span>${t.hash?this.paidTransaction(t.hash):''}${t.error?`<p>${escape(t.error)}</p>`:''}</div>`).join(''):'<p>Invite your rival first. Funding becomes available after the duel escrow is confirmed.</p>'}</section>${this.message()}</main>`;
 }
 duelApprovalChoice(){if(this.wallet&&this.approvalChoiceWallet!==this.wallet.toLowerCase()){this.approvalChoiceWallet=this.wallet.toLowerCase();try{const saved=localStorage.getItem('chog-duel-approval-choice-v1:'+this.approvalChoiceWallet);this.duelApprovalEntries=saved==='1'?1:10;}catch{this.duelApprovalEntries=10;}}return this.duelApprovalEntries;}
 paidFundingController(){const context={cupId:this.duelId,chainId:this.config?.paidDuel.chainId,contract:this.config?.paidDuel.contract,token:this.config?.paidDuel.token,wallet:this.wallet};if(!context.contract||!context.wallet)throw Error('Verify the wallet assigned to this duel first');const key=[context.cupId,context.chainId,context.contract,context.wallet].join(':');if(this.duelFunding?.contextKey!==key){const flow=new DuelFunding({context,approvalEntries:this.duelApprovalChoice(),storage:localStorage,provider:()=>window.ethereum,request:(...args)=>this.request(...args),onChange:state=>{if(this.duelId===context.cupId&&this.duelFunding===flow){this.duelPayment=state;if(state.report)this.duel=state.report;this.render();}}});flow.contextKey=key;this.duelFunding=flow;this.duelPayment=flow.snapshot();}if(!this.duelFunding.busy)this.duelFunding.setApprovalEntries(this.duelApprovalChoice());return this.duelFunding;}
 async refreshDuel(){if(!this.duelId)return;const id=this.duelId,d=await this.request(`/duels/${id}`);if(this.duelId!==id)return;this.duel=d;if(d.participants.some(p=>p.isYou)&&d.state==='Funding'&&this.wallet&&this.config?.paidDuel.enabled)try{await this.paidFundingController().sync();}catch{}if(this.view==='duel'||(this.view==='match'&&this.net?.duelId))this.render();}
 entry(){if(this.pvpMode==='paid')return this.paidCreate();return `${this.header('FREE 1v1 · NO STAKES')}<main class="online-entry"><div class="online-title"><span class="eyebrow">ONE LINK. TWO CHOG. YOUR RIVAL.</span><h1>BRING A <em>FRIEND.</em></h1><p>Pick a persona, share your room, and settle it in the arena. All 12 fighters are free.</p></div><div class="online-selection">${this.preview(this.chog,'player','YOUR CHOG')}<section class="online-pick-panel">${this.pvpModePicker()}${this.nicknameField()}${this.personaGrid()}<label class="online-field">THE PLACE<select id="online-stage">${Object.entries(MatchRules.stages).map(([id,s])=>`<option value="${id}" ${id===this.stage?'selected':''}>${escape(s.name)}</option>`).join('')}</select></label><button class="solid-button" data-action="create-room" ${this.onlineReady&&!this.creating?'':'disabled'}>${this.creating?'CREATING ROOM…':this.onlineReady?'INVITE FRIEND · FREE ↗':'CONNECTING…'}</button><button class="paper-button" data-action="quick-match" ${this.onlineReady&&!this.creating?'':'disabled'}>QUICK MATCH · FREE ↗</button><button class="paper-button" data-action="paid-create">PAID TESTNET DUEL</button><button class="paper-button" data-action="cup-create">HOST A HOUSE CUP</button><p class="online-note">Free casual PvP · no wallet required</p></section>${this.preview('mamio','rival','WHO WILL YOU INVITE?')}</div>${this.message()}</main>`;}
 lobby(){const slots=this.net?.slots||[{chog:this.chog,nickname:this.nickname},{chog:'mamio',nickname:'Waiting for friend'}],me=slots[this.seat],other=slots[1-this.seat],cup=!!this.net?.cupId,paid=!!this.net?.duelId,locked=cup||paid;
  const link=this.inviteLink||location.href,checking=locked&&(me.rttSamples||0)<10;
  return `${this.header(cup?'HOUSE CUP MATCH':paid?'PAID DUEL · ENTRIES LOCKED':'PRIVATE DUEL')}<main class="online-entry"><div class="online-title"><span class="eyebrow">${cup?'YOUR CUP MATCH':'INVITE YOUR RIVAL'}</span><h1>${other.connected?'READY, <em>CHOG?</em>':'THE RIVAL <em>SEAT.</em>'}</h1><p>${cup?'Your Cup persona is locked. Load the match and confirm Ready.':'Both players confirm Ready after their artwork loads.'}</p></div><div class="online-selection">${this.preview(me.chog,'player',`P${this.seat+1} · ${me.nickname||'YOU'}`)}<section class="online-pick-panel"><div class="online-seat-status"><span>${me.ready?'✓ YOU ARE READY':'CHOOSE & READY'}</span><span>${other.connected?(other.ready?'✓ RIVAL READY':'RIVAL CONNECTED'):'WAITING FOR FRIEND'}</span></div>${locked?'':this.personaGrid(me.chog,me.ready)}<p class="online-note" id="connection-note">${checking?`Checking connection · ${me.rttSamples||0}/10`:`${Math.round(me.rtt||0)} ms · ${escape(MatchRules.stages[this.net?.stage||this.stage].name)}`}</p>${!cup&&!paid&&this.net?.matchKind!=='quick'?`<label class="online-field">ROOM INVITATION<input readonly value="${escape(link)}" aria-label="Room invite link"></label><button class="paper-button" data-action="copy-room">COPY INVITE LINK</button>`:''}<button class="solid-button" data-action="${me.ready?'unlock':'ready'}" ${!other.connected||this.preparing||checking?'disabled':''}>${this.preparing?'LOADING YOUR MATCH…':me.ready?'UNLOCK YOUR PICK':checking?'CHECKING CONNECTION…':'LOCK IN & READY ↗'}</button>${cup?'<button class="paper-button" data-action="cup-back">VIEW BRACKET</button>':paid?'<button class="paper-button" data-action="duel-back">VIEW ESCROW</button>':'<button class="paper-button" data-action="exit">BACK TO ARCADE</button>'}<p class="online-note">90s rounds · up to 3 rounds · one deciding overtime if tied</p>${this.message()}</section>${this.preview(other.chog,'rival',`P${2-this.seat} · ${other.connected?other.nickname:'WAITING FOR FRIEND'}`)}</div></main>`;}
 cupCreate(){const funded=this.config?.settlement.enabled,mode=this.cupMode;return `${this.header('THE COMMUNITY EVENT')}<main class="online-cup-create"><section class="online-title"><span class="eyebrow">FOUR FRIENDS. ONE CUP.</span><h1>HOST THE <em>CHAOS.</em></h1><p>Four invited players, two semifinals and a final. The bracket follows the server result.</p><img class="online-cup-art" src="assets/chog/landing/comic-showdown.webp" alt="CHOG showdown"></section><section class="online-form-panel"><label class="online-field">CUP NAME<input id="cup-name" maxlength="60" value="${escape(this.cupName)}"></label><label class="online-field">CUP MODE<select id="cup-mode"><option value="practice" ${mode==='practice'?'selected':''}>Practice Cup · free, no prize</option><option value="${this.config?.settlement.mode||'testnet'}" ${mode!=='practice'?'selected':''} ${funded?'':'disabled'}>${escape(this.config?.settlement.label||'Monad testnet prizes')} ${funded?'':'· unavailable'}</option></select></label><div class="online-pool"><small>${mode==='practice'?'PLAY FOR THE CUP':'SPONSOR FUNDS THE PRIZE POOL'}</small><strong>${mode==='practice'?'4 PLAYERS':'100 TEST TOKENS'}</strong><p>${mode==='practice'?'A complete bracket without wallet or payout.':`Champion 70 · runner-up 30 · players enter free<br>${escape(this.config.settlement.label)} · no monetary value`}</p></div><p>One CHOG per player for the entire Cup. A void match cancels the Cup. Forfeits are labelled separately from played matches.</p><button class="solid-button" data-action="create-cup" ${this.onlineReady&&!this.creating?'':'disabled'}>${this.creating?'CREATING CUP…':this.onlineReady?'CREATE YOUR CUP ↗':'CONNECTING…'}</button><button class="paper-button" data-action="friend">PLAY WITH ONE FRIEND</button>${this.message()}</section></main>`;}
 cupView(){const c=this.cup;if(!c)return this.header('HOUSE CUP')+'<p class="online-loading">Loading your Cup…</p>';
  const mine=c.participants.find(p=>p.isYou),canCheck=!mine&&this.cupInvite&&['Draft','Funded'].includes(c.state),allReady=c.participants.every(p=>p.checked&&p.accepted),activeMatch=c.matches.find(m=>m.roomId&&['Scheduled','Playing'].includes(m.state));
  return `${this.header(c.name)}<main class="online-cup"><div class="online-cup-heading"><div><span class="eyebrow">${escape(c.moneyLabel)}</span><h1>${escape(c.name)}</h1></div><b class="online-state">${escape(c.state)}</b></div>${c.mode==='practice'?'<p class="online-test-label">Practice Cup — no prize, wallet or payout.</p>':'<p class="online-test-label">Test tokens only · 100 pool · champion 70 / runner-up 30 · no monetary value</p>'}
   <section class="online-check-in"><h2>THE CREW</h2><div class="online-participants">${c.participants.map(p=>`<article><b>SEAT ${p.slot+1}${p.isYou?' · YOU':''}</b><img src="${get(p.chog||'yot').portrait}" alt=""><strong>${escape(p.nickname||'Waiting for check-in')}</strong><small>${p.checked?`${escape(get(p.chog).displayName)} · CHECKED IN`:'INVITED'}</small>${p.wallet?`<code>${short(p.wallet)}</code>`:''}${c.host&&p.invite?`<button class="paper-button" data-action="copy-cup-invite" data-slot="${p.slot}">COPY INVITE</button>${['Draft','Funded'].includes(c.state)&&p.checked?`<button class="text-button" data-action="replace" data-slot="${p.slot}">REPLACE BEFORE LOCK</button>`:''}`:''}</article>`).join('')}</div></section>
   ${canCheck?`<section class="online-check-in-form"><div><h2>LOCK IN YOUR CHOG</h2><p>Accept the fixed bracket slots, 90s/three-round rules, 20s reconnect budget and Cup cancellation on Void. Funded awards apply only after a valid final.</p>${this.nicknameField()}${c.mode!=='practice'?`<button class="paper-button" data-action="wallet">${escape(short(this.wallet))}</button><p class="online-note">This address receives test-token awards and is fixed after lock.</p>`:''}</div><div>${this.personaGrid()}<button class="solid-button" data-action="check-in" ${c.mode!=='practice'&&!this.wallet?'disabled':''}>ACCEPT RULES & CHECK IN ↗</button></div></section>`:''}
   ${this.fundingView(c)}<div class="online-cup-actions">${activeMatch?`<button class="solid-button" data-action="join-match" data-room="${activeMatch.roomId}">OPEN YOUR ${activeMatch.stage==='FINAL'?'FINAL':'SEMIFINAL'} ↗</button>`:''}${c.host&&((c.state==='Draft'&&c.mode==='practice')||c.state==='Funded')?`<button class="solid-button" data-action="start-cup" ${allReady?'':'disabled'}>LOCK FOUR PLAYERS & START ↗</button>`:''}${c.host&&c.state==='Draft'&&c.mode==='practice'?'<button class="paper-button" data-action="cancel-practice">CANCEL DRAFT CUP</button>':''}${c.host&&c.state==='Funded'&&this.wallet?`<button class="paper-button" data-action="cancel-funding" ${this.walletBusy?'disabled':''}>${this.walletBusy?'WAITING FOR WALLET…':'CANCEL & REFUND SPONSOR'}</button>`:''}</div>
   <section class="online-bracket" aria-label="Cup bracket">${['SF1','SF2','FINAL'].map(stage=>{const m=c.matches.find(m=>m.stage===stage),defaultSlots=stage==='SF1'?[0,1]:stage==='SF2'?[2,3]:[];const people=m?.players||defaultSlots.map(i=>c.participants[i]);return `<article class="bracket-match ${stage==='FINAL'?'final':''}"><small>${stage==='FINAL'?'THE FINAL':stage==='SF1'?'SEMIFINAL 01':'SEMIFINAL 02'}</small><h3>${m?escape(m.state):'UP NEXT'}</h3>${people.length?people.map(p=>`<div><img src="${get(p.chog||'yot').portrait}" alt=""><span>${escape(p.nickname||'Waiting for player')}</span>${m?.winnerSlot===p.slot?'<b>WIN</b>':''}</div>`).join(''):'<p>The semifinal winners meet here.</p>'}<p>${m?.reason?escape(m.reason.replaceAll('_',' ')):stage==='FINAL'?'Winners advance after verified results.':'Slot order is fixed before Cup lock.'}</p></article>`;}).join('')}</section>
   ${c.state==='Complete'?`<section class="online-cup-result"><span class="eyebrow">HOUSE CUP CHAMPION</span><h2>${escape(c.participants[c.championSlot]?.nickname||'Cup complete')}</h2><p>${c.mode==='practice'?'Practice bracket completed. There is no token prize.':'Awards are allocated; payout status is shown below.'}</p></section>`:''}
   <section class="online-report"><h2>EVENT REPORT</h2><div class="online-report-counts"><span><b>${c.counts.played}</b> MATCHES PLAYED</span><span><b>${c.counts.forfeits}</b> FORFEITS</span><span><b>${c.counts.void}</b> VOID</span></div>${c.mode!=='practice'?`<div class="online-transactions">${c.fundingTx?`<p>Funding confirmed <code>${escape(c.fundingTx)}</code></p>`:''}${c.transactions.map(t=>`<p><b>${t.kind==='withdraw'?(t.state==='paid'?'PAID':'PAYOUT PENDING'):escape(t.kind.toUpperCase())}</b> · ${escape(t.state)} ${t.recipient?`<small>${escape(short(t.recipient))} · ${Number(t.amount)/1000000} TEST TOKENS</small>`:''} ${t.tx_hash?`<code>${escape(t.tx_hash)}</code>`:''}${t.error?`<small>${escape(t.error)}</small>`:''}</p>`).join('')}</div><button class="paper-button" data-action="retry-payout">CHECK PAYOUT STATUS</button>${(mine&&c.state==='Complete')||(c.host&&c.state==='Cancelled')?'<button class="paper-button" data-action="claim">CLAIM TEST TOKENS WITH WALLET</button><p class="online-note">Optional relay fallback. Your wallet pays test gas; tokens go to the locked recipient.</p>':''}${c.host&&c.state==='Active'&&Date.now()>c.locked+4500000?'<button class="paper-button" data-action="refund">REFUND EXPIRED CUP</button>':''}`:''}<p>No claim of unique humans, marketing conversions or sponsor ROI is inferred from these counts.</p></section>${this.message()}</main>`;
 }
 fundingView(c){
  if(!c.host||c.mode==='practice'||!['Draft','Funded'].includes(c.state))return '';
  const p=this.payment||{},funded=c.state==='Funded',steps=p.steps||{},labels={'wallet-needed':'Connect the sponsor wallet to begin.','not-started':'Check the network and sponsor balance before funding.','approval-ready':'Two wallet confirmations: approve 100 test tokens, then deposit the prize pool.','deposit-ready':'Approval is ready. Continue with the 100 test-token deposit.','approval-pending':'Approval submitted. Wait for confirmation before the deposit.','deposit-pending':'Deposit submitted. Check its status; you do not need to fund again.','recovering-confirmation':'The pool is funded onchain. Recovering its confirmation; do not send another deposit.','confirmed':'The 100 test-token pool is confirmed. Players can check in and the host can start when all four are ready.'};
  const interrupted=Object.entries(steps).find(([,step])=>step.status==='awaiting-wallet'&&!step.hash),pending=Object.values(steps).some(step=>step.status==='pending'),busy=p.busy||this.walletBusy;
  const message=funded?labels.confirmed:p.error||(interrupted&&!p.busy?'Check the interrupted wallet request, or paste its submitted transaction hash below.':labels[p.phase]||(this.wallet?'Checking funding status…':labels['wallet-needed']));
  const describe=(phase,name)=>{const step=steps[phase]||{},done=funded||step.status==='confirmed';return `<li class="${done?'done':step.status==='failed'?'failed':''}"><b>${done?'✓':phase==='approval'?'1':'2'} ${name}</b><span>${done?'Confirmed':step.status==='awaiting-wallet'?'Confirm in your wallet':step.status==='pending'?'Submitted · waiting for confirmation':step.status==='failed'?'Not completed · retry available':'Not submitted'}</span>${step.hash?`<code>${escape(step.hash)}</code>`:''}${step.feeWei?`<small>Estimated network fee: ${(Number(step.feeWei)/1e18).toFixed(5)} MON</small>`:''}</li>`;};
  return `<section class="online-funding" aria-label="Sponsor funding" aria-busy="${!!busy}"><div><h2>${funded?'PRIZE POOL CONFIRMED':'FUND YOUR CUP'}</h2><p>100 test tokens · champion 70 / runner-up 30 · players enter free</p><p>Network fees are paid separately in MON. Token approval only permits this Cup escrow to transfer 100 test tokens.</p><p class="online-funding-status" role="status">${escape(message)}</p></div><ol>${describe('approval','TOKEN APPROVAL')}${describe('deposit','PRIZE DEPOSIT')}</ol>${!funded?`<div class="online-funding-buttons"><button class="paper-button" data-action="wallet" ${busy?'disabled':''}>${escape(short(this.wallet))}</button><button class="solid-button" data-action="fund" ${!this.wallet||!this.config?.settlement.enabled||!p.canFund||busy?'disabled':''}>${p.busy?'WAITING FOR CONFIRMATION…':p.approvalNeeded?'APPROVE & FUND 100 TEST TOKENS':'DEPOSIT 100 TEST TOKENS'}</button><button class="paper-button" data-action="confirm-funding" ${busy||!this.wallet?'disabled':''}>CHECK FUNDING STATUS</button></div>${(interrupted||pending||p.onchainFunded)&&!p.busy?`<div class="online-funding-recovery"><label class="online-field">ALREADY SUBMITTED IN YOUR WALLET?<input id="funding-recovery-hash" value="${escape(this.fundingInput||'')}" placeholder="Paste the transaction hash" autocomplete="off" spellcheck="false"></label><button class="paper-button" data-action="recover-funding">CHECK THIS TRANSACTION</button></div>`:''}`:''}</section>`;
 }
 paidMatchPrize(){const p=paidPrizeStatus(this.duel,this.net.sim.rules.winner,this.seat),unit=this.duelUnit(),title=p.refund?'YOUR 1 '+unit+' REFUND':p.playerWon?'YOU WIN 1.90 '+unit:'WINNER GETS 1.90 '+unit;return `<section class="online-result-stake" aria-label="1v1 payout"><strong>${title}</strong><p>${p.refund?'Full entry returned · no platform fee':'1 '+unit+' per player · platform 0.10 '+unit+' (5%)'} · ${escape(this.config?.paidDuel.label||'Monad testnet')}</p><p role="status">${p.confirmed?p.refund?'YOUR REFUND VERIFIED ONCHAIN':'WINNER PAYOUT VERIFIED ONCHAIN':p.refund?'Refund pending. Check the escrow ledger for progress.':'Payout pending. The reward is confirmed after its token transfer.'}</p>${p.hash?this.paidTransaction(p.hash):''}</section>`;}
 matchView(){const r=this.net.sim.rules,ended=['complete','void'].includes(r.phase),offline=this.net.slots.some(s=>!s.connected),winner=r.winner===null?null:this.net.slots[r.winner],paid=!!this.net.duelId;
  const exit=this.net.cupId?'<button data-action="cup-back">BRACKET</button>':paid?'<button data-action="duel-back">ESCROW</button>':'<button data-action="exit">LEAVE</button>';
  const resultActions=this.net.cupId?'<button class="solid-button" data-action="cup-back">BACK TO THE CUP ↗</button>':paid?'<button class="solid-button" data-action="duel-back">VIEW PAYOUT / REFUND ↗</button><button class="paper-button" data-action="exit">BACK TO ARCADE</button>':`<button class="solid-button" data-action="rematch">${this.net.slots[this.seat].rematch?'WAITING FOR RIVAL':'REMATCH WITH YOUR RIVAL ↗'}</button><button class="paper-button" data-action="exit">BACK TO ARCADE</button>`;
  return `<div class="online-match-toolbar"><span id="online-network-status">${this.connected?paid?'1 '+this.duelUnit()+' PvP':this.net.cupId?'CUP PvP':'FREE PvP':'RECONNECTING'} · ${Math.round(this.net.slots[this.seat].rtt||0)} ms</span><button data-action="surrender" ${ended?'disabled':''}>SURRENDER</button>${exit}</div>${offline&&!ended?`<section class="online-reconnect" role="status"><h2>RECONNECTING</h2><p>Both fighters are paused while the disconnected player returns.</p><strong>${Math.ceil(Math.min(...this.net.slots.filter(s=>!s.connected).map(s=>s.graceRemaining)))}s</strong></section>`:''}${ended?`<section class="online-match-result"><span class="eyebrow">${this.net.persisted?'SERVER VERIFIED':'SAVING RESULT'} · ${escape(r.outcome||'RESULT')}</span><h1>${winner?escape(winner.nickname)+' WINS':'MATCH VOID'}</h1><p>${escape(r.reason?.replaceAll('_',' ')||'')} · ${r.wins[0]} — ${r.wins[1]}</p>${paid?this.paidMatchPrize():'<p class="online-note">'+(this.net.cupId?'House Cup result · prizes are tracked in the bracket':'Free 1v1 · no stake or token payout')+'</p>'}${resultActions}${this.message()}</section>`:''}`;
 }

 render(force=false){if(this.root.hidden)return;
  const key=JSON.stringify({view:this.view,pvpMode:this.pvpMode,chog:this.chog,error:this.error,config:!!this.config,queue:this.view==='queue'?this.queue:null,duel:this.view==='duel'||(this.view==='match'&&this.net?.duelId)?this.duel:null,duelPayment:this.view==='duel'?this.duelPayment:null,cup:this.view==='cup'?this.cup:null,payment:this.view==='cup'?this.payment:null,faucet:this.faucet?.snapshot(),walletBusy:this.walletBusy,slots:this.net?.slots?.map(s=>({chog:s.chog,nickname:s.nickname,connected:s.connected,ready:s.ready,rematch:s.rematch,grace:Math.ceil(s.graceRemaining),samples:this.view==='lobby'?Math.min(10,s.rttSamples):0})),match:this.net?.sim?.rules.phase,matchId:this.net?.matchId,persisted:this.net?.persisted,preparing:this.preparing,wallet:this.wallet});
  const status=this.root.querySelector('#online-network-status');if(status&&this.net)status.textContent=`${this.connected?this.net.duelId?'1 '+this.duelUnit()+' PvP':this.net.cupId?'CUP PvP':'FREE PvP':'RECONNECTING'} · ${Math.round(this.net.slots[this.seat].rtt||0)} ms`;
  if(!force&&key===this.lastRender)return;this.lastRender=key;
  this.root.classList.toggle('in-match',this.view==='match');
  this.root.innerHTML=this.view==='entry'?this.entry():this.view==='queue'?this.queueView():this.view==='paid-create'?this.paidCreate():this.view==='duel'?this.duelView():this.view==='lobby'?this.lobby():this.view==='cup-create'?this.cupCreate():this.view==='cup'?this.cupView():this.matchView();
 }
 notify(message){this.error=message||'Could not complete that action';this.render(true);}
 async copy(value){try{await navigator.clipboard.writeText(value);this.error='Invite link copied. Share it with your friend.';}catch{this.error='Copy the invitation from the link field.';}this.render(true);}
 async action(action,data={}){
  if(!action)return;this.error='';
  if(action==='exit'){await this.exit();return;}
  if(action==='pvp-mode'){this.pvpMode=data.mode==='casual'?'casual':'paid';this.view='entry';this.navigate('play.html?online='+this.pvpMode);this.render(true);if(this.pvpMode==='paid'&&this.wallet&&this.faucetAvailable())this.faucetController().sync();return;}
  if(action==='pick'){this.chog=data.chog;this.room?.send('select',{chog:this.chog});this.render(true);}
  if(['friend','cup-create','paid-create'].includes(action)){if(action==='friend')this.pvpMode='casual';if(action==='paid-create')this.pvpMode='paid';this.cupId=this.cup=this.cupInvite=null;this.duelId=this.duel=this.duelInvite=null;this.payment=this.duelPayment=null;this.fundingInput='';this.view={friend:'entry','cup-create':'cup-create','paid-create':'paid-create'}[action];this.navigate('play.html?online='+({friend:'casual','cup-create':'cup','paid-create':'paid'}[action]));this.render(true);if(action==='paid-create'&&this.wallet&&this.faucetAvailable())this.faucetController().sync();}
  if(action==='create-paid'||action==='paid-queue'){
   if(!this.onlineReady||this.creating)return;this.creating=true;
   try{await this.connectWallet();
    if(action==='create-paid'){const d=await this.request('/duels',{chog:this.chog,nickname:this.nickname});this.duelId=d.id;this.duel=d;this.duelInvite=null;this.view='duel';this.navigate(`play.html?duel=${d.id}`);}
    else{this.queue=await this.request('/queue',{kind:'paid',chog:this.chog,nickname:this.nickname});this.queueActive=true;this.view='queue';this.navigate('play.html?queue=paid');await this.refreshQueue();}
   }finally{this.creating=false;this.render(true);}return;
  }
  if(action==='join-paid'){if(this.creating)return;this.creating=true;try{await this.connectWallet();this.duel=await this.request(`/duels/${this.duelId}/join`,{invite:this.duelInvite,chog:this.chog,nickname:this.nickname});this.duelInvite=null;this.navigate(`play.html?duel=${this.duelId}`);}finally{this.creating=false;this.render(true);}return;}
  if(action==='copy-paid'){const link=new URL(`play.html?duel=${this.duelId}&invite=${this.duel.invite}`,location.href);await this.copy(link.href);}
  if(action==='fund-duel'){await this.connectWallet();await this.paidFundingController().run();await this.refreshDuel();}
  if(action==='check-duel-funding'){await this.paidFundingController().sync();await this.refreshDuel();}
  if(action==='recover-duel-funding'){await this.paidFundingController().recover(this.fundingInput?.trim());await this.refreshDuel();}
  if(action==='cancel-duel'){this.duel=await this.request(`/duels/${this.duelId}/cancel`,{});this.render(true);}
  if(action==='retry-duel'){await this.request(`/duels/${this.duelId}/retry-payout`,{});await this.refreshDuel();}
  if(action==='claim-duel')await this.claimDuel();
  if(action==='open-paid-match')await this.join(this.duel.roomId,null);
  if(action==='duel-back'){this.input(null,false);game().setOnlineInput(null);game().setMenuOpen(true);document.querySelector('#front-menu').hidden=true;this.view='duel';this.duelId=this.net?.duelId||this.duelId;await this.refreshDuel();this.render(true);}
  if(action==='quick-match'){
   if(!this.onlineReady||this.creating)return;this.creating=true;
   try{this.queue=await this.request('/queue',{kind:'casual',chog:this.chog,nickname:this.nickname});this.queueActive=true;this.view='queue';this.navigate('play.html?queue=casual');await this.refreshQueue();}
   finally{this.creating=false;this.render(true);}return;
  }
  if(action==='cancel-queue'){const kind=this.queue?.kind;this.queue=await this.request('/queue/cancel',{});if(this.queue.state==='Matched'){await this.refreshQueue();}else{this.queueActive=false;this.pvpMode=kind==='paid'?'paid':'casual';this.view='entry';this.navigate('play.html?online='+this.pvpMode);this.render(true);}return;}
  if(action==='create-room'||action==='create-cup'){
   if(!this.onlineReady||this.creating)return;
   this.creating=true;this.render(true);
   try{
    if(action==='create-room'){const room=await this.request('/rooms',{chog:this.chog,stage:this.stage});await this.join(room.roomId,room.invite);}
    else{const c=await this.request('/cups',{name:this.cupName,mode:this.cupMode});this.cupId=c.id;this.cup=c;this.cupInvite=null;this.view='cup';this.navigate(`play.html?cup=${c.id}`);this.render(true);}
   }finally{this.creating=false;this.render(true);}
   return;
  }
  if(action==='copy-room')await this.copy(this.inviteLink);
  if(action==='ready')await this.ready();
  if(action==='unlock')this.room.send('unready');
  if(action==='surrender')this.room.send('surrender');
  if(action==='rematch'){this.room.send('rematch');this.render(true);}
  if(action==='copy-cup-invite'){const participant=this.cup.participants[Number(data.slot)],url=new URL('play.html',location.href);url.searchParams.set('cup',this.cupId);url.searchParams.set('invite',participant.invite);await this.copy(url.href);}
  if(action==='check-in'){await this.request(`/cups/${this.cupId}/check-in`,{invite:this.cupInvite,nickname:this.nickname,chog:this.chog});this.cupInvite=null;this.navigate(`play.html?cup=${this.cupId}`);await this.refreshCup();}
  if(action==='replace'){await this.request(`/cups/${this.cupId}/replace`,{slot:Number(data.slot)});await this.refreshCup();}
  if(action==='start-cup'){await this.request(`/cups/${this.cupId}/start`,{});await this.refreshCup();}
  if(action==='join-match')await this.join(data.room,null);
  if(action==='cup-back'){this.input(null,false);game().setOnlineInput(null);game().setMenuOpen(true);document.querySelector('#front-menu').hidden=true;this.view='cup';if(this.net?.cupId)this.cupId=this.net.cupId;await this.refreshCup();this.render(true);}
  if(action==='claim-faucet'||action==='recover-faucet'){await this.faucetAction(action==='recover-faucet');return;}
  if(action==='wallet')await this.connectWallet();
  if(action==='fund'){if(!this.wallet)await this.connectWallet();await this.fundingController().run();await this.refreshCup();}
  if(action==='cancel-practice'){await this.request(`/cups/${this.cupId}/cancel-practice`,{});await this.refreshCup();}
  if(action==='cancel-funding')await this.walletAction('cancel-funding','confirm-cancellation');
  if(action==='confirm-funding'){await this.fundingController().sync();await this.refreshCup();}
  if(action==='recover-funding'){await this.fundingController().recover(this.fundingInput?.trim());await this.refreshCup();}
  if(action==='retry-payout'){await this.request(`/cups/${this.cupId}/retry-payout`,{});await this.refreshCup();}
  if(action==='claim')await this.walletAction('claim','confirm-claim');
  if(action==='refund'){await this.request(`/cups/${this.cupId}/refund-expired`,{});await this.refreshCup();}
 }
 async switchWalletNetwork(network=this.config.settlement.chainId){await ensureWalletNetwork(window.ethereum,network);}
 async connectWallet(){
  if(this.walletConnection)return this.walletConnection;
  const previousBusy=this.walletBusy;this.walletBusy=true;this.render(true);
  const work=async()=>{
   const connected=await connectVerifiedWallet({provider:window.ethereum,chainId:this.config.settlement.chainId,request:(...args)=>this.request(...args),onSession:session=>{this.token=session.token;this.wallet=Number(session.walletExpires)>Date.now()?session.wallet:null;}});
   this.wallet=connected.wallet;this.render(true);if(this.faucetAvailable())this.faucetController().sync();if(this.cupId)await this.refreshCup();if(this.duelId)await this.refreshDuel();
  };
  this.walletConnection=work();try{await this.walletConnection;}finally{this.walletConnection=null;this.walletBusy=previousBusy;this.render(true);}
 }
 async faucetAction(recover=false){
  if(this.walletBusy||!this.faucetAvailable())return;this.walletBusy=true;this.render(true);let flow;
  try{if(!this.wallet)await this.connectWallet();else await this.switchWalletNetwork(AUSD_FAUCET.chainId);flow=this.faucetController();if(recover)await flow.recover(this.faucetInput?.trim());else await flow.run();}
  catch(error){if(!flow?.snapshot().error)throw error;}
  finally{this.walletBusy=false;this.render(true);}
 }
 async claimDuel(){if(this.walletBusy)return;if(!this.wallet)await this.connectWallet();this.walletBusy=true;this.render(true);const key=['chog-duel-claim-v1',this.duelId,this.config.paidDuel.chainId,this.wallet].join(':');try{let hash=localStorage.getItem(key);if(!/^0x[0-9a-f]{64}$/i.test(hash||'')){const transaction=await this.request(`/duels/${this.duelId}/claim`,{});hash=await sendWalletTransaction({provider:window.ethereum,transaction,wallet:this.wallet,chainId:this.config.paidDuel.chainId,onSubmitted:h=>localStorage.setItem(key,h)});}await walletReceipt(window.ethereum,hash);await this.request(`/duels/${this.duelId}/confirm-claim`,{hash});localStorage.removeItem(key);await this.refreshDuel();}finally{this.walletBusy=false;this.render(true);}}
 fundingController(){
  const context={cupId:this.cupId,chainId:this.config?.settlement.chainId,contract:this.config?.settlement.contract,wallet:this.wallet};
  if(!context.contract||!context.wallet)throw Error('Connect the sponsor wallet and enable the Cup funding service first');
  const key=[context.cupId,context.chainId,context.contract,context.wallet].join(':');
  if(this.funding?.contextKey!==key){
   const flow=new CupFunding({context,storage:window.localStorage,provider:()=>window.ethereum,request:(...args)=>this.request(...args),onChange:state=>{if(this.cupId===context.cupId&&this.funding===flow){this.payment=state;if(state.report)this.cup=state.report;this.render();}}});
   flow.contextKey=key;this.funding=flow;this.payment=flow.snapshot();
  }
  return this.funding;
 }
 async walletAction(action,confirmation){
  if(this.walletBusy)return;if(!this.wallet)await this.connectWallet();
  const cupId=this.cupId,wallet=this.wallet,chainId=this.config.settlement.chainId,key=['chog-wallet-tx-v1',cupId,chainId,wallet,action].join(':');
  this.walletBusy=true;this.render(true);
  try{
   let hash=localStorage.getItem(key);
   if(!/^0x[0-9a-f]{64}$/i.test(hash||'')){
    const transaction=await this.request(`/cups/${cupId}/${action}`,{});
    hash=await sendWalletTransaction({provider:window.ethereum,transaction,wallet,chainId,onSubmitted:hash=>localStorage.setItem(key,hash)});
   }
   try{await walletReceipt(window.ethereum,hash);}catch(error){if(error.reverted)localStorage.removeItem(key);throw error;}
   await this.request(`/cups/${cupId}/${confirmation}`,{hash});localStorage.removeItem(key);await this.refreshCup();
  }finally{this.walletBusy=false;this.render(true);}
 }
 async refreshCup(){
  if(!this.cupId)return;const id=this.cupId,report=await this.request(`/cups/${id}`);if(this.cupId!==id)return;this.cup=report;
  if(this.funding?.context.cupId!==id)this.payment=null;
  if(report.host&&report.mode!=='practice'&&report.state==='Draft'&&this.wallet&&this.config?.settlement.enabled){try{await this.fundingController().sync();}catch{}}
  if(this.view==='cup')this.render();
 }
 async join(roomId,invite){
  if(this.room&&this.room.roomId!==roomId)await this.room.leave();
  if(this.room?.roomId===roomId){if(this.net?.sim)await this.beginMatch(this.net);else this.view='lobby';this.render(true);return;}
  const client=new Colyseus.Client(location.origin);let saved;try{saved=JSON.parse(sessionStorage.getItem('chog-reconnect'));}catch{}
  if(saved?.roomId===roomId&&Date.now()-saved.at<20000){try{this.room=await client.reconnect(saved.token);}catch{sessionStorage.removeItem('chog-reconnect');}}
  if(!this.room||this.room.roomId!==roomId)this.room=await client.joinById(roomId,{authToken:this.token,invite,nickname:this.nickname,chog:this.chog});
  this.room.reconnection.minUptime=0;this.room.reconnection.maxRetries=10;
  this.net=null;this.model=null;this.currentMatch=null;this.confirmedEvents.clear();this.connected=true;
  this.room.onMessage('seat',message=>{this.seat=message.seat;if(message.cupId)this.cupId=message.cupId;if(message.duelId)this.duelId=message.duelId;});
  this.room.onMessage('snapshot',message=>this.receive(message));
  this.room.onMessage('error',message=>this.notify(message.message));
  this.room.onMessage('server-ping',nonce=>this.room.send('server-pong',nonce));
  this.room.onMessage('pong',()=>{});
  this.room.onDrop(()=>{this.connected=false;this.input(null,false);this.render(true);});
  this.room.onReconnect(()=>{this.connected=true;this.pending=[];this.input(null,false);this.room.send('hello');this.render(true);});
  this.room.onLeave(()=>{sessionStorage.removeItem('chog-reconnect');this.connected=false;this.input(null,false);this.notify('Room connection ended. Return to the arcade or Cup bracket.');});
  this.room.send('hello');
  const url=new URL('play.html',location.href);url.searchParams.set('room',roomId);if(invite)url.searchParams.set('invite',invite);if(this.cupId)url.searchParams.set('cup',this.cupId);if(this.duelId)url.searchParams.set('duel',this.duelId);
  this.inviteLink=url.href;this.navigate(url.href);this.view='lobby';this.render(true);
 }
 async ready(){if(!this.net||this.preparing)return;this.preparing=true;this.render(true);
  const pair=this.net.slots.map(s=>s.chog),stage=this.net.stage;
  try{await game().prepareMatch({player:pair[this.seat],enemy:pair[1-this.seat],stage});if(pair.join()!==this.net.slots.map(s=>s.chog).join()||stage!==this.net.stage)throw Error('The lineup changed. Confirm Ready again.');this.prepared=pair.join()+':'+stage;game().menuSound('confirm');this.room.send('ready',{ruleset:RULESET,buildHash:BUILD_HASH,assetsReady:true});}
  finally{this.preparing=false;this.render(true);}
 }
 receive(message){if(message.buildHash!==BUILD_HASH){this.notify('Your game version changed. Reload before playing.');return;}this.net=message;
  if(this.room?.reconnectionToken&&Date.now()-(this.lastPersist||0)>1000){this.lastPersist=Date.now();try{sessionStorage.setItem('chog-reconnect',JSON.stringify({roomId:this.room.roomId,token:this.room.reconnectionToken,at:Date.now()}));}catch{}}
  if(message.sim){
   const alreadyRendering=this.currentMatch===message.matchId;
   if(!alreadyRendering){this.currentMatch=message.matchId;this.seq=0;this.pending=[];this.bits=this.pulses=0;this.model=createCombat({characters:message.slots.map(s=>s.chog),matchId:message.matchId});this.confirmedEvents.clear();this.beginMatch(message).catch(error=>this.notify(error.message));}
   const before=this.model.actors[this.seat].x;this.model.restore(message.sim);
   const ack=message.slots[this.seat].lastProcessed;this.seq=Math.max(this.seq,ack);this.pending=this.pending.filter(f=>f.seq>ack);
   if(message.slots.every(s=>s.connected)&&!['complete','void'].includes(message.sim.rules.phase))for(const frame of this.pending.slice(-12)){const inputs=message.sim.actors.map(a=>({bits:a.bits,seq:a.lastInputSeq}));inputs[this.seat]=frame;this.model.step(inputs);}
   if(alreadyRendering)this.corrections.push(Math.abs(before-this.model.actors[this.seat].x));if(this.corrections.length>600)this.corrections.shift();
   if(this.view==='match')game().renderOnline(this.model.snapshot(),this.seat);
   for(const event of message.sim.events)if(!this.confirmedEvents.has(event.id)){this.confirmedEvents.add(event.id);if(this.view==='match')game().onlineEvent(event,this.seat);}
  }
  this.render();
 }
 async beginMatch(message){const pair=message.slots.map(s=>s.chog);if(this.prepared!==pair.join()+':'+message.stage)await game().prepareMatch({player:pair[this.seat],enemy:pair[1-this.seat],stage:message.stage});
  if(this.root.hidden||this.currentMatch!==message.matchId)return;
  game().setOnlineInput(null);game().startMatch({player:pair[this.seat],enemy:pair[1-this.seat],stage:message.stage,mode:'versus'});game().stopAnnouncer();game().setAI(false);game().setOnlineInput((key,down)=>this.input(key,down));
  this.view='match';this.error='';this.root.hidden=false;this.lastStep=performance.now();this.debt=0;document.querySelector('#arena').focus();this.render(true);
 }
 input(key,down){if(key===null){this.bits=this.pulses=0;return true;}const bit=BUTTONS[key];if(!bit)return false;
  if(down==='tap'){this.pulses|=bit;return true;}
  if(down){if(!(this.bits&bit))this.pulses|=bit;this.bits|=bit;}else this.bits&=~bit;return true;
 }
 step(){if(this.root.hidden||!this.net?.sim||!this.model||!this.room||!this.connected)return;
  const state=this.net.sim.rules;if(['complete','void'].includes(state.phase)){if(this.view==='match')game().renderOnline(this.net.sim,this.seat);return;}
  if(this.net.slots.some(s=>!s.connected))return;
  const input={bits:document.hidden?0:this.bits|this.pulses,seq:++this.seq,tick:this.model.tick,matchId:this.net.matchId};this.pulses=0;
  this.pending.push(input);if(this.pending.length>30)this.pending.shift();this.room.send('input',input);
  const frames=this.model.actors.map(a=>({bits:a.bits,seq:a.lastInputSeq}));frames[this.seat]=input;this.model.step(frames);
  if(this.view==='match'&&!document.hidden){game().renderOnline(this.model.snapshot(),this.seat);}
 }
 async exit(){this.root.hidden=true;this.input(null,false);sessionStorage.removeItem('chog-reconnect');const room=this.room;this.room=null;if(room)await room.leave();this.net=this.model=null;this.cupId=this.cup=this.cupInvite=this.currentMatch=null;this.payment=null;this.prepared='';this.pending=[];this.view='entry';
  if(this.queueActive){this.queueActive=false;await this.request('/queue/cancel',{}).catch(()=>{});}this.queue=null;
  this.duelId=this.duel=this.duelInvite=null;this.duelPayment=null;
  game().setOnlineInput(null);game().setMenuOpen(true);window.FrontEnd.home();this.navigate('play.html');
 }
}
