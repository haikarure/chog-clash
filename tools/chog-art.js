/* Hand-authored Canvas 2D character rigs. Original CHOG textures stay unchanged.
   This renderer exports normalized, feet-anchored CHOG animation frames. */
(() => {
  'use strict';
  const designs = {
    yot: { kit:'arco', height:180, head:[.25,.18,.75,.42], polygon:[[.25,.34],[.49,.25],[.66,.18],[.83,.3],[.98,.31],[.88,.41],[.98,.46],[.84,.51],[.76,.59],[.48,.59],[.28,.5]], coat:'#782cbd',trim:'#f3a542',pants:'#442171',boot:'#a750d3',headWidth:111,skin:'#ae39a3',accessory:'sign' },
    mamio: { kit:'fenr', height:184, head:[.04,0,.64,.45], polygon:[[.04,.28],[.18,.19],[.21,0],[.35,.09],[.55,.035],[.56,.18],[.67,.21],[.57,.31],[.59,.41],[.37,.45],[.15,.38]], coat:'#582b9a',trim:'#f8a326',pants:'#40216d',boot:'#cf7334',headWidth:112,skin:'#df409b',accessory:'cape' },
    benja: { kit:'solan', height:176, head:[0,0,1,.55], coat:'#ffa818',trim:'#e47617',pants:'#89b8d1',boot:'#a9c6df',headWidth:110,skin:'#9a40af',accessory:'megaphone' },
    toad: { kit:'edda', height:170, head:[0,0,1,.61], coat:'#59c4e0',trim:'#cbe7f2',pants:'#57529a',boot:'#f5eeec',headWidth:111,skin:'#ae40b7',accessory:'staff' },
    ping: { kit:'naja', height:182, head:[.1,0,.9,.58], coat:'#d781ce',trim:'#f8b2de',pants:'#bbb5e7',boot:'#e06ac5',headWidth:110,skin:'#d066bc',accessory:'whip' },
    novee: { kit:'cora', height:184, head:[.01,0,.96,.53], coat:'#ed790c',trim:'#ffb029',pants:'#7961b1',boot:'#9b65bf',headWidth:110,skin:'#d753a6',accessory:'bugs' },
    tonashiro: { kit:'isolde', height:200, head:[0,0,1,.52], coat:'#342640',trim:'#7870c5',pants:'#523289',boot:'#aa6330',headWidth:114,skin:'#a536a4',accessory:'controller' },
    bigchog: { kit:'haldor', height:169, head:[0,0,1,.46], coat:'#efe5bb',trim:'#4b4a43',pants:'#61576e',boot:'#a33c69',headWidth:118,skin:'#e2c94a',accessory:'keyboard' },
    rogue: { kit:'zanni', height:176, head:[.10,.015,.59,.56], polygon:[[.11,.19],[.22,.21],[.22,.025],[.37,.12],[.55,.02],[.57,.25],[.67,.30],[.58,.39],[.63,.48],[.53,.53],[.5,.57],[.35,.54],[.24,.45],[.21,.33]], coat:'#6b2aa3',trim:'#db4b8b',pants:'#492883',boot:'#ba762c',headWidth:107,skin:'#cd358f',accessory:'brush' },
    tabsu: { kit:'mira', height:182, head:[0,0,1,.6], coat:'#4147b6',trim:'#4ca7df',pants:'#32265a',boot:'#2e2455',headWidth:111,skin:'#c7439e',accessory:'bonk' },
    venty: { kit:'nib', height:150, head:[.03,0,.97,.59], coat:'#54c836',trim:'#264727',pants:'#6c26a9',boot:'#cf4396',headWidth:103,skin:'#d765a8',accessory:'flowers' },
    cookie: { kit:'rhea', height:170, head:[.49,.01,.41,.48], polygon:[[.49,.24],[.54,.09],[.62,.12],[.73,.015],[.775,.18],[.9,.23],[.83,.3],[.88,.4],[.74,.43],[.73,.47],[.6,.49],[.54,.46]], coat:'#6841b4',trim:'#c58d37',pants:'#47658a',boot:'#9c702c',headWidth:102,skin:'#d98e9a',accessory:'mic' }
  };
  const images = {};
  const outline = '#24172f';
  function path(ctx, points, fill, width=2.4) {
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}if(width){ctx.strokeStyle=outline;ctx.lineWidth=width;ctx.lineJoin='round';ctx.stroke();}
  }
  function oval(ctx,x,y,rx,ry,fill,width=2.2) {
    ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
    if(width){ctx.strokeStyle=outline;ctx.lineWidth=width;ctx.stroke();}
  }
  function stroke(ctx, points, color, width) {
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.lineWidth=width+4;ctx.strokeStyle=outline;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
    ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
  }
  function star(ctx,x,y,r,fill,n=5,inner=.5) {
    path(ctx,Array.from({length:n*2},(_,i)=>{const a=-Math.PI/2+i*Math.PI/n,s=i%2?r*inner:r;return [x+Math.cos(a)*s,y+Math.sin(a)*s];}),fill,1.8);
  }
  function head(ctx,id,d,bottom,offset=0,angle=0,empowered=false,expression='open') {
    const image=images[id];if(!image)return;
    const [nx,ny,nw,nh]=d.head, sx=nx*image.width,sy=ny*image.height,sw=nw*image.width,sh=nh*image.height;
    const width=d.headWidth,height=width*sh/sw;
    ctx.save();ctx.translate(offset,bottom-height*.48);ctx.rotate(angle);
    ctx.translate(-width/2,-height*.52);ctx.scale(width/sw,width/sw);
    if(d.polygon){ctx.beginPath();d.polygon.forEach(([x,y],i)=>{const px=x*image.width-sx,py=y*image.height-sy;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.closePath();ctx.clip();}
    if(empowered){ctx.shadowColor='#fbe16d';ctx.shadowBlur=14;ctx.filter='saturate(1.3) brightness(1.08)';}
    ctx.drawImage(image,sx,sy,sw,sh,0,0,sw,sh);
    for(const eye of d.eyes||[]){
      const x=eye.x-sx,y=eye.y-sy,r=eye.r;
      if(expression==='blink'||expression==='ko'){
        ctx.fillStyle=eye.skin;ctx.beginPath();ctx.ellipse(x,y,r*1.22,r*1.25,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#24172f';ctx.lineWidth=r*.20;ctx.lineCap='round';
        ctx.beginPath();if(expression==='blink'){ctx.moveTo(x-r*.65,y);ctx.quadraticCurveTo(x,y+r*.2,x+r*.65,y);}else{ctx.moveTo(x-r*.48,y-r*.48);ctx.lineTo(x+r*.48,y+r*.48);ctx.moveTo(x+r*.48,y-r*.48);ctx.lineTo(x-r*.48,y+r*.48);}ctx.stroke();
      }else if(expression==='effort'){ctx.strokeStyle='#24172f';ctx.lineWidth=r*.16;ctx.beginPath();ctx.moveTo(x-r*.7,y-r*1.25);ctx.lineTo(x+r*.7,y-r*.85);ctx.stroke();}
    }
    ctx.restore();
  }
  function eyeAttachments(id){
    const image=images[id],d=designs[id],[nx,ny,nw,nh]=d.head,c=canvas(image.width,image.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const w=image.width,h=image.height,pixels=ctx.getImageData(0,0,w,h).data,seen=new Uint8Array(w*h),parts=[];
    const x0=Math.floor((nx+nw*.15)*w),x1=Math.ceil((nx+nw*.88)*w),y0=Math.floor((ny+nh*.32)*h),y1=Math.ceil((ny+nh*.91)*h);
    const black=i=>pixels[i*4+3]>200&&pixels[i*4]+pixels[i*4+1]+pixels[i*4+2]<52;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const at=y*w+x;if(seen[at]||!black(at))continue;const stack=[at];seen[at]=1;let area=0,minX=x,maxX=x,minY=y,maxY=y;
      while(stack.length){const i=stack.pop(),px=i%w,py=Math.floor(i/w);area++;minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);for(const n of [i-1,i+1,i-w,i+w]){const xx=n%w,yy=Math.floor(n/w);if(xx>=x0&&xx<x1&&yy>=y0&&yy<y1&&!seen[n]&&black(n)){seen[n]=1;stack.push(n);}}}
      const ew=maxX-minX+1,eh=maxY-minY+1;if(area>120&&ew/eh>.55&&ew/eh<1.8&&ew<nw*w*.18){const cx=(minX+maxX)/2,cy=(minY+maxY)/2,sample=((Math.floor(cy)+Math.ceil(eh*.7))*w+Math.floor(cx))*4;parts.push({x:cx,y:cy,r:Math.max(ew,eh)/2,area,skin:`rgb(${pixels[sample]},${pixels[sample+1]},${pixels[sample+2]})`});}
    }
    parts.sort((a,b)=>b.area-a.area);const pair=parts.slice(0,2);
    if(pair.length===2&&Math.abs(pair[0].y-pair[1].y)<Math.max(pair[0].r,pair[1].r)*2.2)return pair;
    // Tilted/narrow eyes need explicit attachment anchors from the supplied artwork.
    const authored={toad:[[.431,.423,.033],[.647,.521,.027]],tonashiro:[[.401,.468,.060],[.641,.463,.060]],rogue:[[.336,.382,.021],[.471,.439,.021]]}[id];
    return (authored||[]).map(([x,y,r])=>({x:x*w,y:y*h,r:r*w,skin:'#fff7cd'}));
  }
  const profiles = {
    yot:{stance:1,lean:.025,bounce:1,guard:-66,weight:1,height:216},
    mamio:{stance:.9,lean:.045,bounce:1.5,guard:-70,weight:.95,height:236},
    benja:{stance:1.08,lean:-.02,bounce:1,guard:-56,weight:1.05,height:220},
    toad:{stance:1.15,lean:0,bounce:.45,guard:-78,weight:1,height:210},
    ping:{stance:.85,lean:.04,bounce:1.2,guard:-77,weight:.95,height:212},
    novee:{stance:.92,lean:.07,bounce:1.3,guard:-59,weight:.95,height:212},
    tonashiro:{stance:1.05,lean:-.025,bounce:.45,guard:-58,weight:1,height:228},
    bigchog:{stance:1.2,lean:0,bounce:.5,guard:-49,weight:1.18,height:222},
    rogue:{stance:1.08,lean:.075,bounce:1.2,guard:-68,weight:1,height:216},
    tabsu:{stance:1.15,lean:-.04,bounce:.6,guard:-73,weight:1.12,height:224},
    venty:{stance:.85,lean:.045,bounce:1.4,guard:-56,weight:.92,height:202},
    cookie:{stance:1,lean:-.035,bounce:1.1,guard:-69,weight:1,height:214}
  };
  function pose(state,frame,count,id='yot') {
    const persona=profiles[id];
    const t=count===1?0:frame/(count-1), phase=frame/count*Math.PI*2;
    const p={hip:-34,lean:0,bob:0,headAngle:0,feet:[[-15,0],[17,0]],hands:[[-25,-44],[43,-64]],turn:0,dx:0,dy:0,propAngle:0};
    if(state==='idle'){p.lean=persona.lean;p.bob=Math.sin(phase)*persona.bounce;p.hands[1][1]=persona.guard+Math.sin(phase)*1.5;p.feet.forEach(f=>f[0]*=persona.stance);p.headAngle=-persona.lean*.8;}
    if(state==='walk'||state==='run'){
      const fast=state==='run',s=Math.sin(phase),stride=fast?44:32,lift=fast?14:9;
      p.lean=fast?.08:.025;p.bob=-Math.abs(Math.cos(phase))*1.7;
      // The planted foot travels backwards through the contact half of the cycle.
      // This stride is exported to the runtime so world motion and contacts agree.
      const foot=(q,side)=>{q=(q+1)%1;return q<.5?[stride*(.5-q*2)+side*10,0]:[stride*(-.5+(q-.5)*2)+side*10,-Math.sin((q-.5)*Math.PI*2)*lift];};
      p.feet=[foot(frame/count,-1),foot(frame/count+.5,1)];
      p.hands=[[-23-s*18,-46],[27+s*18,-48]];
    }
    if(state==='jump'){const lift=[6,22,13,3][frame%4];p.feet=[[-24,-lift],[22,-lift-8]];p.hands=[[-37,-72-lift*.4],[43,-73-lift*.3]];p.lean=[.08,.04,-.01,-.04][frame%4];}
    if(state==='doublejump'){p.hip=-38;p.feet=[[-17,-51],[16,-49]];p.hands=[[-23,-66],[25,-70]];p.lean=.05;}
    if(state==='crouch'){p.hip=-14;p.feet=[[-28*persona.stance,0],[28*persona.stance,0]];p.hands=[[-24,-34],[38,-47]];p.lean=.08;}
    if(state.startsWith('attack')){
      const strike=frame===2?1:frame===1?.58:frame===3?.14:0,index=Number(state.slice(-1));
      p.lean=.07*strike;p.dx=strike*6;
      p.hands[1]=index===2?[35-5*strike,-62-85*strike]:[40+53*strike,-64-(index===3?24:8)*strike];
      p.hands[0]=[-28-8*strike,-49];p.propAngle=index===2?-1.1*strike:-.65+strike*.9;
      p.feet=[[-20,0],[24+strike*5,0]];
      p.headAngle=-strike*.06;
      if(id==='rogue'){p.propAngle=-.9+strike*1.6;p.hands[1][1]+=index===1?strike*10:-strike*5;p.lean+=strike*.05;}
      if(id==='tabsu'){p.propAngle=-1.25+strike*1.5;p.hip-=3*strike;p.hands[1][1]-=12*(1-strike);p.lean-=.04*(1-strike);}
      if(id==='toad'){p.propAngle=-.35+strike*.65;p.hands[0]=[-18,-68];p.lean*=.4;}
      if(id==='bigchog'){p.propAngle=-.4+strike*.4;p.feet=[[-26,0],[29,0]];p.hip+=3*strike;}
      if(id==='benja'||id==='cookie'){p.propAngle=-1.1+strike*.8;p.hands[0]=[-34-strike*12,-76];p.headAngle=strike*.06;}
      if(id==='tonashiro'||id==='novee'){p.hands[0]=[-17,-64];p.hands[1][1]+=8;p.lean*=.6;}
      if(id==='venty'||id==='ping'||id==='mamio'){p.hip-=strike*3;p.headAngle=-strike*.1;p.lean+=strike*.035;}
    }
    if(state==='skill1'){const cast=frame===2?1:frame===1?.6:frame===3?.2:0;p.hands=[[-22,-61],[43+47*cast,-82]];p.propAngle=-Math.PI/2;}
    if(state==='skill2'){const cast=frame===2?1:frame===1?.5:frame===3?.15:0;p.lean=.12*cast;p.hands=[[-29,-68],[30+31*cast,-109+70*cast]];p.feet=[[-26,0],[28,0]];p.propAngle=cast*.8-.8;}
    if(state==='ultimate'){p.hands=[[-34,-98],[43,-115]];p.propAngle=-.6;p.bob=-Math.sin(t*Math.PI)*2;}
    if(state==='hurt'){p.lean=-.13*(1-t*.65);p.dx=-6*(1-t);p.hands=[[-39,-63],[27,-86]];p.headAngle=-.09*(1-t);}
    if(state==='down'){const a=[-.22,-.75,-Math.PI/2,-Math.PI/2][frame]||-Math.PI/2;p.turn=a;p.dx=26;p.dy=frame>1?-63:frame===1?-30:0;p.hands=[[-24,-49],[28,-64]];}
    if(state==='recover'){if(frame===0){p.turn=-Math.PI/2;p.dx=26;p.dy=-63;}else if(frame===1){p.hip=-14;p.lean=.18;p.feet=[[-27,0],[27,0]];}else if(frame===2){p.hip=-26;p.lean=.08;}}
    if(id==='mamio'&&state!=='down'&&!(state==='recover'&&frame===0)){
      p.hip-=42;p.hands.forEach(hand=>hand[1]-=42);p.feet=[[-18,-42],[18,-42]];
    }
    return p;
  }
  function chain(start,target,upper,lower,bend=1,stretch=1){
    const dx=target[0]-start[0],dy=target[1]-start[1],distance=Math.hypot(dx,dy)||.001;
    const reach=Math.min(distance,(upper+lower)*stretch-.01),ratio=reach/distance;
    const end=[start[0]+dx*ratio,start[1]+dy*ratio],u=upper*stretch,l=lower*stretch;
    const angle=Math.atan2(dy,dx)+bend*Math.acos(Math.max(-1,Math.min(1,(u*u+reach*reach-l*l)/(2*u*reach))));
    return {joint:[start[0]+Math.cos(angle)*u,start[1]+Math.sin(angle)*u],end};
  }
  function weapon(ctx,d,hand,angle,state) {
    const [x,y]=hand;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    if(d.accessory==='brush'){
      stroke(ctx,[[0,20],[0,-61]],'#bd874f',7);path(ctx,[[-10,-58],[-11,-77],[0,-95],[11,-77],[9,-57]],'#e979af');
    }else if(d.accessory==='controller'){
      path(ctx,[[-27,-13],[20,-13],[30,8],[21,18],[-22,18],[-31,8]],'#7560b0');oval(ctx,-10,1,4,4,'#c9f578',1);oval(ctx,13,1,4,4,'#ffbe5b',1);stroke(ctx,[[18,-13],[24,-31]],'#c9f578',3);
    }else if(d.accessory==='keyboard'){
      path(ctx,[[-34,-19],[33,-19],[38,15],[-38,15]],'#ded2ee');for(let row=0;row<2;row++)for(let col=0;col<6;col++){ctx.fillStyle=(col+row)%2?'#c4a0e2':'#765596';ctx.fillRect(-29+col*10,-12+row*11,7,7);}
    }else if(d.accessory==='bonk'){
      stroke(ctx,[[0,16],[0,-53]],'#f4d37d',9);path(ctx,[[-25,-48],[-25,-76],[22,-76],[30,-63],[22,-48]],'#b8c6f3');
    }else if(d.accessory==='mic'){
      stroke(ctx,[[0,16],[0,-24]],'#b0a2d2',9);oval(ctx,0,-36,13,19,'#e3b456');for(let y=-47;y<-23;y+=7)stroke(ctx,[[-9,y],[9,y]],'#524257',2);
    }else if(d.accessory==='megaphone'){
      path(ctx,[[-14,-27],[31,-48],[40,-39],[40,-3],[31,4],[-14,-9]],'#ffd16a');oval(ctx,35,-22,5,22,'#f9eed2');stroke(ctx,[[0,-9],[4,10]],'#e5aa43',8);
    }else if(d.accessory==='sword'||d.accessory==='blade'){
      stroke(ctx,[[0,0],[0,-74]],'#c5cbdf',8);path(ctx,[[-7,-12],[-8,-66],[0,-88],[8,-66],[7,-12]],'#e1e5ee',2);
      stroke(ctx,[[-12,-8],[12,-8]],'#f3b940',5);stroke(ctx,[[0,-4],[0,13]],'#aa4826',7);
    }else if(['staff','lance','hammer','sign','whip'].includes(d.accessory)){
      stroke(ctx,[[0,27],[0,-72]],d.accessory==='staff'?'#685489':'#9a7086',5);
      if(d.accessory==='sign'){oval(ctx,0,-69,16,16,'#f2e7d5');oval(ctx,0,-69,12,12,'#e53151',1);stroke(ctx,[[-9,-79],[9,-59]],'#f5eadb',4);}
      if(d.accessory==='lance')path(ctx,[[-8,-66],[0,-99],[8,-66],[0,-56]],'#7de2ff');
      if(d.accessory==='staff')star(ctx,0,-75,15,'#72dcee');
      if(d.accessory==='hammer'){path(ctx,[[-23,-62],[-23,-84],[22,-84],[27,-73],[22,-62]],'#69657b');path(ctx,[[-15,-81],[16,-81],[16,-65],[-15,-65]],'#f5cf65',1.5);}
      if(d.accessory==='whip'){ctx.beginPath();ctx.moveTo(0,-70);ctx.bezierCurveTo(34,-96,45,-31,69,-66);ctx.strokeStyle=outline;ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle='#eda8df';ctx.lineWidth=2.5;ctx.stroke();}
    }else if(d.accessory==='bugs'&&state==='ultimate')star(ctx,0,-9,13,'#f5aa39');
    ctx.restore();
  }
  function rawRender(ctx,id,state='idle',frame=0,count=4,empowered=false,bodyOnly=false) {
    const d=designs[id],p=pose(state,frame,count,id),size=d.bodyScale||d.height/180;
    ctx.save();ctx.translate(p.dx,p.dy);ctx.rotate(p.turn);ctx.scale(size,size);
    if(id==='mamio'){
      // Mamio's mount is part of the gameplay silhouette, as in the official reference.
      const phase=frame/count*Math.PI*2,moving=state==='walk'||state==='run';
      path(ctx,[[-54,-40],[-70,-51],[-66,-29],[-45,-26]],'#af6037');
      for(let leg=0;leg<4;leg++){
        const x=-37+leg*23,q=(frame/count+leg%2*.5)%1,stride=state==='run'?44:32;
        const shift=!moving?0:q<.5?stride*(.5-q*2):stride*(-.5+(q-.5)*2),lift=!moving?0:q<.5?0:-Math.sin((q-.5)*Math.PI*2)*(state==='run'?14:9);
        stroke(ctx,[[x,-30],[x+shift,-12+lift*.3],[x+shift,lift]],'#ba6438',12);path(ctx,[[x+shift-9,lift-7],[x+shift+8,lift-7],[x+shift+10,lift+1],[x+shift-10,lift+1]],'#793548',1.8);
      }
      oval(ctx,-5,-39,55,26,empowered?'#f4c05e':'#e99044');oval(ctx,13,-40,26,17,'#ffdc78',1.5);
      path(ctx,[[-31,-61],[19,-61],[29,-31],[-34,-31]],'#7e4151');stroke(ctx,[[-28,-57],[20,-57]],'#ffd064',5);
      ctx.save();ctx.translate(55,-37);ctx.scale(-1,1);const im=images.mamio;
      ctx.beginPath();[[-45,-48],[18,-60],[43,-39],[48,9],[18,26],[-35,9]].forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();
      ctx.drawImage(im,0,im.height*.42,im.width*.53,im.height*.38,-49,-65,103,91);ctx.restore();
    }
    if(empowered){ctx.save();ctx.globalAlpha=.18;oval(ctx,0,-90,65,86,'#efd551',0);ctx.restore();}
    if(d.accessory==='cape')path(ctx,[[-23,-78],[-47,-68],[-48,-17],[-15,-27],[16,-33]],empowered?'#e8b844':'#ce932d');
    for(let i=0;i<2;i++){
      const [fx,fy]=p.feet[i],hx=i?11:-11,leg=chain([hx,p.hip],[fx,fy-7],26,26,i?-1:1);
      stroke(ctx,[[hx,p.hip],leg.joint,[fx,fy-7]],d.pants,15*profiles[id].weight);
      ctx.save();ctx.translate(fx,fy-5);path(ctx,[[-10,-7],[8,-7],[13,0],[13,5],[-11,5],[-13,0]],d.boot,2.5);stroke(ctx,[[-8,1],[10,1]],'#d8d2e5',1.5);ctx.restore();
    }
    ctx.save();ctx.translate(p.lean*30,p.bob);ctx.rotate(p.lean);
    const top=p.hip-43;
    const left=chain([-19,top+10],p.hands[0],31,34,-1),right=chain([19,top+10],p.hands[1],31,34,1,state.startsWith('attack')&&frame===2?1.06:1);
    p.hands=[left.end,right.end];
    stroke(ctx,[[-19,top+10],left.joint,left.end],d.coat,15);oval(ctx,...p.hands[0],8,9,d.skin);
    path(ctx,[[-24,top+3],[19,top+3],[25,p.hip-1],[16,p.hip+5],[-20,p.hip+5],[-27,top+29]],d.coat);
    stroke(ctx,[[-19,p.hip],[19,p.hip]],d.trim,5);
    if(id==='benja'){path(ctx,[[-20,top+3],[17,top+3],[13,top+13],[-14,top+13]],d.trim,1);stroke(ctx,[[4,p.hip+9],[4,p.hip+28]],'#bad4e3',2);}
    if(id==='yot'){path(ctx,[[-15,top+16],[11,top+16],[11,p.hip-8],[-15,p.hip-8]],'#f2d9ba',2);stroke(ctx,[[18,top+8],[23,p.hip-10]],d.trim,2);}
    if(id==='bigchog'){path(ctx,[[0,top+3],[19,top+3],[25,p.hip-1],[16,p.hip+5],[0,p.hip+5]],'#56544b',0);oval(ctx,-5,top+23,11,17,'#f8eed3',0);}
    if(id==='toad'){path(ctx,[[-24,top+19],[-3,top+11],[18,top+21],[-6,top+27]],'#d4f1f5',0);stroke(ctx,[[0,top+10],[0,p.hip]],'#9fe7eb',2);}
    if(id==='novee'){ctx.fillStyle='#271827';ctx.font='bold 5px sans-serif';ctx.textAlign='center';ctx.fillText('MY CODE',0,top+21);ctx.fillText('HAS BUGS',0,top+28);}
    if(id==='venty'){for(let n=0;n<3;n++)stroke(ctx,[[-22,top+12+n*10],[22,top+12+n*10]],'#23442d',4);}
    if(id==='tabsu'){path(ctx,[[-24,top+5],[-32,top-5],[-17,top-10],[-10,top+7]],'#587bcc');path(ctx,[[21,top+5],[29,top-5],[15,top-10],[9,top+7]],'#4d69c3');oval(ctx,0,top+22,11,11,'#74dafb');oval(ctx,0,top+22,6,6,'#b6f4ff',1);}
    if(id==='tonashiro'){path(ctx,[[-19,top+14],[15,top+14],[15,p.hip-5],[-19,p.hip-5]],'#8db9cf',1.5);star(ctx,-2,top+28,9,'#17283f',7);}
    if(id==='rogue'){path(ctx,[[-21,top-2],[20,top-2],[22,top+10],[-25,top+11]],'#e356a7',2);for(let n=-18;n<20;n+=7)stroke(ctx,[[n,top],[n,top+8]],'#b52e77',2);}
    if(id==='cookie')path(ctx,[[-19,top+6],[-30,p.hip+12],[-10,p.hip+8],[5,top+7]],'#91a7be',2);
    if(id==='ping'){path(ctx,[[-20,top+3],[1,top+3],[-3,p.hip],[-22,p.hip]],'#e7a1d8',1.8);oval(ctx,0,p.hip-4,5,6,'#f1cc9f',1);}
    // Head/back attachments precede the front hand so grips remain visible.
    const expression=state==='down'?'ko':state==='hurt'||state.startsWith('attack')?'effort':state==='idle'&&count>4&&frame===count-2?'blink':'open';
    head(ctx,id,d,top+7,p.lean*7,p.headAngle,empowered,expression);
    if(state==='hurt'){ctx.fillStyle='#70d7ff';ctx.beginPath();ctx.ellipse(-d.headWidth*.44,top-18,3,7,-.4,0,Math.PI*2);ctx.fill();}
    stroke(ctx,[[19,top+10],right.joint,right.end],d.coat,15);
    if(d.accessory==='armor')oval(ctx,p.hands[1][0],p.hands[1][1],10,10,'#84b7ef');
    if(!bodyOnly)weapon(ctx,d,p.hands[1],p.propAngle,state);
    oval(ctx,...p.hands[1],8,9,d.skin);
    if(d.accessory==='flowers'){for(let i=0;i<5;i++)oval(ctx,p.hands[1][0]+Math.cos(i*1.26)*8,p.hands[1][1]+Math.sin(i*1.26)*8,4,6,'#ef85cc',1);}
    ctx.restore();
    ctx.restore();
  }
  const groundOffsets=new Map();
  function bounds(id,state,frame,count,empowered=false,bodyOnly=false){
    const c=canvas(1024,768),ctx=c.getContext('2d',{willReadFrequently:true});ctx.translate(512,580);rawRender(ctx,id,state,frame,count,empowered,bodyOnly);
    const data=ctx.getImageData(0,0,1024,768).data;let x0=1024,y0=768,x1=0,y1=0;
    for(let y=0;y<768;y++)for(let x=0;x<1024;x++)if(data[(y*1024+x)*4+3]>=40){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}
    return {left:x0-512,right:x1-512,top:y0-580,bottom:y1-580};
  }
  function render(ctx,id,state='idle',frame=0,count=4,empowered=false){
    const airborne=state==='jump'||state==='doublejump',key=[id,state,frame,count,empowered].join(':');
    if(!airborne&&!groundOffsets.has(key))groundOffsets.set(key,bounds(id,state,frame,count,empowered,true).bottom);
    ctx.save();if(!airborne)ctx.translate(0,-groundOffsets.get(key));rawRender(ctx,id,state,frame,count,empowered);ctx.restore();
  }
  function socket(id,state='skill1',frame=2,count=4,empowered=false){
    const d=designs[id],p=pose(state,frame,count,id),top=p.hip-43,arm=chain([19,top+10],p.hands[1],31,34,1,state.startsWith('attack')&&frame===2?1.06:1);
    const [x,y]=arm.end,c=Math.cos(p.lean),s=Math.sin(p.lean),sx=(x*c-y*s+p.lean*30)*d.bodyScale,sy=(x*s+y*c+p.bob)*d.bodyScale;
    const key=[id,state,frame,count,empowered].join(':');if(!groundOffsets.has(key))groundOffsets.set(key,bounds(id,state,frame,count,empowered,true).bottom);
    return {x:p.dx+sx*Math.cos(p.turn)-sy*Math.sin(p.turn),y:p.dy+sx*Math.sin(p.turn)+sy*Math.cos(p.turn)-groundOffsets.get(key)};
  }
  async function load() {
    await Promise.all(Object.keys(designs).map(id=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[id]=im;resolve();};im.onerror=()=>reject(new Error('Missing CHOG reference '+id));im.src='../assets/chog/reference/'+id+'.png';})));
    for(const id of Object.keys(designs)){const d=designs[id];d.eyes=eyeAttachments(id);const b=bounds(id,'idle',0,4,false,true);d.bodyScale=(d.height/180)*profiles[id].height/(b.bottom-b.top);}
  }
  function canvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
  function atlas(job){const c=canvas(job.width,job.height),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    for(const [state,frames] of Object.entries(job.rows))frames.forEach((r,i)=>{ctx.save();ctx.translate(r.x+job.anchorX,r.y+job.anchorY);ctx.beginPath();ctx.rect(-job.anchorX,-job.anchorY,r.w,r.h);ctx.clip();render(ctx,job.id,state,i,frames.length,job.empowered);ctx.restore();});
    return c.toDataURL('image/webp',.96);
  }
  function portrait(id,empowered=false){const c=canvas(384,384),ctx=c.getContext('2d'),d=designs[id];
    const gradient=ctx.createLinearGradient(0,0,384,384);gradient.addColorStop(0,d.coat);gradient.addColorStop(1,'#211332');ctx.fillStyle=gradient;ctx.fillRect(0,0,384,384);
    // Portrait framing follows the face crop, independent of body normalization or a mount.
    const im=images[id],ratio=d.head[3]*im.height/(d.head[2]*im.width),width=Math.min(342,342/ratio),height=width*ratio;
    ctx.save();ctx.translate(192,0);head(ctx,id,{...d,headWidth:width},192+height/2,0,0,empowered);ctx.restore();return c.toDataURL('image/webp',.94);
  }
  function selection(id){const c=canvas(550,900),ctx=c.getContext('2d');const im=images[id],scale=Math.min(510/im.width,840/im.height);ctx.drawImage(im,(550-im.width*scale)/2,900-im.height*scale,im.width*scale,im.height*scale);return c.toDataURL('image/webp',.95);}
  function cutin(id){const c=canvas(1600,680),ctx=c.getContext('2d');const im=images[id],scale=Math.min(950/im.width,650/im.height);ctx.drawImage(im,750-im.width*scale/2,680-im.height*scale,im.width*scale,im.height*scale);return c.toDataURL('image/webp',.95);}
  function icon(id,slot,empowered=false){const c=canvas(192,192),ctx=c.getContext('2d'),d=designs[id];
    const gradient=ctx.createRadialGradient(90,65,8,96,96,135);gradient.addColorStop(0,d.trim);gradient.addColorStop(1,'#27203a');ctx.fillStyle=gradient;ctx.fillRect(0,0,192,192);
    ctx.strokeStyle='#eadacf';ctx.lineWidth=5;ctx.strokeRect(8,8,176,176);
    if(slot==='basic'){ctx.save();ctx.translate(88,225);ctx.scale(1.4,1.4);render(ctx,id,'attack1',2,4,empowered);ctx.restore();}
    if((slot==='skill1'||slot==='skill2')&&window.ChogEffects?.sets[id]){const keys=Object.keys(ChogEffects.sets[id]);ctx.drawImage(ChogEffects.canvas(id,keys[slot==='skill1'?0:1]),18,18,156,156);return c.toDataURL('image/webp',.95);}
    if(slot==='skill1'){star(ctx,100,88,34,'#fff0b7');stroke(ctx,[[31,137],[78,91]],'#d2b7f8',13);star(ctx,139,40,13,'#fef2cf');}
    if(slot==='skill2'){for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(96,146,28+i*24,Math.PI*1.1,Math.PI*1.9);ctx.strokeStyle=i%2?'#e59acb':'#d8b8f3';ctx.lineWidth=10;ctx.stroke();}star(ctx,96,100,27,'#ffdb7b');}
    if(slot==='ultimate'){star(ctx,96,96,61,'#f5cc73',7,.57);ctx.save();ctx.translate(95,159);ctx.scale(.84,.84);head(ctx,id,{...d,headWidth:118},-6,0,0,empowered);ctx.restore();}
    return c.toDataURL('image/webp',.95);
  }
  function spirit(id){const c=canvas(512,512),ctx=c.getContext('2d');ctx.save();ctx.translate(256,495);ctx.scale(2.6,2.6);ctx.shadowColor='#7deed8';ctx.shadowBlur=14;render(ctx,id,'ultimate',2,4);ctx.restore();return c.toDataURL('image/webp',.94);}
  window.ChogArt={designs,profiles,load,render,bounds,pose,chain,socket,atlas,portrait,selection,cutin,icon,spirit};
})();
