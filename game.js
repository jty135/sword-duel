(() => {
  'use strict';
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const W = 1200, H = 600, TAU = Math.PI * 2;
  const keys = new Set();
  const AREA_CHARGE = .8, AREA_RADIUS = 210;
  const charge = { held:false, elapsed:0, fired:false };
  let areaEffects = [];
  let state = 'intro', player, enemies = [], particles = [], slashes = [], texts = [], projectiles = [];
  let wave = 0, kills = 0, nextWave = 0, time = 0, last = 0, shake = 0, announcementTime = 0, sound = false, audio;
  let best = 0;
  try { best = Number(localStorage.getItem('moonlit-best')) || 0; } catch {}
  $('best').textContent = String(best).padStart(2, '0');
  const rand = (a, b) => a + Math.random() * (b - a);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const bladePower = () => player.hitStreak >= 6 ? 3 : player.hitStreak >= 3 ? 2 : 1;
  const bladeColor = power => power >= 3 ? '#9fefff' : '#ffe099';
  const leaves = Array.from({length: 35}, () => ({x:rand(0,W),y:rand(0,H),s:rand(2,5),v:rand(8,24),p:rand(0,TAU)}));
  const stones = Array.from({length:65}, () => ({x:rand(30,W-30),y:rand(100,H-30),s:rand(1,4)}));
  function resize() { const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(canvas.clientWidth*dpr); canvas.height = Math.round(canvas.clientHeight*dpr); }
  new ResizeObserver(resize).observe(canvas);
  function beep(freq = 300, duration = .08, type = 'triangle', volume = .04) {
    if (!sound) return;
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); const o=audio.createOscillator(), g=audio.createGain(); o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.4,audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration); } catch {}
  }
  function announce(text) { $('announcement').textContent = text; $('announcement').classList.add('show'); announcementTime=2; }
  function updateHud() { $('hp').style.width = `${player.hp}%`; $('hpText').textContent = `${Math.ceil(player.hp)} / 100`; $('stamina').style.width = `${player.stamina}%`; $('wave').textContent = String(wave).padStart(2,'0'); $('kills').textContent=kills; $('enemyCount').textContent=`${enemies.length} 남음`; $('comboCount').textContent=player.hitStreak; $('bladePower').textContent=`공격력 ×${bladePower()}`; $('comboHud').setAttribute('data-power',bladePower()); $('rangedStatus').textContent=player.rangedCool>0?`참격 ${player.rangedCool.toFixed(1)}초`:player.stamina<25?'참격 · 기력 부족':'L 참격 준비'; $('areaStatus').textContent=charge.held&&!charge.fired?`월광 충전 ${Math.min(100,Math.floor(charge.elapsed/AREA_CHARGE*100))}%`:player.areaCool>0?`월광 폭발 ${player.areaCool.toFixed(1)}초`:player.stamina<45?'월광 폭발 · 기력 부족':'좌클릭 꾹 · 월광 폭발'; }
  function spawnWave() {
    wave++; const count = Math.min(3 + Math.floor(wave * 1.3), 16);
    for (let i=0;i<count;i++) { const a=i/count*TAU+rand(-.2,.2), heavy=wave>=3&&i%4===0, hp=(heavy?7:4)+Math.min(Math.floor(wave/4),3); enemies.push({x:W/2+Math.cos(a)*520,y:Math.max(115,Math.min(H-55,H/2+Math.sin(a)*230)),hp,maxHp:hp,heavy,a:0,cool:rand(.7,1.6),wind:0,attackA:0,flash:0,stun:.6,speed:rand(58,76)+Math.min(wave*3,45)}); }
    player.hp=Math.min(100,player.hp+(wave>1?15:0)); player.stamina=100;
    announce(`제 ${wave} 장 · ${wave===1?'달빛의 방문객':wave%3===0?'거센 칼바람':'끝나지 않은 결투'}`);
    $('status').textContent='검 끝에 집중하세요'; updateHud();
  }
  function start() {
    cancelCharge();
    if(state==='paused') { state='playing'; $('overlay').classList.add('hidden'); keys.clear(); return; }
    player={x:W/2,y:H/2+45,a:-Math.PI/2,hp:100,stamina:100,cool:0,rangedCool:0,areaCool:0,attack:0,dash:0,dashCool:0,invuln:0,guard:false,guardTime:0,combo:0,hitStreak:0};
    enemies=[];particles=[];slashes=[];texts=[];projectiles=[];areaEffects=[];kills=0;wave=0;nextWave=0;keys.clear();state='playing';$('overlay').classList.add('hidden');spawnWave();canvas.focus();
  }
  function showOverlay(tag,title,description,button) { $('overlayTag').textContent=tag; $('overlayTitle').textContent=title; $('overlayDescription').innerHTML=description; $('start').innerHTML=`${button} <span>↗</span>`; $('overlay').classList.remove('hidden'); }
  function pause() { if(state==='playing'){state='paused';keys.clear();cancelCharge();showOverlay('A MOMENT OF STILLNESS','잠시, 숨을 고르다','준비가 되면 다시 결투를 이어가세요.','계속하기');} else if(state==='paused')start(); }
  function end() { state='over';if(wave>best){best=wave;try{localStorage.setItem('moonlit-best',String(best));}catch{}$('best').textContent=String(best).padStart(2,'0');} showOverlay('THE BLADE RESTS, FOR NOW','검은 잠시 쉬어갈 뿐',`${wave}장까지 도달 · ${kills}명 처치<br>다시 검을 들고, 더 오래 버텨보세요.`,'다시 도전');beep(100,.5,'sawtooth'); }
  function burst(x,y,color,n=12) { for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(40,200);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.2,.55),max:.55,color});} }
  function label(x,y,text,color='#e3cd94') {texts.push({x,y,text,color,life:.8});}
  function cancelCharge() { charge.held=false;charge.elapsed=0;charge.fired=false; }
  function beginCharge() { if(state!=='playing'||charge.held)return;charge.held=true;charge.elapsed=0;charge.fired=false; }
  function releaseCharge() { const shortClick=charge.held&&!charge.fired;cancelCharge();if(shortClick&&state==='playing')attack(); }
  function areaAttack() {
    if(state!=='playing')return;
    if(player.areaCool>0||player.stamina<45||player.dash>0){label(player.x,player.y-45,player.areaCool>0?'월광 폭발 재사용 대기':player.stamina<45?'기력이 부족합니다':'대시 중에는 사용할 수 없습니다','#d5bba0');return;}
    const power=bladePower(),damage=3*power,color=power>1?bladeColor(power):'#d6f4dd';
    player.stamina-=45;player.areaCool=5;player.cool=.4;player.attack=.22;shake=12;
    areaEffects.push({x:player.x,y:player.y,color,life:.65,max:.65});
    burst(player.x,player.y,color,60);label(player.x,player.y-55,'월광 폭발',color);beep(150,.45,'sawtooth',.065);beep(850,.3,'triangle',.06);
    for(const e of enemies){if(e.hp<=0||distance(player,e)>AREA_RADIUS)continue;const a=Math.atan2(e.y-player.y,e.x-player.x);e.hp-=damage;e.flash=.25;e.stun=.85;e.wind=0;e.x=Math.max(25,Math.min(W-25,e.x+Math.cos(a)*45));e.y=Math.max(108,Math.min(H-30,e.y+Math.sin(a)*45));burst(e.x,e.y,color,22);label(e.x,e.y-30,`−${damage}`,color);if(e.hp<=0){kills++;burst(e.x,e.y,'#7e9e90',20);}}
    enemies=enemies.filter(e=>e.hp>0);updateHud();
  }
  function attack() {
    if(state!=='playing'||player.cool>0||player.dash>0||player.stamina<15) return;
    player.stamina-=15;player.cool=.32;player.attack=.22;player.combo++;
    const nearest=enemies.filter(e=>distance(player,e)<140).sort((a,b)=>distance(player,a)-distance(player,b))[0];
    if(nearest) player.a=Math.atan2(nearest.y-player.y,nearest.x-player.x);
    const targets=enemies.filter(e=>e.hp>0&&distance(player,e)<112&&Math.abs(angleDiff(Math.atan2(e.y-player.y,e.x-player.x),player.a))<1.35);
    const previousPower=bladePower();
    player.hitStreak=targets.length?player.hitStreak+1:0;
    const power=bladePower(),color=power>1?bladeColor(power):'#eee2b6';
    if(power>previousPower){label(player.x,player.y-48,power===3?'월광 각성 · 공격력 ×3':'검기 점화 · 공격력 ×2',color);burst(player.x,player.y,color,30);beep(power===3?1200:850,.3,'triangle',.07);}
    slashes.push({x:player.x,y:player.y,a:player.a,life:.23,max:.23,color,radius:94,power,flip:player.combo%2});beep(500+power*90,.09,'sawtooth',.025);
    targets.forEach(e=>{const a=Math.atan2(e.y-player.y,e.x-player.x);e.hp-=power;e.flash=.15;e.stun=.35;e.wind=0;e.x+=Math.cos(a)*23;e.y+=Math.sin(a)*23;burst(e.x,e.y,power>1?color:'#cbb881',12+power*3);shake=3+power;beep(180,.08,'square',.025);if(power>1)label(e.x,e.y-28,`−${power}`,color);if(e.hp<=0){kills++;burst(e.x,e.y,'#7e9e90',20);player.stamina=Math.min(100,player.stamina+10);}});
    enemies=enemies.filter(e=>e.hp>0);updateHud();
  }
  function dash() {
    if(state!=='playing'||player.dashCool>0||player.stamina<28)return;
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    if(dx||dy)player.a=Math.atan2(dy,dx);
    player.dash=.16;player.invuln=.23;player.dashCool=.6;player.stamina-=28;beep(220,.12);
  }
  function rangedAttack() {
    if(state!=='playing'||player.rangedCool>0||player.cool>0||player.dash>0||player.stamina<25)return;
    const power=bladePower(),color=power>1?bladeColor(power):'#c0e6d5';
    player.stamina-=25;player.rangedCool=1;player.cool=.24;player.attack=.22;
    projectiles.push({x:player.x,y:player.y,a:player.a,power,damage:2*power,color,life:.9,hit:new Set()});
    burst(player.x+Math.cos(player.a)*25,player.y+Math.sin(player.a)*25,color,10);
    beep(720+power*100,.2,'sawtooth',.035);updateHud();
  }
  function updateProjectiles(dt) {
    for(const p of projectiles){
      const step=Math.min(dt,p.life),dx=Math.cos(p.a)*640*step,dy=Math.sin(p.a)*640*step;
      for(const e of enemies){
        if(e.hp<=0||p.hit.has(e))continue;
        const lengthSquared=dx*dx+dy*dy;
        const t=lengthSquared?Math.max(0,Math.min(1,((e.x-p.x)*dx+(e.y-p.y)*dy)/lengthSquared)):0;
        if(Math.hypot(e.x-(p.x+dx*t),e.y-(p.y+dy*t))>32)continue;
        p.hit.add(e);e.hp-=p.damage;e.flash=.18;e.stun=.3;e.wind=0;
        burst(e.x,e.y,p.color,18);label(e.x,e.y-28,`−${p.damage}`,p.color);shake=3+p.power;beep(230,.08,'square',.02);
        if(e.hp<=0){kills++;burst(e.x,e.y,'#7e9e90',20);player.stamina=Math.min(100,player.stamina+10);}
      }
      p.x+=dx;p.y+=dy;p.life-=dt;
    }
    projectiles=projectiles.filter(p=>p.life>0&&p.x>-65&&p.x<W+65&&p.y>40&&p.y<H+65);
    enemies=enemies.filter(e=>e.hp>0);
  }
  function enemyHit(e) {
    const d=distance(e,player),a=Math.atan2(player.y-e.y,player.x-e.x);
    slashes.push({x:e.x,y:e.y,a:e.attackA,life:.2,max:.2,color:'#e69279',radius:80});beep(130,.1,'sawtooth',.02);
    if(d>100||Math.abs(angleDiff(a,e.attackA))>1.1||player.invuln>0)return;
    if(player.guard&&player.stamina>=12){const perfect=player.guardTime<.24;player.stamina-=perfect?5:18;e.stun=perfect?1.4:.5;burst(player.x,player.y,perfect?'#eaf4da':'#d8ba7d',22);label(player.x,player.y-35,perfect?'완벽한 방어':'방어');shake=perfect?8:3;beep(perfect?950:600,.18,'triangle',.08);if(perfect){player.stamina=Math.min(100,player.stamina+22);e.hp--;if(e.hp<=0){kills++;burst(e.x,e.y,'#a6c8ac',20);}}return;}
    player.hitStreak=0;player.hp=Math.max(0,player.hp-(e.heavy?28:18));player.invuln=.65;shake=10;burst(player.x,player.y,'#d17d69',15);label(player.x,player.y-30,`−${e.heavy?28:18}`,'#efa18a');if(player.hp<=0)end();
  }
  function update(dt) {
    if(state!=='playing')return;
    for(const k of ['cool','rangedCool','areaCool','attack','dashCool','invuln'])player[k]=Math.max(0,player[k]-dt);
    const wasGuard=player.guard;player.guard=keys.has('k')&&player.dash<=0&&player.stamina>0;player.guardTime=player.guard?(wasGuard?player.guardTime+dt:0):0;
    player.stamina=Math.min(100,player.stamina+dt*(player.guard?8:24));
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    if(player.dash>0){player.dash-=dt;dx=Math.cos(player.a);dy=Math.sin(player.a);player.x+=dx*850*dt;player.y+=dy*850*dt;burst(player.x,player.y,'#87aa9a',2);}
    else if(dx||dy){const n=Math.hypot(dx,dy);player.x+=dx/n*(player.guard?95:205)*dt;player.y+=dy/n*(player.guard?95:205)*dt;if(player.attack<=0)player.a=Math.atan2(dy,dx);}
    player.x=Math.max(32,Math.min(W-32,player.x));player.y=Math.max(105,Math.min(H-38,player.y));
    if(charge.held&&!charge.fired){charge.elapsed+=dt;if(charge.elapsed>=AREA_CHARGE){charge.fired=true;areaAttack();}}
    if(keys.has('j'))attack();
    if(keys.has('l'))rangedAttack();
    updateProjectiles(dt);
    for(const e of enemies){if(state!=='playing')break;e.flash=Math.max(0,e.flash-dt);e.stun=Math.max(0,e.stun-dt);if(e.stun>0)continue;const d=distance(e,player);e.a=Math.atan2(player.y-e.y,player.x-e.x);if(e.wind>0){e.wind-=dt;if(e.wind<=0){enemyHit(e);e.cool=rand(.85,1.45);}}else{e.cool-=dt;if(d<91&&e.cool<=0){e.wind=e.heavy?.72:.55;e.attackA=e.a;}else if(d>66){e.x+=Math.cos(e.a)*e.speed*dt;e.y+=Math.sin(e.a)*e.speed*dt;}}
      for(const other of enemies){if(other===e)continue;const sep=distance(e,other);if(sep<35&&sep>.01){e.x+=(e.x-other.x)/sep*30*dt;e.y+=(e.y-other.y)/sep*30*dt;}}
      e.x=Math.max(25,Math.min(W-25,e.x));e.y=Math.max(108,Math.min(H-30,e.y));
    }
    enemies=enemies.filter(e=>e.hp>0);
    if(enemies.length===0&&state==='playing'){nextWave+=dt;$('status').textContent='한숨 돌리세요 · 다음 장에서 체력 +15';if(nextWave>2.4){nextWave=0;spawnWave();}}
    updateHud();
  }
  function background() {
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#172d2e');g.addColorStop(1,'#21372c');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const moon=ctx.createRadialGradient(896,102,2,896,102,190);moon.addColorStop(0,'#d4d9ad28');moon.addColorStop(1,'#d4d9ad00');ctx.fillStyle=moon;ctx.fillRect(650,0,500,350);ctx.fillStyle='#d6dac385';ctx.beginPath();ctx.arc(896,90,34,0,TAU);ctx.fill();
    for(let layer=0;layer<3;layer++){for(let i=0;i<15;i++){const x=(i*97+layer*39)%W,y=80+layer*52;ctx.strokeStyle=['#0b212376','#102725a0','#112a26'][layer];ctx.lineWidth=7-layer;ctx.beginPath();ctx.moveTo(x+20,0);ctx.lineTo(x-15,H*.78-y);ctx.stroke();for(let j=0;j<5;j++){const py=50+j*61;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+16-py*.05,py);ctx.lineTo(x+50,py-22);ctx.lineTo(x+72,py-25);ctx.moveTo(x+40,py-15);ctx.lineTo(x+35,py-40);ctx.stroke();}}}
    const ground=ctx.createLinearGradient(0,200,0,H);ground.addColorStop(0,'#20372d00');ground.addColorStop(.5,'#243a30c0');ground.addColorStop(1,'#263b30');ctx.fillStyle=ground;ctx.fillRect(0,200,W,H);
    ctx.save();ctx.translate(W/2,H*.60);ctx.scale(1,.48);ctx.strokeStyle='#91a38818';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,310,0,TAU);ctx.stroke();ctx.strokeStyle='#91a3880a';ctx.beginPath();ctx.arc(0,0,325,0,TAU);ctx.stroke();ctx.restore();
    stones.forEach(s=>{ctx.fillStyle='#91a38819';ctx.beginPath();ctx.ellipse(s.x,s.y,s.s*2,s.s,0,0,TAU);ctx.fill();});
    leaves.forEach(l=>{let x=(l.x+time*l.v)%W,y=(l.y+time*l.v*.3)%H;ctx.save();ctx.translate(x,y);ctx.rotate(time*.6+l.p);ctx.fillStyle='#b6bc7950';ctx.beginPath();ctx.ellipse(0,0,l.s,l.s*.3,0,0,TAU);ctx.fill();ctx.restore();});
    const vignette=ctx.createRadialGradient(W/2,H/2,130,W/2,H/2,700);vignette.addColorStop(0,'#07161900');vignette.addColorStop(1,'#071619aa');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
  }
  function fighter(p,isPlayer) {
    ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle='#06141165';ctx.beginPath();ctx.ellipse(0,16,23,10,0,0,TAU);ctx.fill();
    if(isPlayer&&p.invuln>0&&p.dash<=0&&Math.floor(time*18)%2===0)ctx.globalAlpha=.5;
    ctx.rotate(p.a+Math.PI/2);
    const robe=isPlayer?'#ddd7b8':p.heavy?'#865e58':'#57736c';
    ctx.fillStyle=p.flash>0?'#f5e5c1':robe;ctx.beginPath();ctx.moveTo(-10,-7);ctx.lineTo(11,-7);ctx.lineTo(17,21);ctx.lineTo(2,17);ctx.lineTo(-15,21);ctx.closePath();ctx.fill();
    ctx.strokeStyle=isPlayer?'#56675a':'#314d46';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-3);ctx.lineTo(0,15);ctx.stroke();
    ctx.fillStyle=isPlayer?'#d2b894':'#baa58a';ctx.beginPath();ctx.arc(0,-10,9,0,TAU);ctx.fill();ctx.fillStyle='#202d29';ctx.beginPath();ctx.arc(0,-13,8,Math.PI,TAU);ctx.fill();ctx.fillRect(-8,-15,16,5);
    ctx.strokeStyle=isPlayer?'#a8c3b3':'#344f47';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-7,-10);ctx.quadraticCurveTo(-24,-14,-18+Math.sin(time*8)*5,7);ctx.stroke();
    ctx.save();ctx.translate(14,0);ctx.rotate(isPlayer&&p.attack>0?-1.8+(1-p.attack/.22)*3: .24);
    const power=isPlayer?bladePower():1;
    if(power>1){const color=bladeColor(power);ctx.save();ctx.shadowColor=color;ctx.shadowBlur=power===3?24:16;ctx.strokeStyle=color;ctx.globalAlpha=.45+Math.sin(time*9)*.12;ctx.lineWidth=power===3?11:8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(0,-42);ctx.stroke();ctx.restore();ctx.shadowColor=color;ctx.shadowBlur=14;}
    ctx.strokeStyle=power>1?bladeColor(power):'#c1c2a8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,5);ctx.lineTo(0,-40);ctx.stroke();ctx.strokeStyle='#f3efd6';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-1,-8);ctx.lineTo(-1,-39);ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#b09c66';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-5,-3);ctx.lineTo(5,-3);ctx.stroke();ctx.restore();
    ctx.restore();
    if(!isPlayer){if(p.wind>0){const progress=1-p.wind/(p.heavy?.72:.55);ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle=`rgba(223,118,88,${.08+progress*.24})`;ctx.strokeStyle=`rgba(243,152,104,${.4+progress*.5})`;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,95,p.attackA-1,p.attackA+1);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#edab81';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.fillText('!',0,-37);ctx.restore();}if(p.hp<p.maxHp){ctx.fillStyle='#14251e';ctx.fillRect(p.x-16,p.y-30,32,3);ctx.fillStyle='#b0846c';ctx.fillRect(p.x-16,p.y-30,32*p.hp/p.maxHp,3);}if(p.stun>.4){ctx.fillStyle='#dfcc91';ctx.font='14px sans-serif';ctx.fillText('✦',p.x-5,p.y-33);}}
    if(isPlayer&&p.guard){ctx.strokeStyle=p.guardTime<.24?'#f5edb9':'#96baaa';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,29,0,TAU);ctx.stroke();}
  }
  function draw(dt) {
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);ctx.save();if(shake>0){ctx.translate(rand(-shake,shake),rand(-shake,shake));shake=Math.max(0,shake-dt*35);}background();
    if(player&&charge.held&&!charge.fired&&state==='playing'){const progress=Math.min(1,charge.elapsed/AREA_CHARGE),color=bladePower()>1?bladeColor(bladePower()):'#d6f4dd';ctx.save();ctx.translate(player.x,player.y);ctx.fillStyle=color;ctx.globalAlpha=.04+progress*.07;ctx.beginPath();ctx.arc(0,0,AREA_RADIUS,0,TAU);ctx.fill();ctx.globalAlpha=.35;ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash([7,9]);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=.95;ctx.lineWidth=4;ctx.shadowColor=color;ctx.shadowBlur=15;ctx.beginPath();ctx.arc(0,0,36,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();ctx.restore();}
    areaEffects.forEach(effect=>{const progress=1-effect.life/effect.max;ctx.save();ctx.translate(effect.x,effect.y);ctx.globalAlpha=(1-progress)*.65;ctx.shadowColor=effect.color;ctx.shadowBlur=24;ctx.strokeStyle=effect.color;ctx.lineWidth=12*(1-progress)+1;ctx.beginPath();ctx.arc(0,0,AREA_RADIUS*Math.min(1,progress*3),0,TAU);ctx.stroke();ctx.globalAlpha=(1-progress)*.16;ctx.fillStyle=effect.color;ctx.beginPath();ctx.arc(0,0,AREA_RADIUS,0,TAU);ctx.fill();ctx.globalAlpha=(1-progress)*.9;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,AREA_RADIUS*(.5+progress*.5),0,TAU);ctx.stroke();ctx.restore();});
    if(player){[...enemies.map(p=>({p,m:false})),{p:player,m:true}].sort((a,b)=>a.p.y-b.p.y).forEach(o=>fighter(o.p,o.m));}
    projectiles.forEach(p=>{ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.globalAlpha=Math.min(1,p.life*6);ctx.shadowColor=p.color;ctx.shadowBlur=20;ctx.strokeStyle=p.color;ctx.lineWidth=7+p.power*2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-17,-33);ctx.quadraticCurveTo(26,0,-17,33);ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#f2fff6';ctx.lineWidth=2;ctx.stroke();ctx.globalAlpha*=.3;ctx.strokeStyle=p.color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-37,-29);ctx.quadraticCurveTo(3,0,-37,29);ctx.stroke();ctx.restore();});
    slashes.forEach(s=>{ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a);ctx.globalAlpha=s.life/s.max;if(s.power>1){ctx.shadowColor=s.color;ctx.shadowBlur=15*s.power;}ctx.lineWidth=3+s.life*24+(s.power>1?s.power*2:0);ctx.strokeStyle=s.color;ctx.beginPath();ctx.arc(0,0,s.radius,-1.2,1.2);ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#fff9df';ctx.beginPath();ctx.arc(0,0,s.radius-10,-1.1,1.1);ctx.stroke();ctx.restore();});
    particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.strokeStyle=p.color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.03,p.y-p.vy*.03);ctx.stroke();});ctx.globalAlpha=1;
    texts.forEach(t=>{ctx.globalAlpha=Math.min(1,t.life*2);ctx.font='bold 17px "Noto Sans KR", sans-serif';ctx.textAlign='center';ctx.fillStyle=t.color;ctx.fillText(t.text,t.x,t.y);});ctx.globalAlpha=1;ctx.restore();
  }
  function frame(now) {
    const dt=Math.min((now-last)/1000||0,.035);last=now;
    if(state!=='paused'){areaEffects.forEach(effect=>effect.life-=dt);areaEffects=areaEffects.filter(effect=>effect.life>0);}
    if(state!=='paused'){time+=dt;update(dt);particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vx*=.97;p.vy*=.97;});particles=particles.filter(p=>p.life>0);slashes.forEach(s=>s.life-=dt);slashes=slashes.filter(s=>s.life>0);texts.forEach(t=>{t.life-=dt;t.y-=dt*25;});texts=texts.filter(t=>t.life>0);if(announcementTime>0){announcementTime-=dt;if(announcementTime<=0)$('announcement').classList.remove('show');}}
    draw(dt);requestAnimationFrame(frame);
  }
  document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(k==='p'||k==='escape'){if(!e.repeat)pause();return;}if(k==='enter'&&(state==='intro'||state==='over')){start();return;}keys.add(k);if(k===' '&&!e.repeat)dash();if(k==='j'&&!e.repeat)attack();if(k==='l'&&!e.repeat)rangedAttack();});
  document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>{keys.clear();if(state==='playing')pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause();});
  canvas.addEventListener('pointermove',e=>{if(!player||state!=='playing')return;const r=canvas.getBoundingClientRect();if(e.pointerType==='mouse'&&player.attack<=0)player.a=Math.atan2((e.clientY-r.top)/r.height*H-player.y,(e.clientX-r.left)/r.width*W-player.x);});
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'){e.preventDefault();if(e.button===0&&state==='playing'){canvas.setPointerCapture(e.pointerId);beginCharge();}if(e.button===2)keys.add('k');}});
  canvas.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&e.button===0)releaseCharge();});
  canvas.addEventListener('pointercancel',cancelCharge);canvas.addEventListener('lostpointercapture',cancelCharge);
  window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')keys.delete('k');});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.querySelectorAll('[data-control]').forEach(button=>{const control=button.dataset.control,key={up:'w',left:'a',down:'s',right:'d',guard:'k',attack:'j',ranged:'l'}[control];button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(key)keys.add(key);if(control==='attack')attack();if(control==='ranged')rangedAttack();if(control==='dash')dash();});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{if(key)keys.delete(key);});});
  $('start').addEventListener('click',start);$('sound').addEventListener('click',()=>{sound=!sound;$('sound').textContent=`소리 ${sound?'ON':'OFF'}`;$('sound').setAttribute('aria-label',`효과음 ${sound?'끄기':'켜기'}`);if(sound)beep(600,.1);});
  resize();requestAnimationFrame(frame);
})();
