/* SPDX-License-Identifier: Apache-2.0 */
(function () {
  'use strict';
  const $=id=>document.getElementById(id), {create,step,STEP,MISSIONS}=SubHunt;
  const draw=SubHuntRenderer($('game')), keys=new Set(), touch=new Set();
  let role='boat',state=create(role),screen='menu',paused=false,last=0,accumulator=0,visualTime=0,toastTime=0,padPause=false,padMenuFire=false;
  let sound=false,audio=null,highScore=0;
  try{highScore=Number(localStorage.getItem('subhunt-best-v1'))||0;}catch{}
  function tone(frequency,duration=.12,type='sine',volume=.05,slide=0){
    if(!sound||!audio)return;
    const osc=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
    osc.type=type;osc.frequency.setValueAtTime(frequency,now);if(slide)osc.frequency.exponentialRampToValueAtTime(slide,now+duration);
    gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(now+duration);
  }
  function unlockAudio(){
    if(!sound)return;
    try{audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{sound=false;updateSound();}
  }
  function updateSound(){$('sound').textContent=sound?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Mute sound':'Enable sound');}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');toastTime=2.8;}
  function overlay(card){$('overlay').hidden=!card;for(const id of ['start-card','result-card','pause-card'])$(id).hidden=id!==card;}
  function selectRole(next){role=next;for(const r of ['boat','sub']){$('role-'+r).classList.toggle('selected',r===role);$('role-'+r).setAttribute('aria-pressed',String(r===role));}state=create(role);hud();}
  function clearInput(){keys.clear();touch.clear();document.querySelectorAll('[data-control]').forEach(b=>b.classList.remove('pressed'));}
  function launch(){
    unlockAudio();clearInput();state=create(role);screen='playing';paused=false;accumulator=0;draw.reset();overlay(null);$('pause').disabled=false;$('pause').textContent='PAUSE Ⅱ';
    toast(role==='boat'?'Drop charges above contacts. E to reveal subs.':'Dodge charges. Fire upward through gaps in the ducks.');hud();$('launch').blur();
  }
  function menu(){screen='menu';paused=false;clearInput();state=create(role);draw.reset();overlay('start-card');$('pause').disabled=true;hud();$('launch').focus();}
  function pause(value=!paused){
    if(screen!=='playing')return;paused=value;clearInput();accumulator=0;overlay(paused?'pause-card':null);$('pause').textContent=paused?'RESUME ▷':'PAUSE Ⅱ';hud();if(paused)$('resume').focus();
  }
  function finish(){
    screen='result';clearInput();overlay('result-card');$('pause').disabled=true;
    const won=state.status==='won';
    highScore=Math.max(highScore,state.score);try{localStorage.setItem('subhunt-best-v1',String(highScore));}catch{}
    $('result-label').textContent=won?'ALL THREE SECTORS SECURED':'OPERATION REPORT';$('result-title').textContent=won?'You rule the tub.':'Bath time over.';
    $('result-copy').textContent=(won?'The porcelain is peaceful again. ':'Your tiny vessel fought a good fight. ')+`${state.kills} vessels sunk · ${state.score.toLocaleString()} points · Best ${highScore.toLocaleString()}.`;
    $('again').focus();hud();
  }
  function events(){
    draw.ingest(state.events);
    for(const e of state.events){
      if(e.type==='fire')tone(role==='boat'?120:340,.16,'triangle',.04,70);
      if(e.type==='sonar')tone(850,.65,'sine',.07,350);
      if(e.type==='sink')tone(100,.35,'sawtooth',.025,35);
      if(e.type==='damage')tone(160,.2,'square',.025,65);
      if(e.type==='duck')tone(310,.14,'triangle',.04,210);
      if(e.type==='clear')toast('Sector clear! Hull repaired. Next mission incoming…');
      if(e.type==='mission')toast('MISSION '+(state.mission+1)+' / '+e.text.toUpperCase());
    }
  }
  function hud(){
    $('status').textContent=screen==='menu'?'AWAITING CAPTAIN':paused?'HOLDING POSITION':state.status==='won'?'TUB SECURED':state.status==='lost'?'VESSEL LOST':'OPERATION LIVE';
    $('hull').textContent=Array.from({length:5},(_,i)=>i<state.player.hp?'●':'○').join(' ');
    const seconds=Math.ceil(state.timeLeft);$('timer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
    $('score').textContent=String(state.score).padStart(6,'0');$('mission').textContent='MISSION 0'+(state.mission+1)+' / '+MISSIONS[state.mission].name.toUpperCase();
    document.querySelector('.scene-label span').textContent='SECTOR 0'+(state.mission+1)+' / '+['THE SHALLOW END','THE BUBBLE BANK','THE PLUGHOLE'][state.mission];
    $('sonar-time').textContent=state.player.sonar>0?Math.ceil(state.player.sonar)+'s':'READY';
  }
  function gamepad(){
    const pads=navigator.getGamepads?navigator.getGamepads():[];const pad=Array.from(pads).find(p=>p&&p.connected);
    $('pad-status').textContent=pad?'● GAMEPAD CONNECTED':'○ GAMEPAD READY TO CONNECT';
    if(!pad){padPause=false;padMenuFire=false;return {x:0,y:0,fire:false,sonar:false};}
    const pressed=i=>!!pad.buttons[i]?.pressed,dead=v=>Math.abs(v||0)>.22?v:0;
    const start=pressed(9);if(start&&!padPause&&screen==='playing')pause();padPause=start;
    const fire=pressed(0)||pressed(2);
    if(screen==='menu'){
      if(pressed(14))selectRole('boat');else if(pressed(15))selectRole('sub');
      if(fire&&!padMenuFire)launch();
    }else if(screen==='result'&&fire&&!padMenuFire)launch();
    padMenuFire=fire;
    return {x:(pressed(15)?1:0)-(pressed(14)?1:0)||dead(pad.axes[0]),y:(pressed(13)?1:0)-(pressed(12)?1:0)||dead(pad.axes[1]),fire,sonar:pressed(1)||pressed(3)};
  }
  function input(pad){
    const has=(...names)=>names.some(k=>keys.has(k)||touch.has(k));
    return {x:SubHunt.clamp((has('ArrowRight','KeyD','right')?1:0)-(has('ArrowLeft','KeyA','left')?1:0)+pad.x,-1,1),
      y:SubHunt.clamp((has('ArrowDown','KeyS','down')?1:0)-(has('ArrowUp','KeyW','up')?1:0)+pad.y,-1,1),fire:has('Space','fire')||pad.fire,sonar:has('KeyE','sonar')||pad.sonar};
  }
  const gameplayKeys=['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','Space','KeyE'];
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'||e.code==='KeyP'){if(!e.repeat)pause();return;}
    if(screen==='playing'&&!paused&&gameplayKeys.includes(e.code)){e.preventDefault();keys.add(e.code);unlockAudio();}
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{clearInput();if(screen==='playing')pause(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(screen==='playing')pause(true);}});
  $('role-boat').addEventListener('click',()=>selectRole('boat'));$('role-sub').addEventListener('click',()=>selectRole('sub'));
  $('launch').addEventListener('click',launch);$('again').addEventListener('click',launch);$('change-role').addEventListener('click',menu);$('pause-menu').addEventListener('click',menu);
  $('pause').addEventListener('click',()=>pause());$('resume').addEventListener('click',()=>pause(false));
  $('sound').addEventListener('click',()=>{sound=!sound;updateSound();unlockAudio();tone(500);});
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await (matchMedia('(pointer:coarse)').matches?document.documentElement:document.querySelector('.console')).requestFullscreen();}catch{toast('Fullscreen is unavailable in this browser.');}});
  for(const b of document.querySelectorAll('[data-control]')){
    const down=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.add(b.dataset.control);b.classList.add('pressed');unlockAudio();};
    const up=()=>{touch.delete(b.dataset.control);b.classList.remove('pressed');};
    b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up);
  }
  function frame(now){
    const dt=Math.min((now-(last||now))/1000,.1);last=now;const pad=gamepad();
    if(!paused){visualTime+=dt;if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').classList.remove('visible');}}
    if(screen==='playing'&&!paused){accumulator+=dt;const controls=input(pad);while(accumulator>=STEP&&state.status==='playing'){step(state,controls);events();accumulator-=STEP;}if(state.status!=='playing')finish();hud();}
    draw.draw(state,visualTime,paused?0:dt);requestAnimationFrame(frame);
  }
  // A read-only snapshot is useful for bug reports and browser regression checks.
  Object.defineProperty(window,'subhunt',{value:Object.freeze({snapshot:()=>JSON.parse(JSON.stringify({screen,paused,role,state}))})});
  if(location.protocol!=='file:'&&'serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  hud();requestAnimationFrame(frame);
})();
