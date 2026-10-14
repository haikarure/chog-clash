/* CHOG motion comic: arcade cover, versus roster, tour map and victory panel. */
(() => {
  'use strict';
  const root=document.querySelector('#front-menu'),game=window.__game;
  const crew=CHOG.characters,ids=crew.map(c=>c.id),get=id=>CHOG.byId[id];
  const roles={yot:'Collab manager',mamio:'Community',benja:'Co-founder',toad:'Co-founder',ping:'Chog Police',novee:'Developer',tonashiro:'Developer',bigchog:'Community',rogue:'Artist',tabsu:'Chog Police',venty:'Community',cookie:'Community'};
  const notes={yot:'Connect the crew. Call in backup.',mamio:'Keep moving. Make it a game.',benja:'Lead the rally. Build momentum.',toad:'Hold your ground. Hit back.',ping:'Patrol the chaos. Sound the alarm.',novee:'Deploy bugs. Debug the arena.',tonashiro:'Signal up. Drones incoming.',bigchog:'Big reply energy. Loud impact.',rogue:'Paint the floor. Make a mess.',tabsu:'Keep the peace. Bring the bonk.',venty:'Flowers, feints, full send.',cookie:'Grab the mic. Move the crowd.'};
  const pins={'rayj-house':[18,70],'cwo-alley':[43,43],'house-cup':[75,23],'neon-street':[78,76],'cwo-rally':[21,19]};
  const touch=document.documentElement.classList.contains('touch');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let screen='home',step=0,mode='versus',player='yot',enemy='mamio',hover='yot',stage='house-cup',level='medium',result=null;
  const entry=new URLSearchParams(location.search);
  if(get(entry.get('fighter'))){player=hover=entry.get('fighter');screen='select';}
  if(['versus','training'].includes(entry.get('mode'))){mode=entry.get('mode');screen='select';}
  let lock=null,interacted=false,lastSound=0,animated=true;
  try{animated=localStorage.getItem('chog-comic-motion')!=='off';}catch(_){}
  const setting=document.querySelector('#menu-video-toggle');
  if(setting){setting.onchange=e=>{animated=e.target.checked;try{localStorage.setItem('chog-comic-motion',animated?'on':'off');}catch(_){}syncBackground();};}
  function sfx(kind='move'){if(!interacted)return;const now=performance.now();if(kind==='move'&&now-lastSound<80)return;lastSound=now;game.menuSound(kind);}
  function syncBackground(){if(setting){setting.checked=animated&&!reduced.matches;setting.disabled=reduced.matches;}root.classList.toggle('is-animated',animated&&!reduced.matches&&!document.hidden&&!game.snapshot().settingsOpen);}
  reduced.addEventListener('change',syncBackground);
  document.addEventListener('visibilitychange',syncBackground);
  const cup='<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M29 16H71V42Q71 65 50 68Q29 65 29 42Z"/><path d="M29 23H14V36Q14 50 32 50M71 23H86V36Q86 50 68 50M50 68V83M31 86H69" fill="none"/><path d="m50 27 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z" class="cup-star"/></svg>';
  const brand=()=>`<button class="house-brand" data-cmd="home" aria-label="CHOG Clash home"><img src="assets/chog/ui/favicon.svg" alt=""><span>CHOG <b>CLASH</b><small>THE HOUSE CUP</small></span></button>`;
  function header(label='COMMUNITY ARCADE'){
    return `<header class="house-topbar">${brand()}<span class="house-location"><i></i>${label}</span><nav aria-label="Game navigation">${screen!=='home'?'<button class="quiet-button" data-cmd="back">← BACK</button>':''}<button class="quiet-button" data-cmd="settings" aria-label="Pengaturan">SETTINGS</button><button class="quiet-button" data-cmd="about">ABOUT</button>${touch?'<button class="quiet-button fullscreen-button" data-cmd="fullscreen" aria-label="Layar penuh">⛶</button>':''}</nav></header>`;
  }
  function footer(){return `<footer class="house-footer"><span>${touch?'TAP A CARD · CONFIRM YOUR PICK':'ARROWS / WASD TO EXPLORE · ENTER TO CONFIRM'}</span><span>12 PERSONAS <i>✦</i> 5 PLACES <i>✦</i> ONE CUP</span></footer>`;}
  function path(){return `<nav class="setup-path" aria-label="Match setup">${['YOUR PERSONA','YOUR RIVAL','THE PLACE'].map((t,i)=>`<span class="${step===i?'current':i<step?'done':''}" ${step===i?'aria-current="step"':''}><b>${i<step?'✓':String(i+1).padStart(2,'0')}</b>${t}</span>`).join('')}<div class="setup-picks"><img src="${get(player).portrait}" alt=""><span>${get(player).displayName}</span>${step>0?`<i>×</i><img src="${get(enemy).portrait}" alt=""><span>${step>1?get(enemy).displayName:'Picking rival…'}</span>`:''}</div></nav>`;}
  function personaCard(c,i){return `<button class="persona-card ${c.id===hover?'is-selected':''}" style="--persona:${c.color}" data-fighter="${c.id}" aria-label="${c.displayName}, ${roles[c.id]}" aria-pressed="${c.id===hover}"><span class="card-index">${String(i+1).padStart(2,'0')}</span><img src="${c.portrait}" alt=""><span class="card-name">${c.id==='ping'?'Ping ×4':c.displayName}</span>${step===1&&c.id===player?'<b class="picked-tag">P1</b>':''}</button>`;}
  function showcase(id,side){const c=get(id),active=step===(side==='player'?0:1);return `<article class="fighter-showcase ${side}-showcase ${active?'is-picking':'is-locked'}" data-persona="${id}" style="--persona:${c.color}"><div class="showcase-label"><b>${side==='player'?'P1':'CPU'}</b><span>${active?'CHOOSE YOUR '+(side==='player'?'CHOG':'RIVAL'):side==='player'?'PLAYER LOCKED IN':'YOUR NEXT RIVAL'}</span></div><div class="showcase-art"><span class="showcase-number" aria-hidden="true">${String(ids.indexOf(id)+1).padStart(2,'0')}</span><img src="${c.reference}" alt="${c.displayName}"></div><div class="showcase-name"><span>${roles[id]}</span><h2>${id==='ping'?'PingPing<wbr>PingPing':c.displayName}</h2><p>${notes[id]}</p></div></article>`;}
  function dossier(id){const c=get(id);return `<article class="persona-dossier" style="--persona:${c.color}"><div class="dossier-heading"><b>${c.displayName}</b><span>${c.title}</span></div><div class="dossier-moves">${c.names.map((name,i)=>`<div><kbd>${['SPACE','I','O','P'][i]}</kbd><span>${name}</span></div>`).join('')}</div><button class="solid-button confirm-fighter" data-cmd="confirm">${step===0?'LOCK IN PLAYER':'LOCK IN RIVAL'} <span>→</span></button></article>`;}
  function hub(){return `${header()}<main class="house-hub"><div class="hub-heading"><span class="eyebrow">A LITTLE COMMUNITY. A LOT OF CHAOS.</span><h1>THE HOUSE <em>CUP.</em></h1><span class="season-sticker">EVERYONE'S INVITED <i>✦</i></span></div><div class="hub-stage"><div class="hub-stage-art"></div><div class="hub-rays"></div><span class="hub-stage-caption">CHOG WORLD ORDER / COMMUNITY ARCADE</span><img class="hub-persona hub-heroes" src="assets/chog/landing/comic-heroes.webp" alt="Yot, Rogue and Cookie"><div class="hub-cup">${cup}<small>ISSUE #01</small></div><span class="stage-sticker sticker-left">GOOD FRIENDS.<br>GREAT RIVALS.</span><span class="stage-sticker sticker-right">NO QUIET<br>ROUNDS.</span></div><nav class="hub-modes online-enabled" aria-label="Play mode"><button class="mode-card online-mode" data-cmd="online"><span><small>ONE LINK. TWO CHOG.</small><strong>1v1 DUEL</strong><p>Invite or auto-match. Free or 1 AUSD testnet.</p></span><b>↗</b></button><button class="mode-card community-mode" data-cmd="cup"><span><small>FOUR FRIENDS. ONE CUP.</small><strong>HOST HOUSE CUP</strong><p>Check in the crew. Run your bracket.</p></span><b>↗</b></button><button class="mode-card cup-mode" data-cmd="versus"><span class="mode-icon">${cup}</span><span><small>THE MAIN EVENT</small><strong>VS COMPUTER</strong><p>Pick your crew. Play for the cup.</p></span><b>↗</b></button><button class="mode-card lab-mode" data-cmd="training"><span class="mode-icon lab-mark">{}</span><span><small>THE PRACTICE CORNER</small><strong>TRAINING</strong><p>Find your moves. Make your own combos.</p></span><b>↗</b></button></nav><div class="hub-crew"><span>THE WHOLE<br><b>CREW'S HERE.</b></span><div>${crew.map(c=>`<img src="${c.portrait}" alt="${c.displayName}" title="${c.displayName}">`).join('')}</div><button class="quiet-button" data-cmd="lesson">LEARN THE MOVES ↗</button><span class="ready-pill" id="menu-ready">${game.snapshot().ready?'READY TO PLAY':'GETTING READY…'}</span></div></main>${footer()}`;}
  function select(){return `${header(mode==='versus'?'THE MAIN EVENT':'PRACTICE CORNER')}${path()}<main class="persona-screen"><aside id="player-showcase">${showcase(step===0?hover:player,'player')}</aside><section class="persona-collection"><div class="select-heading"><span class="eyebrow">${step===0?'01 / YOUR CHOG':'02 / YOUR RIVAL'}</span><h1>SELECT <em>CHARACTERS</em></h1><span class="versus-mark" aria-hidden="true">VS</span></div><div class="persona-grid" role="group" aria-label="Roster karakter">${crew.map(personaCard).join('')}</div><div id="persona-preview">${dossier(hover)}</div><p class="collection-note" id="roster-notice" aria-live="polite">${step===0?'Pick your energy. All 12 CHOG are playable.':'Player locked. Choose a rival, then confirm.'}</p></section><aside id="rival-showcase">${showcase(step===1?hover:enemy,'rival')}</aside></main>${footer()}`;}
  function arena(){const s=MatchRules.stages[stage];return `${header('HOUSE CUP TOUR')}${path()}<main class="world-screen"><section class="world-board"><div class="page-intro"><div><span class="eyebrow">TAKE THE CHAOS SOMEWHERE NEW</span><h1>Pick your place.</h1></div><span class="map-note">A CHOG<br>COMMUNITY TOUR</span></div><div class="tour-map" role="group" aria-label="Pilih arena"><svg class="map-lines" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><path d="M180 490C150 370 480 420 430 301S420 175 210 133M430 301C530 180 580 200 750 161S960 510 780 532"/><path class="map-river" d="M-50 545C250 370 410 660 620 520S920 355 1050 500"/></svg><span class="map-doodle doodle-home">⌂</span><span class="map-doodle doodle-code">{ }</span><span class="map-doodle doodle-star">✦</span>${Object.entries(MatchRules.stages).map(([id,a],i)=>`<button class="map-pin ${id===stage?'is-selected':''}" style="--pin-x:${pins[id][0]}%;--pin-y:${pins[id][1]}%" data-stage="${id}" aria-pressed="${id===stage}"><span class="pin-image"><img src="${a.image}" alt=""><b>${String(i+1).padStart(2,'0')}</b></span><strong>${a.name}</strong></button>`).join('')}<span class="tour-label">HOUSE CUP TOUR <i>↗</i><small>Five places. Zero quiet corners.</small></span></div></section><aside class="match-ticket"><div class="ticket-picture"><img src="${s.image}" alt="${s.name}"><span>YOUR NEXT STOP</span></div><div class="ticket-place"><span class="eyebrow">${s.time}</span><h2>${s.name}</h2><p>${s.tag}</p></div><div class="ticket-pair"><div><img src="${get(player).portrait}" alt=""><span>YOU<b>${get(player).displayName}</b></span></div><i>×</i><div><img src="${get(enemy).portrait}" alt=""><span>RIVAL<b>${get(enemy).displayName}</b></span></div></div><div class="ticket-options">${mode==='versus'?`<span class="eyebrow">HOW MUCH CHAOS?</span><div class="difficulty-buttons" role="group" aria-label="Tingkat kesulitan">${Object.entries(MatchRules.difficulties).map(([id,d],i)=>`<button class="${id===level?'is-selected':''}" data-level="${id}" aria-pressed="${id===level}"><small>${'•'.repeat(i+1)}</small>${d.label}</button>`).join('')}</div>`:'<div class="practice-ticket"><b>YOUR OWN PACE</b><span>No timer. Passive rival. Reset anytime.</span></div>'}<div class="ticket-rules">${mode==='versus'?'<span>90s / ROUND</span><span>FIRST TO 2 WINS</span>':'<span>UNLIMITED TIME</span><span>FULL MOVE SET</span>'}</div></div><button class="solid-button start-battle" data-cmd="start" ${game.snapshot().ready?'':'disabled'}>${game.snapshot().ready?(mode==='versus'?'ENTER THE CUP':'LET’S PRACTICE'):'GETTING READY…'} <span>↗</span></button><p id="setup-error" role="status"></p></aside></main>${footer()}`;}
  function podium(){const won=result.winner==='player',winner=get(won?result.player:result.enemy);return `${header('AFTER THE CHAOS')}<main class="podium-screen"><div class="podium-heading"><span class="eyebrow">${MatchRules.stages[result.stage].name}</span><h1>${won?'THE CUP IS YOURS.':'ONE MORE ROUND?'}</h1><span class="outcome-stamp">${won?'VICTORY':'DEFEAT'}</span></div><section class="winner-podium"><span class="podium-crown">${cup}</span><div class="podium-rays"></div><img src="${winner.reference}" alt="${winner.displayName}"><div class="podium-name"><span>${won?'YOUR CHOG':'THE RIVAL'}</span><h2>${winner.name} WINS</h2></div><div class="podium-score"><span>${get(result.player).displayName}<b>${result.playerWins}</b></span><i>×</i><span>${get(result.enemy).displayName}<b>${result.enemyWins}</b></span></div></section><nav class="podium-actions" aria-label="Next match"><button class="solid-button" data-cmd="rematch">PLAY AGAIN <span>↗</span></button><button class="paper-button" data-cmd="reselect">NEW PERSONA</button><button class="paper-button" data-cmd="home">BACK TO THE HUB</button></nav></main>${footer()}`;}
  function about(){return `${header('THE COMMUNITY BOARD')}<main class="community-board"><div class="page-intro"><div><span class="eyebrow">FROM THE CREW, FOR THE CREW</span><h1>Welcome to the chaos.</h1></div><span class="board-cup">${cup}</span></div><div class="community-cards"><article><span class="eyebrow">THE HOUSE CUP</span><h2>Good friends.<br>Great rivals.</h2><p>Twelve CHOG personas meet in a playful community arcade. Invite a friend for a duel, host a four-player Practice Cup, or play VS Computer and Training.</p><p>The House Cup fighting premise, arena names and moves are our fan-game interpretation of the CHOG world.</p></article><article class="community-rules"><span class="eyebrow">A QUICK INVITATION</span><h2>How to play.</h2><p>VS Computer: 90 seconds a round, first to two wins. PvP: up to three rounds with one deciding overtime. House Cup: four invited players, two semifinals and a final. Training: practice at your own pace.</p><dl><dt>WASD</dt><dd>Move, jump and crouch</dd><dt>SPACE</dt><dd>Three-hit attack chain</dd><dt>I / O / P</dt><dd>Skills and ultimate</dd><dt>ESC / R</dt><dd>Pause / reset training</dd></dl></article></div><div class="community-credit"><p>Character references: <a href="https://www.chog.xyz/team" target="_blank" rel="noopener">CHOG Team</a>. World inspiration: <a href="https://www.youtube.com/watch?v=P8NSHkL7Fxs" target="_blank" rel="noopener">Chog Lore</a>. Combat engine adapted from <a href="https://github.com/bangtutorial/aether-clash" target="_blank" rel="noopener">Aether Clash by BangTutorial</a> under MIT. This is a community fan game.</p><button class="solid-button" data-cmd="home">BACK TO THE HUB <span>↗</span></button></div></main>${footer()}`;}
  function render(){
    root.dataset.screen=screen;root.dataset.step=String(step);root.dataset.mode=mode;
    root.innerHTML=screen==='home'?hub():screen==='select'?select():screen==='arena'?arena():screen==='result'?podium():about();
    syncBackground();
    if(screen==='select')root.querySelector(`[data-fighter="${hover}"]`)?.focus({preventScroll:true});
    else if(screen==='arena')root.querySelector('[data-cmd=start]')?.focus({preventScroll:true});
    if(screen==='arena')game.prepareMatch({player,enemy,stage}).catch(()=>{});
  }
  function updatePreview(play=true){
    root.querySelectorAll('[data-fighter]').forEach(b=>{const active=b.dataset.fighter===hover;b.classList.toggle('is-selected',active);b.setAttribute('aria-pressed',String(active));});
    const panel=root.querySelector('#persona-preview');if(panel)panel.innerHTML=dossier(hover);
    const side=step===0?'player':'rival',art=root.querySelector(`#${side}-showcase`);if(art)art.innerHTML=showcase(hover,side);
    if(play)sfx('move');
  }
  function focusFighter(id){if(hover===id||lock||!get(id))return;hover=id;updatePreview();}
  function confirm(){
    if(lock||!get(hover))return;sfx('pick');game.announceSelection(hover);
    root.querySelector(`[data-fighter="${hover}"]`)?.classList.add('picked');
    lock=setTimeout(()=>{lock=null;if(step===0){player=hover;step=1;hover=enemy;}else{enemy=hover;screen='arena';step=2;}render();},reduced.matches?0:160);
  }
  function back(){
    if(lock)return;game.stopAnnouncer();sfx('back');
    if(screen==='arena'){screen='select';step=1;hover=enemy;}else if(screen==='select'&&step===1){step=0;hover=player;}else{screen='home';step=0;}render();
  }
  let starting=false;
  async function start(){
    if(starting)return;starting=true;
    const options={player,enemy,stage,level,mode},button=root.querySelector('[data-cmd=start]'),error=root.querySelector('#setup-error');
    if(button){button.disabled=true;button.textContent='GETTING YOUR MATCH READY…';}
    try{
      await game.prepareMatch(options,(done,total)=>{if(error)error.textContent=`Loading your pair and arena · ${Math.round(done/total*100)}%`;});
      if(game.startMatch(options)){document.querySelector('#arena').focus();}
      else throw Error('Could not start the match.');
    }catch(_){if(error)error.textContent='Could not load this match. Check your connection and try again.';if(button){button.disabled=false;button.textContent='TRY AGAIN ↗';}}
    finally{starting=false;}
  }
  function command(cmd){
    if(lock)return;
    if(cmd==='lesson'){sfx('confirm');game.startTutorial();return;}
    if(cmd==='confirm'){confirm();return;}if(cmd==='back'){back();return;}
    sfx('confirm');
    if(cmd==='versus'||cmd==='training'){mode=cmd;screen='select';step=0;hover=player;render();}
    else if(cmd==='online'||cmd==='cup')window.openChogOnline(cmd==='cup'?'cup':'friend').catch(()=>{root.querySelector('#menu-ready').textContent='ONLINE UNAVAILABLE · TRY AGAIN';});
    else if(cmd==='settings')game.openSettings();
    else if(cmd==='about'){screen='about';render();}
    else if(cmd==='home'){game.stopAnnouncer();screen='home';step=0;render();}
    else if(cmd==='fullscreen')game.toggleFullscreen?.();
    else if(cmd==='start')start();
    else if(cmd==='rematch'){({player,enemy,stage,level,mode}=result);start();}
    else if(cmd==='reselect'){screen='select';step=0;hover=player;render();}
  }
  // Delegated handlers keep rebuilt dossier/map controls interactive.
  root.addEventListener('pointerdown',()=>{interacted=true;},true);
  root.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button||!root.contains(button)||lock)return;
    if(button.dataset.cmd){command(button.dataset.cmd);return;}
    if(button.dataset.fighter){focusFighter(button.dataset.fighter);return;}
    const kind=button.dataset.stage?'stage':button.dataset.level?'level':null;
    if(kind){if(kind==='stage')stage=button.dataset.stage;else level=button.dataset.level;sfx('move');render();root.querySelector(`[data-${kind}="${kind==='stage'?stage:level}"]`)?.focus({preventScroll:true});}
  });
  root.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const b=e.target.closest('[data-fighter]');if(b)focusFighter(b.dataset.fighter);});
  root.addEventListener('focusin',e=>{const b=e.target.closest('[data-fighter]');if(b)focusFighter(b.dataset.fighter);});
  document.addEventListener('keydown',e=>{
    if(root.hidden||document.querySelector('dialog[open]')||e.repeat||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    interacted=true;const key=e.key.toLowerCase();
    if(lock){if(['enter',' ','escape'].includes(key))e.preventDefault();return;}
    if(key==='escape'){e.preventDefault();back();return;}
    const direction={arrowleft:-1,a:-1,arrowright:1,d:1,arrowup:-1,w:-1,arrowdown:1,s:1}[key];
    if(screen==='select'&&direction){
      e.preventDefault();const vertical=['arrowup','arrowdown','w','s'].includes(key);
      const columns=getComputedStyle(root.querySelector('.persona-grid')).gridTemplateColumns.split(' ').length;
      const next=(ids.indexOf(hover)+direction*(vertical?columns:1)+ids.length)%ids.length;
      focusFighter(ids[next]);root.querySelector(`[data-fighter="${hover}"]`).focus();return;
    }
    if(screen==='select'&&key==='enter'&&(!e.target.closest('button')||e.target.closest('[data-fighter],[data-cmd="confirm"]'))){e.preventDefault();confirm();return;}
    if(screen==='arena'&&direction){
      e.preventDefault();const vertical=['arrowup','arrowdown','w','s'].includes(key),list=Object.keys(vertical&&mode==='versus'?MatchRules.difficulties:MatchRules.stages);
      if(vertical&&mode==='versus')level=list[(list.indexOf(level)+direction+list.length)%list.length];else stage=list[(list.indexOf(stage)+direction+list.length)%list.length];sfx('move');render();return;
    }
    if(screen==='arena'&&key==='enter'&&!e.target.closest('button')){e.preventDefault();start();return;}
    if(screen==='home'&&direction){e.preventDefault();const list=[...root.querySelectorAll('.hub-modes button')],i=list.indexOf(document.activeElement),vertical=['arrowup','arrowdown','w','s'].includes(key),columns=getComputedStyle(root.querySelector('.hub-modes')).gridTemplateColumns.split(' ').length;list[i<0?0:(i+direction*(vertical?columns:1)+list.length)%list.length].focus();}
    if(screen==='home'&&key==='enter'&&!e.target.closest('button')){e.preventDefault();command('versus');}
  });
  window.FrontEnd={syncBackground,home(){if(lock){clearTimeout(lock);lock=null;}screen='home';step=0;game.setMenuOpen(true);render();},showResult(data){result={...data,player:CHOG.id(data.player),enemy:CHOG.id(data.enemy)};({player,enemy,stage,level,mode}=result);screen='result';game.setMenuOpen(true);render();},assetsReady(ok=true){if(game.snapshot().menuOpen){render();if(!ok){const status=root.querySelector('#menu-ready');if(status)status.textContent='RELOAD TO GET READY';}}}};
  Promise.resolve(window.CHOG_PRELOAD).then(render);
})();
