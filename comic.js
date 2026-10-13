/* CHOG motion comic. Native scrolling, layered cover and intentional interaction. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const root = document.documentElement, body = document.body;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const toggle = $('#motion-toggle'), cover = $('#cover'), canvas = $('#ink-particles');
  const ctx = canvas.getContext('2d');
  let saved = null;
  try { const value = localStorage.getItem('chog-comic-motion'); if (value !== null) saved = value === 'on'; } catch (_) {}
  let enabled = !reduce.matches && (saved ?? true);
  let coverVisible = true, particlesRAF = 0, scrollRAF = 0, pointerRAF = 0, lastTime = 0;
  let width = 0, height = 0, pointerX = 0, pointerY = 0, coverBounds = null;
  const intro = [], visiblePanels = new Set();
  const particles = Array.from({length:24}, (_,i) => ({x:Math.random(),y:Math.random(),speed:.008+Math.random()*.014,size:2+Math.random()*4,angle:Math.random()*Math.PI,kind:i%3,color:['#ffe13b','#ff674f','#f8f0dd'][i%3]}));

  function paintParticles(time) {
    particlesRAF = 0;
    if (!enabled || !coverVisible || document.hidden) return;
    if (time-lastTime < 32) { particlesRAF = requestAnimationFrame(paintParticles); return; }
    const dt = Math.min((time-lastTime)/1000,.05); lastTime = time;
    ctx.clearRect(0,0,width,height);
    for (const p of particles) {
      p.y = (p.y-dt*p.speed+1)%1; p.angle += dt*.2;
      const x = width*(.48+p.x*.5), y = height*p.y;
      ctx.save(); ctx.translate(x,y); ctx.rotate(p.angle);ctx.globalAlpha=.65;ctx.fillStyle=p.color;ctx.strokeStyle=p.color;ctx.lineWidth=1.5;
      if (p.kind===0) ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
      else if(p.kind===1){ctx.beginPath();ctx.moveTo(-p.size,0);ctx.lineTo(p.size,0);ctx.moveTo(0,-p.size);ctx.lineTo(0,p.size);ctx.stroke();}
      else{ctx.beginPath();ctx.moveTo(0,-p.size);ctx.lineTo(p.size,p.size);ctx.lineTo(-p.size,p.size);ctx.closePath();ctx.fill();}
      ctx.restore();
    }
    particlesRAF = requestAnimationFrame(paintParticles);
  }
  function syncParticles() {
    if (particlesRAF) cancelAnimationFrame(particlesRAF);
    particlesRAF=0;lastTime=performance.now();
    if (enabled && coverVisible && !document.hidden) particlesRAF=requestAnimationFrame(paintParticles);
    else ctx.clearRect(0,0,width,height);
  }
  function resizeCover() {
    coverBounds=cover.getBoundingClientRect();width=Math.round(coverBounds.width);height=Math.round(coverBounds.height);
    const dpr=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    syncParticles();scheduleScroll();
  }
  function syncMotion() {
    body.classList.toggle('motion-paused',!enabled);body.dataset.motion=enabled?'on':'paused';
    toggle.disabled=reduce.matches;toggle.title=reduce.matches?'Reduced motion is enabled in your system settings.':'Toggle page animation';
    toggle.setAttribute('aria-pressed',String(enabled));toggle.setAttribute('aria-label',enabled?'Pause page animation':'Resume page animation');
    toggle.querySelector('span').textContent=enabled?'MOTION ON':'MOTION PAUSED';
    if(!enabled){for(const animation of intro)if(animation.playState!=='finished')animation.finish();pointerX=pointerY=0;root.style.setProperty('--mx','0');root.style.setProperty('--my','0');root.style.setProperty('--cover-shift','0px');for(const p of visiblePanels)p.style.setProperty('--parallax-y','0px');}
    syncParticles();scheduleScroll();
  }
  toggle.addEventListener('click',()=>{enabled=!enabled;saved=enabled;try{localStorage.setItem('chog-comic-motion',enabled?'on':'off');}catch(_){}syncMotion();});
  reduce.addEventListener('change',()=>{enabled=!reduce.matches&&(saved??true);syncMotion();});
  document.addEventListener('visibilitychange',()=>{body.classList.toggle('page-hidden',document.hidden);syncParticles();if(!document.hidden)scheduleScroll();});
  const coverObserver=new IntersectionObserver(entries=>{coverVisible=entries[0].isIntersecting;syncParticles();},{threshold:0});coverObserver.observe(cover);
  const revealObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){e.target.classList.add('is-visible');revealObserver.unobserve(e.target);}},{threshold:.06,rootMargin:'0px 0px -25px 0px'});
  document.querySelectorAll('.reveal').forEach(e=>revealObserver.observe(e));
  const panelObserver=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)visiblePanels.add(e.target);else visiblePanels.delete(e.target);}scheduleScroll();},{rootMargin:'100px'});
  document.querySelectorAll('[data-parallax]').forEach(e=>panelObserver.observe(e));
  const navObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){document.querySelectorAll('.comic-nav nav a').forEach(a=>{if(a.hash==='#'+e.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-10% 0px -65% 0px'});
  document.querySelectorAll('#story,#crew,#world').forEach(e=>navObserver.observe(e));
  function updateScroll() {
    scrollRAF=0;const extent=Math.max(1,document.documentElement.scrollHeight-innerHeight);
    root.style.setProperty('--read-progress',String(Math.max(0,Math.min(1,scrollY/extent))));
    if(!enabled||document.hidden)return;
    if(coverVisible)root.style.setProperty('--cover-shift',Math.max(-60,-scrollY*.1)+'px');
    for(const panel of visiblePanels){const r=panel.getBoundingClientRect(),amount=Number(panel.dataset.parallax);const position=(r.top+r.height/2-innerHeight/2)/innerHeight;panel.style.setProperty('--parallax-y',Math.max(-amount,Math.min(amount,-position*amount))+'px');}
  }
  function scheduleScroll(){if(!scrollRAF)scrollRAF=requestAnimationFrame(updateScroll);}
  addEventListener('scroll',scheduleScroll,{passive:true});
  new ResizeObserver(resizeCover).observe(cover);
  addEventListener('resize',()=>{coverBounds=null;scheduleScroll();},{passive:true});
  cover.addEventListener('pointerenter',()=>{coverBounds=cover.getBoundingClientRect();});
  cover.addEventListener('pointermove',e=>{
    if(!enabled||!fine.matches||e.pointerType==='touch')return;
    const b=coverBounds||cover.getBoundingClientRect();pointerX=(e.clientX-b.left)/b.width*2-1;pointerY=(e.clientY-b.top)/b.height*2-1;
    if(!pointerRAF)pointerRAF=requestAnimationFrame(()=>{pointerRAF=0;root.style.setProperty('--mx',pointerX.toFixed(3));root.style.setProperty('--my',pointerY.toFixed(3));});
  });
  cover.addEventListener('pointerleave',()=>{pointerX=pointerY=0;root.style.setProperty('--mx','0');root.style.setProperty('--my','0');});

  const roles={yot:'Collab manager',mamio:'Community',benja:'Co-founder',toad:'Co-founder',ping:'Chog Police',novee:'Developer',tonashiro:'Developer',bigchog:'Community',rogue:'Artist',tabsu:'Chog Police',venty:'Community',cookie:'Community'};
  const notes={yot:'Connect the crew. Call in backup.',mamio:'Keep moving. Make it a game.',benja:'Lead the rally. Build momentum.',toad:'Hold your ground. Hit back.',ping:'Patrol the chaos. Sound the alarm.',novee:'Deploy bugs. Debug the arena.',tonashiro:'Signal up. Drones incoming.',bigchog:'Big reply energy. Loud impact.',rogue:'Paint the floor. Make a mess.',tabsu:'Keep the peace. Bring the bonk.',venty:'Flowers, feints, full send.',cookie:'Grab the mic. Move the crowd.'};
  const sounds={yot:'LINK!',mamio:'WHOOSH!',benja:'RALLY!',toad:'THUMP!',ping:'PING!',novee:'BUG!',tonashiro:'BEEP!',bigchog:'BOOM!',rogue:'INK!',tabsu:'BONK!',venty:'SWISH!',cookie:'MIC!'};
  let persona='rogue',world='house-cup';
  function punch(element,frames,duration=350){if(enabled&&!reduce.matches)return element.animate(frames,{duration,easing:'cubic-bezier(.18,.8,.3,1)'});}
  function chooseCrew(id) {
    const c=CHOG.get(id);if(!c||id===persona)return;persona=id;
    document.querySelectorAll('[data-crew]').forEach(b=>{const active=b.dataset.crew===id;b.classList.toggle('is-selected',active);b.setAttribute('aria-pressed',String(active));});
    $('#crew-spotlight').style.setProperty('--persona',c.color);
    const img=$('#crew-art');img.src=c.reference;img.alt=c.displayName+', '+roles[id];
    $('#crew-name').textContent=c.name;$('#crew-role').textContent=roles[id].toUpperCase();$('#crew-note').textContent=notes[id];$('#crew-style').textContent=c.style;
    $('#crew-number').textContent=String(CHOG.characters.indexOf(c)+1).padStart(2,'0')+' / 12';$('.spotlight-sfx').textContent=sounds[id];
    $('#crew-moves').replaceChildren(...c.names.map((name,i)=>{const line=document.createElement('span'),key=document.createElement('kbd');key.textContent=['SPACE','I','O','P'][i];line.append(key,document.createTextNode(' '+name));return line;}));
    const link=$('#crew-play');link.href='play.html?fighter='+id;link.firstChild.textContent='PLAY AS '+c.name+' ';
    $('#crew-status').textContent=c.displayName+' selected. Ready for the House Cup.';
    punch(img,[{opacity:.3,transform:'translateX(-16px) rotate(-4deg)'},{opacity:1,transform:'translateX(0) rotate(0deg)'}]);
    punch($('#crew-name'),[{transform:'translateY(12px)',opacity:.4},{transform:'translateY(0)',opacity:1}],260);
  }
  for(const card of document.querySelectorAll('[data-crew]')){
    card.addEventListener('click',()=>chooseCrew(card.dataset.crew));let bounds=null;
    card.addEventListener('pointerenter',()=>{bounds=card.getBoundingClientRect();});
    card.addEventListener('pointermove',e=>{if(!enabled||!fine.matches||e.pointerType==='touch')return;const b=bounds||card.getBoundingClientRect();card.style.setProperty('--tilt-x',((.5-(e.clientY-b.top)/b.height)*7).toFixed(2)+'deg');card.style.setProperty('--tilt-y',(((e.clientX-b.left)/b.width-.5)*9).toFixed(2)+'deg');});
    card.addEventListener('pointerleave',()=>{card.style.setProperty('--tilt-x','0deg');card.style.setProperty('--tilt-y','0deg');});
  }
  $('.crew-grid').addEventListener('keydown',e=>{
    const b=e.target.closest('[data-crew]');if(!b)return;
    const dir={ArrowLeft:-1,ArrowRight:1,ArrowUp:-1,ArrowDown:1}[e.key];if(!dir)return;e.preventDefault();
    const cards=[...document.querySelectorAll('[data-crew]')],cols=getComputedStyle($('.crew-grid')).gridTemplateColumns.split(' ').length;
    const next=cards[(cards.indexOf(b)+dir*(e.key==='ArrowUp'||e.key==='ArrowDown'?cols:1)+cards.length)%cards.length];chooseCrew(next.dataset.crew);next.focus({preventScroll:true});
  });
  function chooseWorld(id){
    const s=MatchRules.stages[id];if(!s||id===world)return;world=id;
    document.querySelectorAll('[data-world]').forEach(b=>{const active=b.dataset.world===id;b.classList.toggle('is-selected',active);b.setAttribute('aria-pressed',String(active));});
    const img=$('#world-image');img.src=s.image;img.alt=s.name+', '+s.tag;
    $('#world-time').textContent=s.time;$('#world-name').textContent=s.name.toUpperCase();$('#world-description').textContent=s.tag;$('#world-index').textContent='LOCATION '+String(Object.keys(MatchRules.stages).indexOf(id)+1).padStart(2,'0')+' / 05';
    punch(img,[{opacity:.6,transform:'scale(1.06)'},{opacity:1,transform:'scale(1)'}],450);
  }
  for(const b of document.querySelectorAll('[data-world]'))b.addEventListener('click',()=>chooseWorld(b.dataset.world));
  $('.world-choices').addEventListener('keydown',e=>{const dir={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[e.key],b=e.target.closest('[data-world]');if(!dir||!b)return;e.preventDefault();const list=[...document.querySelectorAll('[data-world]')],next=list[(list.indexOf(b)+dir+list.length)%list.length];chooseWorld(next.dataset.world);next.focus({preventScroll:true});});
  const showdown=$('#showdown-panel');let impactTimer=0;
  $('#impact-button').addEventListener('click',()=>{if(!enabled||reduce.matches){$('#impact-button').querySelector('small').textContent='GOOD FRIENDS. GREAT RIVALS.';return;}clearTimeout(impactTimer);showdown.classList.remove('impacting');requestAnimationFrame(()=>{showdown.classList.add('impacting');impactTimer=setTimeout(()=>showdown.classList.remove('impacting'),500);});});
  document.addEventListener('click',e=>{
    const link=e.target.closest('a.game-link');if(!link||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||!enabled||reduce.matches)return;
    e.preventDefault();body.classList.add('leaving');setTimeout(()=>location.assign(link.href),320);
  });
  // Clear the transition curtain when the browser restores this page from history.
  addEventListener('pageshow',()=>{body.classList.remove('leaving');syncParticles();scheduleScroll();});
  resizeCover();syncMotion();
  Promise.all([document.fonts.ready,$('.cover-cast img').decode().catch(()=>{})]).then(()=>{
    body.dataset.ready='true';
    if(!enabled||reduce.matches||scrollY>100)return;
    const sequence=[['.issue-label',40],['.title-chog',110],['.title-clash',180],['.cover-tagline',260],['.cover-description',320],['.cover-actions',390],['.cover-platform',440]];
    for(const [selector,delay] of sequence)intro.push($(selector).animate([{opacity:0,translate:'-28px 10px'},{opacity:1,translate:'0 0'}],{duration:650,delay,easing:'cubic-bezier(.16,.8,.2,1)',fill:'backwards'}));
    intro.push($('.cover-cast').animate([{opacity:0,scale:'.85',translate:'50px 20px'},{opacity:1,scale:'1',translate:'0 0'}],{duration:900,delay:120,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'}));
  });
})();
