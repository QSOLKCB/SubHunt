/* SPDX-License-Identifier: Apache-2.0 */
(function (root) {
  'use strict';
  const ACTIONS = ['fire','sonar','pause','menu','restart'];
  const DIRECTIONS = ['left','right','up','down'];
  const STEPS = [
    ...ACTIONS.map((key, i) => ({key, type:'button', label:['A / FIRE','B / SONAR','START / PAUSE','SELECT / MENU','X / RESTART'][i]})),
    ...DIRECTIONS.map(key => ({key, type:'direction', label:'D-PAD ' + key.toUpperCase()}))
  ];
  const axis = (index, value, button) => ({kind:'axis', index, value, neutral:0, button});
  const DEFAULT = {version:1, buttons:{fire:0, sonar:1, pause:9, menu:8, restart:2}, directions:{
    left:axis(0,-1,14), right:axis(0,1,15), up:axis(1,-1,12), down:axis(1,1,13)
  }};
  const freshDefault = () => JSON.parse(JSON.stringify(DEFAULT));
  const finite = n => Number.isFinite(n) && Math.abs(n) <= 16;
  const index = (n, max) => Number.isInteger(n) && n >= 0 && n < max;
  function valid(profile) {
    if (profile?.version !== 1 || !profile.buttons || !profile.directions) return false;
    const used = new Set();
    for (const key of ACTIONS) {
      const n = profile.buttons[key];
      if (!index(n,128) || used.has(n)) return false;
      used.add(n);
    }
    const bindings = new Set();
    for (const key of DIRECTIONS) {
      const b = profile.directions[key];
      if (!b || !index(b.index, b.kind === 'button' ? 128 : 32)) return false;
      if (b.kind === 'button') { if (used.has(b.index)) return false; used.add(b.index); }
      else if (b.kind !== 'axis' || !finite(b.value) || !finite(b.neutral) || Math.abs(b.value - b.neutral) < .3) return false;
      if (b.kind === 'axis' && b.button !== undefined) {
        if (!index(b.button,128) || used.has(b.button)) return false;
        used.add(b.button);
      }
      const identity = b.kind + ':' + b.index + ':' + (b.kind === 'axis' ? b.value : '');
      if (bindings.has(identity)) return false;
      bindings.add(identity);
    }
    return true;
  }
  function capture(pad, baseline) {
    const buttons = Array.from(pad.buttons).map((b,i) => b.pressed ? i : -1).filter(i => i >= 0);
    if (buttons.length === 1) return {kind:'button', index:buttons[0]};
    if (buttons.length > 1) return null;
    const changed = Array.from(pad.axes).map((value,i) => ({kind:'axis', index:i, value, neutral:baseline[i]}))
      .filter(b => finite(b.value) && finite(b.neutral) && Math.abs(b.value - b.neutral) >= .5);
    return changed.length === 1 ? changed[0] : null;
  }
  function released(pad, baseline) {
    return !Array.from(pad.buttons).some(b => b.pressed) && Array.from(pad.axes).every((v,i) => finite(v) && Math.abs(v - baseline[i]) < .15);
  }
  function read(pad, profile=DEFAULT) {
    const result = {x:0, y:0, fire:false, sonar:false, pause:false, menu:false, restart:false};
    if (!pad?.connected) return result;
    for (const key of ACTIONS) result[key] = !!pad.buttons[profile.buttons[key]]?.pressed;
    const active = {};
    for (const key of DIRECTIONS) {
      const b = profile.directions[key];
      if (b.kind === 'button') { active[key] = pad.buttons[b.index]?.pressed ? 1 : 0; continue; }
      const value = pad.axes[b.index];
      if (b.button !== undefined && pad.buttons[b.button]?.pressed) { active[key] = 1; continue; }
      if (!finite(value)) { active[key] = 0; continue; }
      const sameAxis = DIRECTIONS.map(d => profile.directions[d]).filter(d => d.kind === 'axis' && d.index === b.index);
      if (sameAxis.length > 2) {
        // Some raw adapters expose the entire hat on one axis. Four equally spaced
        // learned cardinal values also let us recognise the intervening diagonals.
        const values = [...new Set(sameAxis.map(d => d.value))].sort((a,b) => a-b);
        const spacing = values[1] - values[0];
        const circular = values.length === 4 && values.slice(1).every((v,i) => Math.abs(v-values[i]-spacing) < .03);
        const period = spacing * 4;
        let distance = Math.abs(value - b.value);
        if (circular) { distance %= period; distance = Math.min(distance, period - distance); }
        active[key] = Math.abs(value - b.neutral) < .15 ? 0 : distance <= (circular ? spacing/2 + .02 : .12) ? 1 : 0;
      } else {
        const strength = (value - b.neutral) / (b.value - b.neutral);
        active[key] = strength > .22 ? Math.min(1, strength) : 0;
      }
    }
    result.x = active.right - active.left; result.y = active.down - active.up;
    return result;
  }
  root.SubHuntController = Object.freeze({ACTIONS, DIRECTIONS, STEPS, freshDefault, valid, capture, released, read});
})(typeof window === 'undefined' ? globalThis : window);
