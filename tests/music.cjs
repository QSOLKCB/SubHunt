/* SPDX-License-Identifier: Apache-2.0 */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
require('../vendor/vanillajs/audio2d.js');require('../js/music.js');require('../js/sim.js');
const M=SubHuntMusic,hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hashes=['c764fe7f498ac40bb6dbb2856cbb906f021817736db4798bb7ecb2cad6834a3a','0f001c0ebe874adc3960d41867c177db62f1816eb41f5ff4753d70b7a90d080d','c5437b0634a46f90d3d4b4cd7e85a7951796310621b146df59e408b3f3c2c042'];
test('vendored source matches upstream Git blob and the wrapper changes exports only',()=>{
  const source=fs.readFileSync(require.resolve('../vendor/vanillajs/audio2d.source.mjs'),'utf8');
  const provenance=require('../vendor/vanillajs/PROVENANCE.json');
  assert.equal(hash(source),provenance.sourceSHA256);
  assert.equal(crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex'),provenance.blob);
  const wrapper=fs.readFileSync(require.resolve('../vendor/vanillajs/audio2d.js'),'utf8');
  assert.equal(wrapper,"// Classic-script adapter for direct file:// play; see PROVENANCE.json.\n(function(root) {\n'use strict';\n"+source.replaceAll('export const ','const ').replaceAll('export function ','function ')+"\nroot.SubHuntAudio2D=Object.freeze({AUDIO2D_RATE,createSound2D});\n})(typeof window==='undefined'?globalThis:window);\n");
});
test('three complete sector WAVs have frozen PCM hashes and a correct WAV header',()=>{
  for(let mission=0;mission<3;mission++){
    const bytes=M.wav(mission),v=new DataView(bytes.buffer);assert.equal(hash(bytes),hashes[mission]);
    assert.equal(v.getUint32(24,true),48000);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),16);
    assert.equal(v.getUint32(40,true),bytes.length-44);assert.equal(v.getUint32(4,true),bytes.length-8);
    assert.equal(bytes.length,44+M.THEMES[mission].stepTicks*16*800*4*2);
  }
});
test('every phrase renders identically in chunks; channels never overlap and signals are bounded',()=>{
  for(let mission=0;mission<3;mission++)for(let phrase=0;phrase<4;phrase++){
    const sound=M.render(mission,phrase),whole=sound.renderAll(),chunks=new Int16Array(whole.length);
    for(let start=0;start<whole.length;start+=7777)chunks.set(sound.renderRange(start,Math.min(7777,whole.length-start)),start);
    assert.deepEqual(whole,chunks);assert.ok(whole.some(n=>n!==0));assert.ok(whole.every(n=>Math.abs(n)<32767));
    assert.equal(new Set(sound.eventSummary().map(e=>e.channel)).size,4);
  }
});
test('tick positions land on exact sample boundaries and music cannot consume gameplay randomness',()=>{
  for(let mission=0;mission<3;mission++){
    const ticks=M.THEMES[mission].stepTicks*16;
    assert.equal(M.position(mission,ticks-1).offsetSamples,(ticks-1)*800);
    assert.deepEqual(M.position(mission,ticks),{mission,bar:1,phrase:1,barTicks:ticks,offsetSamples:0});
    assert.equal(M.position(mission,ticks*4).phrase,0);
  }
  const a=SubHunt.create('boat',7),b=SubHunt.create('boat',7);
  for(let i=0;i<300;i++){SubHunt.step(a,{fire:true});SubHunt.step(b,{fire:true});M.position(a.mission,a.sectorTick);if(i%60===0)M.render(a.mission,i%4).renderAll();}
  assert.deepEqual(a,b);assert.throws(()=>M.score(3,0));assert.throws(()=>M.position(0,-1));
});
function fakeAudio(){
  const sources=[];
  return {state:'running',currentTime:0,destination:{},sources,createBuffer:(channels,n,rate)=>({getChannelData:()=>new Float32Array(n),length:n,sampleRate:rate}),
    createBufferSource(){const s={connect(){},disconnect(){this.disconnected=true;},start(time,offset){this.time=time;this.offset=offset;},stop(){this.stopped=true;}};sources.push(s);return s;}};
}
test('playback resumes at the frozen tick, queues a gapless phrase and cancels all voices',()=>{
  const ctx=fakeAudio(),p=M.player(ctx),s=SubHunt.create();s.sectorTick=120;
  p.sync(s,true);assert.equal(ctx.sources[0].offset,2);assert.equal(p.snapshot().voices,1);
  ctx.currentTime=1.525;s.sectorTick=210;p.sync(s,true);
  assert.equal(ctx.sources[1].time,2.025);assert.equal(ctx.sources[1].offset,0);
  p.stop();assert.ok(ctx.sources.every(v=>v.stopped&&v.disconnected));assert.equal(p.snapshot().voices,0);
  ctx.currentTime=10;const before=ctx.sources.length;p.sync(s,true);assert.equal(ctx.sources[before].offset,3.5);
  p.sync(s,false);assert.equal(p.snapshot().active,false);
  p.sync(s,true);s.status='won';p.sync(s,true);assert.equal(p.snapshot().voices,0);
});
test('transition, suspended device, mission changes and stalled presentation never keep stale music',()=>{
  const ctx=fakeAudio(),p=M.player(ctx),s=SubHunt.create();p.sync(s,true);s.transition=1;p.sync(s,true);assert.equal(p.snapshot().active,false);
  s.transition=0;s.mission=1;s.sectorTick=0;p.sync(s,true);assert.equal(p.snapshot().position.mission,1);
  ctx.currentTime=5;p.sync(s,true);assert.equal(p.snapshot().resyncs,1);assert.ok(ctx.sources.at(-2).stopped);
  ctx.state='suspended';p.sync(s,true);assert.equal(p.snapshot().voices,0);
});
