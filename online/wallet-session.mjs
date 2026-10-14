import {connectVerifiedWallet} from './payments.mjs';

// Bearer tokens stay in memory. The existing HttpOnly cookie carries the same
// game session between landing, hub, online pages, and reloads.
export function injectedWallet(){
 if(globalThis.window?.ethereum)return window.ethereum;
 try{if(window.parent!==window&&window.parent.location.origin===location.origin)return window.parent.ethereum||null;}catch{}
 return null;
}
export class WalletSession {
 #session=null;#listeners=new Set();#generation=0;#connection=null;#initializing=null;#provider=null;#refreshing=null;
 constructor({provider=injectedWallet,fetcher=(...args)=>fetch(...args),now=()=>Date.now(),publish=()=>{}}={}){
  this.provider=provider;this.fetcher=fetcher;this.now=now;this.publish=publish;this.chainId=10143;
  this.state={wallet:null,walletExpires:0,busy:false,blocked:false,phase:'idle',error:''};
  this.onAccounts=accounts=>{
   if(this.state.phase==='connecting')return;
   if(this.state.wallet&&accounts?.[0]?.toLowerCase()!==this.state.wallet.toLowerCase()){
    if(this.state.blocked)this.pendingAccountLogout=true;else this.disconnect().catch(()=>{});
   }
  };
 }
 snapshot(){const s={...this.state};if(s.walletExpires<=this.now())s.wallet=null;return s;}
 token(){return this.#session?.token;}
 subscribe(listener){this.#listeners.add(listener);listener(this.snapshot());return()=>this.#listeners.delete(listener);}
 emit(){for(const listener of this.#listeners)listener(this.snapshot());}
 setBlocked(blocked){if(this.state.blocked===!!blocked)return;this.state.blocked=!!blocked;this.emit();if(!blocked&&this.pendingAccountLogout){this.pendingAccountLogout=false;this.disconnect().catch(()=>{});}}
 expire(){if(this.state.wallet&&this.state.walletExpires<=this.now()){this.state.wallet=null;this.emit();}}
 async request(path,body){
  const response=await this.fetcher('/api'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(this.token()?{Authorization:'Bearer '+this.token()}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await response.json();}catch{throw Error('Wallet login is unavailable right now. Try again shortly.');}
  if(!response.ok)throw Error(data.error||'Could not complete the wallet request');return data;
 }
 accept(session){this.#session=session;this.state.wallet=Number(session.walletExpires)>this.now()?session.wallet:null;this.state.walletExpires=Number(session.walletExpires)||0;this.emit();}
 async refresh(){
  if(this.#refreshing)return this.#refreshing;
  const generation=this.#generation,canCommit=!this.state.busy;
  const work=async()=>{const session=await this.request('/session');if(canCommit&&!this.state.busy&&generation===this.#generation)this.accept(session);return session;};
  this.#refreshing=work();try{return await this.#refreshing;}finally{this.#refreshing=null;}
 }
 bindProvider(){
  const provider=this.provider();if(provider===this.#provider)return provider;
  this.#provider?.removeListener?.('accountsChanged',this.onAccounts);
  this.#provider?.removeListener?.('disconnect',this.onDisconnected);
  this.#provider=provider;this.onDisconnected=()=>this.onAccounts([]);
  provider?.on?.('accountsChanged',this.onAccounts);provider?.on?.('disconnect',this.onDisconnected);return provider;
 }
 async initialize(){
  if(this.#initializing)return this.#initializing;
  const work=async()=>{const [config]=await Promise.all([this.request('/config'),this.refresh()]);this.chainId=Number(config.settlement?.chainId||10143);this.bindProvider();return this.snapshot();};
  this.#initializing=work();try{return await this.#initializing;}catch(error){this.#initializing=null;throw error;}
 }
 async connect({allowBlocked=false}={}){
  if(this.#connection)return this.#connection;
  if(this.state.blocked&&!allowBlocked)throw Error('Finish the current wallet request first.');
  const generation=++this.#generation;this.state.busy=true;this.state.phase='connecting';this.state.error='';this.emit();
  const work=async()=>{
   await this.initialize();
   const current=()=>{if(generation!==this.#generation)throw Error('Wallet connection changed. Connect again when ready.');};
   const result=await connectVerifiedWallet({provider:this.bindProvider(),chainId:this.chainId,now:this.now,
    request:async(...args)=>{current();return this.request(...args);},onSession:session=>{current();this.accept(session);}});
   current();this.accept(result.session);this.publish('connected');return result;
  };
  this.#connection=work();try{return await this.#connection;}
  catch(error){if(generation===this.#generation){this.state.error=error.code===4001?'Connection cancelled. You can try again.':error.message;this.emit();}throw error;}
  finally{this.#connection=null;this.state.busy=false;this.state.phase='idle';this.emit();}
 }
 async disconnect(){
  if(this.state.blocked)throw Error('Finish the current wallet request first.');
  ++this.#generation;this.state.busy=true;this.state.phase='disconnecting';this.state.error='';this.emit();
  try{
   // No extension popup, token transfer, permission revocation, or session-ID
   // rotation. A new Connect explicitly proves wallet ownership again.
   const result=await this.request('/auth/logout',{});
   this.accept({...this.#session,...result});this.publish('disconnected');
  }catch(error){this.state.error='Could not disconnect. Try again when the connection is back.';this.emit();throw error;}
  finally{this.state.busy=false;this.state.phase='idle';this.emit();}
 }
 async externalChange(){++this.#generation;this.state.wallet=null;this.state.walletExpires=0;this.state.error='';this.emit();await this.refresh();}
}

let shared=null;
export function getWalletSession(){
 if(shared)return shared;
 let channel;try{channel=new BroadcastChannel('chog-wallet-session-v1');}catch{}
 shared=new WalletSession({publish:type=>{const event={type,at:Date.now()};channel?.postMessage(event);try{localStorage.setItem('chog-wallet-session-change-v1',JSON.stringify(event));}catch{}}});
 const sync=()=>shared.externalChange().catch(()=>{});
 if(channel)channel.onmessage=sync;
 globalThis.addEventListener?.('storage',event=>{if(event.key==='chog-wallet-session-change-v1')sync();});
 globalThis.addEventListener?.('focus',()=>shared.refresh().catch(()=>{}));
 return shared;
}
