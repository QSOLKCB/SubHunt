/* SPDX-License-Identifier: Apache-2.0 */
(function(root) {
  'use strict';
  const RATE=48000, SAMPLES_PER_TICK=800;
  const THEMES=Object.freeze([
    Object.freeze({name:'Porcelain Patrol', stepTicks:15, roots:[110,131,87,98], melody:[0,2,4,2,1,3,4,2,0,2,3,4,2,1,3,2]}),
    Object.freeze({name:'Bubble Bank Boogie', stepTicks:12, roots:[131,98,110,87], melody:[0,4,2,3,1,4,2,0,3,2,4,1,2,4,3,1]}),
    Object.freeze({name:'The Last Plug', stepTicks:10, roots:[110,87,98,82], melody:[0,0,4,2,3,2,1,4,0,2,4,3,2,1,3,4]})
  ]);
  function integer(n,min,max,name) { if(!Number.isSafeInteger(n)||n<min||n>max) throw new RangeError(name); return n; }
  function position(mission,tick) {
    integer(mission,0,2,'mission'); integer(tick,0,Number.MAX_SAFE_INTEGER,'tick');
    const barTicks=THEMES[mission].stepTicks*16, bar=Math.floor(tick/barTicks);
    return {mission,bar,phrase:bar%4,barTicks,offsetSamples:(tick%barTicks)*SAMPLES_PER_TICK};
  }
  // Four original instrument lanes. All pitches, envelopes, offsets and noise seeds
  // are integers; no clock, ambient PRNG or gameplay random stream enters a score.
  function score(mission,phrase) {
    integer(mission,0,2,'mission'); integer(phrase,0,3,'phrase');
    const theme=THEMES[mission], step=theme.stepTicks*SAMPLES_PER_TICK, events=[];
    const rootHz=theme.roots[phrase], palette=[rootHz*2,Math.floor(rootHz*12/5),Math.floor(rootHz*8/3),rootHz*3,Math.floor(rootHz*18/5)];
    const add=(sample,duration,channel,frequency,gain,wave,seed=0)=>events.push({id:events.length+1,sample,duration,channel,frequency,gain,wave,seed});
    for(let i=0;i<16;i++) {
      const at=i*step;
      add(at,step-400,0,i%4===3?Math.floor(rootHz*3/2):rootHz,3600,'triangle');
      // A rest at the end leaves room for the next chord, rather than an endless arpeggio.
      if(i!==15) add(at,Math.floor(step*3/4),1,palette[theme.melody[(i+phrase*2)%16]],1600,mission===2?'square':'triangle');
      if(i%4===0) add(at,step*3,2,palette[(phrase+i/4)%5],1100,'saw');
      add(at,i%4===0?Math.floor(step/2):Math.floor(step/4),3,i%4===0?55:1800,i%4===0?4200:1000,i%4===0?'triangle':'noise',0x5ab000+mission*256+phrase*16+i);
    }
    return {frames:step*16,events};
  }
  function render(mission,phrase) { return root.SubHuntAudio2D.createSound2D(score(mission,phrase)); }
  function wav(mission) {
    const parts=Array.from({length:4},(_,i)=>render(mission,i).renderAll());
    const frames=parts.reduce((n,p)=>n+p.length,0), bytes=new Uint8Array(44+frames*2), view=new DataView(bytes.buffer);
    const ascii=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
    ascii(0,'RIFF');view.setUint32(4,36+frames*2,true);ascii(8,'WAVE');ascii(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,RATE,true);
    view.setUint32(28,RATE*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,frames*2,true);
    let at=44; for(const part of parts)for(const sample of part){view.setInt16(at,sample,true);at+=2;}
    return bytes;
  }
  // Web Audio presents already-rendered PCM. It never chooses notes or advances combat.
  function player(context) {
    const cache=new Map(), voices=new Set();
    let anchor=null,nextBar=0,started=0,resyncs=0,lastPosition=null;
    function stop() {for(const v of voices){v.onended=null;v.stop();v.disconnect();}voices.clear();anchor=null;}
    function buffer(mission,phrase) {
      const key=mission+':'+phrase;
      if(!cache.has(key)) {
        const pcm=render(mission,phrase).renderAll(), b=context.createBuffer(1,pcm.length,RATE), floats=b.getChannelData(0);
        for(let i=0;i<pcm.length;i++) floats[i]=pcm[i]/32768;
        cache.set(key,b);
      }
      return cache.get(key);
    }
    function schedule(b,when,offset) {
      const v=context.createBufferSource();v.buffer=b;v.connect(context.destination);voices.add(v);
      v.onended=()=>{voices.delete(v);v.disconnect();};v.start(when,offset);started++;
    }
    function sync(state,enabled) {
      if(!enabled||context.state!=='running'||state.status!=='playing'||state.transition>0) {stop();return;}
      const pos=position(state.mission,state.sectorTick);lastPosition=pos;
      if(anchor && (anchor.mission!==state.mission || Math.abs((state.sectorTick-anchor.tick)/60-(context.currentTime-anchor.time))>.12)) {stop();resyncs++;}
      if(!anchor) {
        const b=buffer(pos.mission,pos.phrase);
        anchor={mission:pos.mission,tick:state.sectorTick,time:context.currentTime+.025};
        schedule(b,anchor.time,pos.offsetSamples/RATE); nextBar=pos.bar+1;
      }
      // Render/schedule the next phrase half a simulation second ahead for a gapless boundary.
      if(nextBar*pos.barTicks-state.sectorTick<=30) {
        const b=buffer(pos.mission,nextBar%4);
        schedule(b,anchor.time+(nextBar*pos.barTicks-anchor.tick)/60,0);nextBar++;
      }
    }
    return Object.freeze({sync,stop,snapshot:()=>({active:!!anchor,voices:voices.size,started,resyncs,position:lastPosition})});
  }
  root.SubHuntMusic=Object.freeze({THEMES,RATE,SAMPLES_PER_TICK,position,score,render,wav,player});
})(typeof window==='undefined'?globalThis:window);
