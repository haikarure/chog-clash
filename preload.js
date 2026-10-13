/* Load the menu first. Combat downloads only the selected pair and arena.
   Content hashes keep the service-worker cache current across deployments. */
(() => {
  'use strict';
  const list=self.CHOG_PRECACHE,boot=document.getElementById('boot');
  const entries=new Map((list?.files||[]).map(([url,bytes,hash])=>[url,{bytes,hash}]));
  const pending=new Map(),loaded=new Set();let cache=null,index={};
  const secure=isSecureContext&&'caches' in window;
  const initialized=(async()=>{
    if(!secure)return;
    cache=await caches.open('chog-clash-assets-v2').catch(()=>null);
    try{const saved=await cache?.match('__chog-index');if(saved)index=await saved.json();}catch(_){}
    if(cache){const keep=new Set([...entries.keys(),'__chog-index'].map(url=>new URL(url,location.href).href));for(const req of await cache.keys())if(!keep.has(req.url))await cache.delete(req);for(const url of Object.keys(index))if(!entries.has(url))delete index[url];}
    navigator.serviceWorker?.register('sw.js').catch(()=>{});
  })();
  async function one(url){
    await initialized;if(loaded.has(url))return;
    if(pending.has(url))return pending.get(url);
    const work=(async()=>{
      const hash=entries.get(url)?.hash;
      if(cache&&hash&&index[url]===hash&&await cache.match(url)){loaded.add(url);return;}
      const response=await fetch(url,{cache:'no-cache'});
      if(!response.ok)throw Error('Asset '+response.status+': '+url);
      if(cache){await cache.put(url,response.clone());index[url]=hash||'';}
      else await response.arrayBuffer();
      loaded.add(url);
    })();pending.set(url,work);
    try{await work;}finally{pending.delete(url);}
  }
  async function ensure(urls,onProgress=()=>{}){
    const todo=[...new Set(urls)];let next=0,done=0;
    async function worker(){while(next<todo.length){const url=todo[next++];await one(url);onProgress(++done,todo.length);}}
    await Promise.all(Array.from({length:Math.min(4,todo.length)},worker));if(cache)await cache.put('__chog-index',new Response(JSON.stringify(index),{headers:{'Content-Type':'application/json'}}));
  }
  window.CHOG_ASSETS={ensure,stats:()=>({loaded:[...loaded],pending:[...pending.keys()]})};
  const critical=[...entries.keys()].filter(url=>/\/landing\/fonts\/.*\.ttf$/.test(url)||/\/fighters\/[^/]+\/ui\/portrait\.webp$/.test(url));
  const bar=boot?.querySelector('.boot-bar i'),status=boot?.querySelector('.boot-status');
  window.CHOG_PRELOAD=ensure(critical,(done,total)=>{
    if(bar)bar.style.transform=`scaleX(${done/total})`;
    if(status)status.textContent=`Getting the crew ready · ${Math.round(done/total*100)}%`;
  }).catch(()=>{/* Images can still load through ordinary browser requests. */}).then(()=>{
    if(boot){boot.classList.add('done');setTimeout(()=>boot.remove(),200);}
  });
})();
