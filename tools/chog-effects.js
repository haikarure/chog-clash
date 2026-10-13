/* Original editable CHOG combat art: stickers, ink, bugs, drones and sound waves. */
(() => {
  'use strict';
  const ink='#291338',cream='#fff3d4',lime='#cbf86d';
  const sets={
    mamio:{claw:'slash',gale:'wind',rush:'streak',bite:'impact',howl:'rings',transform:'spirit'},
    tabsu:{star:'star',rocket:'bonk',burst:'rings',crash:'impact'},
    novee:{feather:'code',gust:'glitch',raven:'bug'},
    ping:{sandwave:'tape',cyclone:'wind',serpent:'siren',ripple:'rings'},
    bigchog:{slag:'key',splash:'bubble',steam:'cloud',quake:'impact'},
    rogue:{ring:'ink-ring',bigring:'palette',snatch:'brush',confetti:'splatter'},
    tonashiro:{piercer:'drone',skyfall:'drone',shatter:'glitch',frost:'rings'},
    cookie:{drift:'sound',planet:'mic',well:'rings',burst:'impact'},
    benja:{crescent:'flag',roar:'megaphone',impact:'impact',sunburst:'rings'},
    venty:{letter:'heart',plane:'flower',slip:'petals',stamp:'heart'},
    toad:{stone:'pebble',ripple:'rings',shell:'shield',tortoise:'spirit',stomp:'impact'},
  };
  function shape(c,points,color,width=6){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();c.lineWidth=width;c.strokeStyle=ink;c.lineJoin='round';if(width)c.stroke();}
  function ellipse(c,x,y,rx,ry,color,width=5){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();c.lineWidth=width;c.strokeStyle=ink;if(width)c.stroke();}
  function line(c,p,color,width=10){c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=ink;c.lineWidth=width+7;c.lineJoin='round';c.lineCap='round';c.stroke();c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  function star(c,r,color,n=8){shape(c,Array.from({length:n*2},(_,i)=>{const a=i*Math.PI/n,s=i%2?r*.51:r;return [Math.cos(a)*s,Math.sin(a)*s];}),color);}
  function text(c,t,x,y,size=76){c.font='900 '+size+'px sans-serif';c.textAlign='center';c.textBaseline='middle';c.lineWidth=8;c.strokeStyle=ink;c.strokeText(t,x,y);c.fillStyle=cream;c.fillText(t,x,y);}
  function heart(c,color){c.beginPath();c.moveTo(0,90);c.bezierCurveTo(-165,-5,-110,-126,0,-42);c.bezierCurveTo(110,-126,165,-5,0,90);c.fillStyle=color;c.fill();c.strokeStyle=ink;c.lineWidth=7;c.stroke();}
  function drone(c,color){
    line(c,[[-70,-13],[-155,-60]],cream,10);line(c,[[70,-13],[155,-60]],cream,10);
    ellipse(c,-154,-64,55,9,lime);ellipse(c,154,-64,55,9,lime);
    shape(c,[[-80,-53],[64,-53],[95,-10],[60,59],[-59,59],[-97,-10]],color);
    ellipse(c,-27,-4,11,17,cream,0);ellipse(c,28,-4,11,17,cream,0);
    line(c,[[-24,30],[0,39],[26,30]],cream,5);
    line(c,[[82,-18],[114,-18]],lime,13);ellipse(c,115,-18,7,13,cream);
  }
  function effect(id,name,asCanvas=false){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    const c=canvas.getContext('2d'),d=ChogArt.designs[id],color=d.trim,kind=sets[id][name];
    c.translate(256,256);c.lineCap='round';c.lineJoin='round';
    if(kind==='spirit'){c.save();c.translate(0,190);c.scale(2.1,2.1);ChogArt.render(c,id,'ultimate',2,4,id==='mamio');c.restore();}
    else if(kind==='rings'||kind==='sound'){
      for(let i=0;i<3;i++){c.beginPath();c.ellipse(0,0,58+i*54,kind==='sound'?58+i*54:29+i*35,0,0,Math.PI*2);c.strokeStyle=i%2?cream:color;c.lineWidth=18-i*3;c.stroke();}
      if(kind==='sound')text(c,'♪',0,0,88);
    }else if(kind==='slash'||kind==='wind'||kind==='streak'||kind==='brush'){
      for(let i=0;i<3;i++){c.beginPath();c.moveTo(-165,-70+i*60);c.bezierCurveTo(-20,-125+i*65,80,-100+i*60,177,15+i*25);c.strokeStyle=i%2?cream:color;c.lineWidth=kind==='brush'?38-i*8:22-i*4;c.stroke();}
      if(kind==='brush'){ellipse(c,122,118,16,26,color);ellipse(c,-123,-145,17,17,lime);}
    }else if(kind==='impact'||kind==='star'){
      star(c,kind==='impact'?180:155,color,kind==='impact'?9:5);c.save();c.rotate(.18);star(c,88,cream,5);c.restore();
      for(let i=0;i<6;i++){const a=i*Math.PI/3+.2;line(c,[[Math.cos(a)*194,Math.sin(a)*194],[Math.cos(a)*215,Math.sin(a)*215]],color,7);}
    }else if(kind==='drone'){c.scale(1.05,1.05);drone(c,color);}
    else if(kind==='bug'){
      for(let sign of [-1,1])for(let y of [-36,0,36])line(c,[[sign*43,y],[sign*84,y+23]],color,9);
      line(c,[[-23,-64],[-46,-109]],lime,7);line(c,[[23,-64],[46,-109]],lime,7);
      ellipse(c,0,12,61,86,color);line(c,[[0,-50],[0,91]],cream,4);ellipse(c,-21,-22,8,13,ink,0);ellipse(c,21,-22,8,13,ink,0);
    }else if(kind==='code'){text(c,'</>',0,0,150);line(c,[[-166,80],[-82,106]],color,14);line(c,[[72,-99],[156,-70]],lime,14);}
    else if(kind==='glitch'){
      for(let i=0;i<13;i++){const x=((i*79)%310)-155,y=((i*97)%310)-155;c.fillStyle=[color,cream,lime][i%3];c.fillRect(x,y,28+i%4*12,17+i%3*10);}
      text(c,'{ }',0,0,90);
    }else if(kind==='bonk'){
      c.rotate(.35);line(c,[[0,115],[0,-115]],cream,26);shape(c,[[-101,-102],[-101,-171],[92,-171],[111,-147],[93,-102]],color);text(c,'!',0,-135,43);
    }else if(kind==='key'){
      shape(c,[[-111,-99],[100,-99],[121,-75],[121,90],[-111,90]],color);shape(c,[[-88,-79],[89,-79],[89,61],[-88,61]],'#624471',3);text(c,'@',0,-3,105);
    }else if(kind==='bubble'||kind==='cloud'){
      ellipse(c,-66,8,78,72,color);ellipse(c,41,-11,110,85,color);shape(c,[[36,52],[83,113],[81,32]],color,0);text(c,kind==='bubble'?'!?':'…',0,0,90);
    }else if(kind==='ink-ring'||kind==='palette'){
      c.rotate(-.28);c.beginPath();c.arc(0,0,154,.08,Math.PI*1.93);c.strokeStyle=color;c.lineWidth=37;c.stroke();
      for(let i=0;i<6;i++){const a=i*1.047;ellipse(c,Math.cos(a)*151,Math.sin(a)*151,22,18,[color,lime,cream,'#ef80b8'][i%4],3);}
      if(kind==='palette'){ellipse(c,0,0,91,67,cream);ellipse(c,19,4,16,21,ink,0);}
    }else if(kind==='splatter'||kind==='petals'){
      for(let i=0;i<12;i++){const a=i*2.399,r=38+13*i;c.save();c.translate(Math.cos(a)*r,Math.sin(a)*r);c.rotate(a);ellipse(c,0,0,12+i%4*3,25,[color,lime,cream][i%3],2);c.restore();}
    }else if(kind==='heart')heart(c,color);
    else if(kind==='flower'){
      for(let i=0;i<6;i++){const a=i*Math.PI/3;ellipse(c,Math.cos(a)*78,Math.sin(a)*78,49,49,'#f6a1d0');}
      ellipse(c,0,0,40,40,lime);ellipse(c,-13,-7,6,8,ink,0);ellipse(c,13,-7,6,8,ink,0);
    }else if(kind==='mic'){
      c.rotate(.35);line(c,[[0,105],[0,-40]],'#ad8bea',38);ellipse(c,0,-70,66,81,color);for(let y=-100;y<=-40;y+=22)line(c,[[-43,y],[43,y]],ink,4);text(c,'♪',119,39,77);
    }else if(kind==='flag'||kind==='megaphone'){
      if(kind==='flag'){line(c,[[-72,136],[-72,-148]],cream,15);shape(c,[[-69,-135],[126,-135],[82,-57],[127,7],[-69,7]],color);text(c,'CWO',20,-67,49);}
      else {shape(c,[[-125,-41],[48,-96],[106,-74],[106,74],[48,96],[-125,41]],color);ellipse(c,85,0,24,68,cream);line(c,[[-66,43],[-43,111]],color,27);for(let i=-1;i<=1;i++)line(c,[[141,i*48],[192,i*73]],cream,12);}
    }else if(kind==='shield'){
      shape(c,[[-114,-136],[109,-136],[100,49],[0,147],[-101,49]],color);shape(c,[[-83,-104],[80,-104],[71,25],[0,103],[-72,25]],cream,4);text(c,'C',0,-8,83);
    }else if(kind==='pebble'){
      shape(c,[[-89,-67],[-10,-104],[82,-65],[108,22],[37,82],[-82,48]],color);ellipse(c,-23,-18,7,9,ink,0);ellipse(c,26,-18,7,9,ink,0);line(c,[[-19,12],[0,20],[22,12]],cream,4);
    }else if(kind==='tape'){
      c.rotate(-.17);shape(c,[[-190,-52],[190,-52],[190,52],[-190,52]],color);text(c,'PING',0,0,65);for(let x of [-165,150])line(c,[[x,-28],[x+20,28]],cream,9);
    }else if(kind==='siren'){
      shape(c,[[-114,79],[114,79],[94,115],[-96,115]],cream);ellipse(c,0,18,87,87,color);ellipse(c,0,-13,55,48,'#ffdc75');for(let i=0;i<5;i++){let a=Math.PI+i*Math.PI/4;line(c,[[Math.cos(a)*128,Math.sin(a)*128],[Math.cos(a)*171,Math.sin(a)*171]],color,15);}
    }
    return asCanvas?canvas:canvas.toDataURL('image/webp',.95);
  }
  function partnerDrone(){const c=document.createElement('canvas');c.width=224;c.height=190;const ctx=c.getContext('2d');ctx.translate(112,97);ctx.scale(.53,.53);drone(ctx,'#a968e4');return c.toDataURL('image/webp',.96);}
  window.ChogEffects={sets,effect,canvas:(id,name)=>effect(id,name,true),partnerDrone};
})();
