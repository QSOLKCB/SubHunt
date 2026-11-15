/* SPDX-License-Identifier: Apache-2.0 */
(function (root) {
  'use strict';
  const WIDTH = 1000, HEIGHT = 580, SURFACE = 128, FLOOR = 514, STEP = 1 / 60;
  const MISSIONS = [
    { name: 'Rubber duck reconnaissance', count: 3, speed: 54, interval: 3.4 },
    { name: 'Trouble in the bubble bank', count: 4, speed: 70, interval: 2.8 },
    { name: 'Operation: pull the plug', count: 5, speed: 88, interval: 2.3 }
  ];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function random(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
  function event(s, type, x, y, text = '') { s.events.push({ type, x, y, text }); }
  function round(s) {
    const m = MISSIONS[s.mission];
    s.timeLeft = 95; s.projectiles = []; s.enemies = []; s.ducks = [{x: 300, y: SURFACE, r: 25}, {x: 735, y: SURFACE, r: 23}];
    s.player.x = 500; s.player.y = s.role === 'boat' ? SURFACE : 370;
    s.player.cooldown = 0; s.player.sonar = 0; s.player.invincible = 2;
    for (let i = 0; i < m.count; i++) s.enemies.push({
      id: s.nextId++, x: 100 + random(s) * 800,
      y: s.role === 'boat' ? 220 + i * 56 : SURFACE,
      vx: (i % 2 ? -1 : 1) * m.speed, hp: s.mission === 2 ? 2 : 1,
      cooldown: 1.5 + i * 0.85, reveal: 2, flash: 0
    });
    event(s, 'mission', 500, 270, m.name);
  }
  function create(role = 'boat', seed = 0x5ab2026) {
    if (!['boat', 'sub'].includes(role)) throw new TypeError('Choose boat or sub');
    const s = { role, seed: seed >>> 0, tick: 0, elapsed: 0, status: 'playing', mission: 0, score: 0,
      nextId: 1, kills: 0, events: [], particles: [], pulse: null, transition: 0,
      player: { x: 500, y: SURFACE, hp: 5, cooldown: 0, sonar: 0, invincible: 0 } };
    round(s); return s;
  }
  function fire(s, actor, friendly) {
    const down = friendly ? s.role === 'boat' : s.role === 'sub';
    s.projectiles.push({ id: s.nextId++, x: actor.x, y: actor.y + (down ? 20 : -18),
      vx: 0, vy: down ? 150 : -190, friendly, down, age: 0 });
    event(s, friendly ? 'fire' : 'enemyFire', actor.x, actor.y);
  }
  function step(s, input = {}) {
    if (s.status !== 'playing') return s;
    s.events = [];
    const dt = STEP, p = s.player;
    s.tick++; s.elapsed += dt;
    p.cooldown = Math.max(0, p.cooldown - dt); p.sonar = Math.max(0, p.sonar - dt);
    p.invincible = Math.max(0, p.invincible - dt);
    if (s.transition > 0) {
      s.transition -= dt;
      if (s.transition <= 0) { s.transition = 0; s.mission++; p.hp = Math.min(5, p.hp + 1); round(s); }
      return s;
    }
    const axis = n => Number.isFinite(n) ? clamp(n, -1, 1) : 0;
    p.x = clamp(p.x + axis(input.x) * 205 * dt, 65, 935);
    if (s.role === 'sub') p.y = clamp(p.y + axis(input.y) * 155 * dt, 210, FLOOR - 30);
    // The drain current is a physical hazard only in the final mission.
    if (s.mission === 2 && s.role === 'sub' && p.x > 770 && p.y > 385) p.x = clamp(p.x + 28 * dt, 65, 935);
    if (input.fire && p.cooldown === 0) { fire(s, p, true); p.cooldown = s.role === 'boat' ? 0.48 : 0.42; }
    if (input.sonar && p.sonar === 0) {
      p.sonar = 7; s.pulse = {x: p.x, y: p.y, age: 0};
      s.enemies.forEach(e => {e.reveal = 4;}); event(s, 'sonar', p.x, p.y);
    }
    if (s.pulse) { s.pulse.age += dt; if (s.pulse.age > 1.2) s.pulse = null; }
    for (const e of s.enemies) {
      e.x += e.vx * dt;
      if (e.x < 65 || e.x > 935) {e.x = clamp(e.x, 65, 935); e.vx *= -1;}
      e.reveal = Math.max(0, e.reveal - dt); e.flash = Math.max(0, e.flash - dt);
      e.cooldown -= dt;
      if (e.cooldown <= 0) {
        fire(s, e, false); e.reveal = 2.5;
        e.cooldown = MISSIONS[s.mission].interval + random(s) * 1.3;
      }
    }
    const survivors = [];
    for (const q of s.projectiles) {
      q.age += dt; q.y += q.vy * dt;
      if (s.mission === 2 && q.y > 385 && q.x > 770) q.x += 28 * dt;
      if (q.y < SURFACE - 20 || q.y > FLOOR) {event(s, 'splash', q.x, clamp(q.y, SURFACE, FLOOR)); continue;}
      // Floating ducks shield boats, so aim through the gaps.
      if (!q.down && q.y < SURFACE + 32 && s.ducks.some(d => Math.abs(d.x - q.x) < d.r)) {
        event(s, 'duck', q.x, SURFACE, 'QUACK!'); continue;
      }
      if (!q.friendly && s.pulse && Math.hypot(q.x - s.pulse.x, q.y - s.pulse.y) < s.pulse.age * 290) {
        event(s, 'splash', q.x, q.y); continue;
      }
      if (q.friendly) {
        const e = s.enemies.find(e => e.hp > 0 && Math.abs(e.x - q.x) < 36 && Math.abs(e.y - q.y) < 23);
        if (e) {
          e.hp--; e.flash = 0.2; e.reveal = 4;
          if (e.hp <= 0) {s.score += 150 + s.mission * 50; s.kills++; event(s, 'sink', e.x, e.y, '+ ' + (150 + s.mission * 50));}
          else event(s, 'hit', e.x, e.y);
          continue;
        }
      } else if (Math.abs(p.x - q.x) < 32 && Math.abs(p.y - q.y) < 23) {
        if (p.invincible === 0) {p.hp--; p.invincible = 1.4; event(s, 'damage', p.x, p.y, 'HULL HIT');}
        continue;
      }
      survivors.push(q);
    }
    s.projectiles = survivors; s.enemies = s.enemies.filter(e => e.hp > 0);
    s.timeLeft = Math.max(0, s.timeLeft - dt);
    if (p.hp <= 0 || s.timeLeft <= 0) {s.status = 'lost'; event(s, 'lost', p.x, p.y);}
    else if (!s.enemies.length) {
      s.score += Math.ceil(s.timeLeft) * 5;
      if (s.mission === MISSIONS.length - 1) {s.status = 'won'; event(s, 'won', p.x, p.y);}
      else {s.transition = 2.5; event(s, 'clear', p.x, p.y, 'BATH SECTOR CLEAR');}
    }
    return s;
  }
  root.SubHunt = Object.freeze({ create, step, STEP, WIDTH, HEIGHT, SURFACE, FLOOR, MISSIONS, clamp });
})(typeof window === 'undefined' ? globalThis : window);
