/* Load online code only when a player chooses an online mode. */
(() => {
 let opening=null;
 window.openChogOnline=async(view='friend')=>{
  if(!opening){opening=import('./online/client.mjs').catch(e=>{opening=null;throw e;});}
  const module=await opening;await module.openOnline(view);
 };
 const params=new URLSearchParams(location.search);
 if(params.has('room')||params.has('cup')||params.has('duel')||params.has('queue')||params.has('online')){
  const enter=()=>{if(window.__game?.snapshot().ready)window.openChogOnline(params.has('cup')?'cup':params.get('online')||'friend').catch(()=>{});else setTimeout(enter,30);};enter();
 }
})();
