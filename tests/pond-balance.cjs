/* SPDX-License-Identifier: Apache-2.0 */
const {test}=require('node:test'),assert=require('node:assert/strict');
require('../js/sim.js');
const {create,step,clamp}=SubHunt;
test('input-only pilot can complete Pond Panic for every vessel and difficulty',t=>{
  // This pilot reads targets but changes the game ONLY through step(input).
  // It is a reachability experiment, not evidence of human difficulty or enjoyment.
  for(const role of ['boat','sub'])for(const difficulty of ['cadet','standard','admiral']) {
    let wins=0;
    for(let seed=1;seed<=20;seed++) {
      const s=create(role,seed,difficulty,'pond');let targetId=null;
      while(s.status==='playing' && s.tick<24000) {
        let target=s.targets.find(target=>target.id===targetId);
        const cost=target=>Math.abs(target.x-s.player.x)/205+(role==='sub'?Math.abs(target.y+45-s.player.y)/155:0);
        if(!target){target=s.targets.slice().sort((a,b)=>cost(a)-cost(b))[0];targetId=target?.id;}
        if(!target){step(s);continue;}
        const depth=role==='sub'?clamp(target.y+60,210,484):128;
        const flight=Math.abs(target.y-s.player.y)/(role==='boat'?150:190);
        const aim=clamp(target.x+target.vx*flight,80,920);
        step(s,{x:clamp((aim-s.player.x)/15,-1,1),y:clamp((depth-s.player.y)/15,-1,1),fire:true,sonar:true});
      }
      if(s.status==='won')wins++;
      assert.notEqual(s.status,'playing','pilot must terminate within its tick budget');
    }
    assert.ok(wins>0,role+' '+difficulty+' must be completable with ordinary controls');
    t.diagnostic(role+' '+difficulty+': '+wins+'/20 complete campaigns');
  }
});
