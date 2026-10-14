import {getWalletSession} from './wallet-session.mjs';

const account=getWalletSession();
let state=account.snapshot();
const short=wallet=>wallet.slice(0,6)+'…'+wallet.slice(-4);
function render(){
 for(const container of document.querySelectorAll('[data-wallet-controls]')){
  const key=JSON.stringify(state);if(container.dataset.walletRender===key)continue;
  container.dataset.walletRender=key;
  const button=document.createElement('button');button.type='button';button.className='wallet-connect';button.dataset.walletAction=state.wallet?'disconnect':'connect';
  button.disabled=state.busy||state.blocked;button.setAttribute('aria-busy',String(state.busy));
  button.setAttribute('aria-label',state.wallet?'Disconnect wallet '+state.wallet:'Connect wallet');
  if(state.wallet&&!state.busy){
   button.classList.add('is-connected');button.title=state.wallet;
   const address=document.createElement('strong');address.textContent=short(state.wallet);
   const label=document.createElement('small');label.textContent='DISCONNECT';button.append(address,label);
  }else button.textContent=state.busy?(state.phase==='disconnecting'?'DISCONNECTING…':'CHECK YOUR WALLET…'):'CONNECT WALLET';
  container.replaceChildren(button);
 }
 const status=document.querySelector('#wallet-login-status');
 if(status){if(status.textContent!==state.error)status.textContent=state.error;status.hidden=!state.error;}
}
const status=document.createElement('p');status.id='wallet-login-status';status.className='wallet-login-status';status.setAttribute('role','status');status.hidden=true;document.body.append(status);
account.subscribe(value=>{state=value;render();});
new MutationObserver(render).observe(document.body,{childList:true,subtree:true});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-wallet-controls] [data-wallet-action]');if(!button||button.disabled)return;
 event.preventDefault();event.stopPropagation();
 (button.dataset.walletAction==='disconnect'?account.disconnect():account.connect()).catch(()=>{});
});
account.initialize().catch(()=>{});
// Expired auth is displayed as Connect without opening the extension.
setInterval(()=>{account.expire();state=account.snapshot();render();},15000);
