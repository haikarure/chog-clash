/* Presentation identities. Source-kit IDs remain inside the original combat engine. */
(() => {
  'use strict';
  const entries = [
    ['yot','Yot','arco','COLLAB CONNECTOR','Collaboration / partner pings & assists','#b874ed',['LINK CHAIN','PARTNER PING','COLLAB STOMP','PARTNER SQUAD']],
    ['mamio','Mamio','fenr','COMMUNITY SPIRIT','Agile / temporary transformation','#efaf46',['SCARF CHAIN','RUSH STEP','GALE KICK','GOLDEN AWAKENING']],
    ['benja','Benja','solan','RALLY LEAD','Founder / rally calls & shockwaves','#f7af27',['RALLY CHAIN','RALLY FLAG','CROWD BREAK','FOUNDER RALLY']],
    ['toad','Toad','edda','STEADY GUARD','Defender / counter & summon','#70d8ea',['STAFF CHAIN','STONE SKIP','TOAD COUNTER','SPIRIT TREAD']],
    ['ping','PingPingPingPing','naja','PING PATROL','Chog Police / patrol tape & sirens','#efa8dc',['RIBBON CHAIN','PATROL TAPE','SIREN SPIN','PING ALERT']],
    ['novee','Novee','cora','CODE BREAKER','Agile / ranged swarm','#fa9447',['BUG CHAIN','CODE SHOT','DEBUG GUST','BUG SWARM']],
    ['tonashiro','Tonashiro','isolde','DRONE DEVELOPER','Developer / drones & signal bursts','#a990e8',['SIGNAL CHAIN','DRONE PING','DEBUG BREAK','DRONE DROP']],
    ['bigchog','Bigchog','haldor','REPLY ENERGY','Community / keyboard hits & reply storms','#f0d88d',['HEAVY CHAIN','REPLY SHOT','REPLY CLOUD','REPLY STORM']],
    ['rogue','Rogue','zanni','INK MAKER','Artist / brush strokes & ink tricks','#e26ba3',['BRUSH CHAIN','INK SHOT','BRUSH HOOK','INK FINALE']],
    ['tabsu','Tabsu','mira','BONK BARRAGE','Chog Police / foam bonks & barrage','#7dbeef',['BONK CHAIN','BONK SHOT','BONK BURST','BONK BARRAGE']],
    ['venty','Venty','nib','FLOWER RUSH','Rushdown / homing projectiles','#92d35d',['FLOWER CHAIN','PETAL SHOT','QUICK STEP','FLOWER DELIVERY']],
    ['cookie','Cookie','rhea','CROWD HOST','Community / microphones & sound waves','#d898ed',['MIC CHAIN','SOUND SHOT','SOUND WELL','CROWD ORBIT']]
  ];
  const characters=entries.map(([id,displayName,kit,title,style,color,names])=>({
    id,displayName,kit,name:displayName.toUpperCase(),title,tag:title,style,color,names,
    race:'CHOG',detail:style, basic:names[0],ultimate:names[3],
    reference:'assets/chog/reference/'+id+'.png',art:'assets/chog/fighters/'+id+'/ui/select.webp',
    portrait:'assets/chog/fighters/'+id+'/ui/'+(id==='mamio'?'portrait-base':'portrait')+'.webp'
  }));
  const byId=Object.fromEntries(characters.map(c=>[c.id,c]));
  const byKit=Object.fromEntries(characters.map(c=>[c.kit,c]));
  function get(id){return byId[id]||byKit[id];}
  function fighterInfo(id,form){
    const c=get(id);if(!c)throw new Error('Unknown CHOG fighter: '+id);
    const empowered=c.id==='mamio'&&form==='wolf';
    const base='assets/chog/fighters/'+c.id+'/ui/';
    const icons=['basic','skill1','skill2','ultimate'].map((slot,i)=>base+'icon-'+(c.id==='mamio'&&i<3?(empowered?'empowered':'base')+'-':'')+slot+'.webp');
    return {...c,cls:empowered?'EMPOWERED':'CHOG',deck:c.name+(empowered?' · EMPOWERED':''),
      portrait:c.id==='mamio'?base+'portrait-'+(empowered?'empowered':'base')+'.webp':c.portrait,
      names:empowered?['RALLY CHAIN','GOLDEN RUSH','SPIRIT HOWL',c.names[3]]:c.names,icons};
  }
  window.CHOG=Object.freeze({characters,byId,byKit,get,fighterInfo,
    kit:id=>get(id)?.kit||id,id:kit=>get(kit)?.id||kit});
})();
