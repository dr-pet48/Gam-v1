// AI traffic: Kenyan left-hand traffic with car-following (IDM), lane
// changes on dual carriageways and overtaking through the oncoming lane on
// single carriageways.
import * as THREE from 'three';
import { VEHICLES, TRAFFIC_MIX } from './data/vehicles.js';
import { buildVehicle } from './models.js';
import { BIOME_NAMES, LANE_W } from './route.js';

const SPEC = Object.fromEntries(VEHICLES.map((v) => [v.id, v]));
// cruise speeds (km/h) by type: [min, max]
const CRUISE = {
  sedan: [85, 115], safari: [80, 105], pickup: [75, 105], matatu: [80, 100], bus: [75, 85],
  truck: [50, 72], tanker: [50, 70], tuktuk: [35, 50], boda: [45, 75],
};
const KMH = 1 / 3.6;

export class Traffic {
  constructor(scene, route, density = 1) {
    this.scene = scene;
    this.route = route;
    this.density = density;
    this.cars = [];
    this.pool = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.onCollision = null;
    this.tmp = {};
  }

  setDensity(d) {
    this.density = d;
  }

  #getMesh(type) {
    const list = this.pool.get(type);
    if (list && list.length) return list.pop();
    return buildVehicle(type, { seed: (Math.random() * 1e9) | 0 });
  }

  #release(car) {
    car.released = true;
    this.group.remove(car.mesh);
    if (!this.pool.has(car.type)) this.pool.set(car.type, []);
    this.pool.get(car.type).push(car.mesh);
  }

  #pickType(s) {
    const r = this.route;
    const b = BIOME_NAMES[r.biome[r.idx(s)]];
    const mix = TRAFFIC_MIX[r.town[r.idx(s)] > 0.5 ? 'urban' : b];
    let total = 0;
    for (const k in mix) total += mix[k];
    let x = Math.random() * total;
    for (const k in mix) {
      x -= mix[k];
      if (x <= 0) return k;
    }
    return 'sedan';
  }

  #spawn(s, dir) {
    const r = this.route;
    if (s < 20 || s > r.length - 20) return null;
    const type = this.#pickType(s);
    const spec = SPEC[type];
    const lanes = r.lanes[r.idx(s)];
    const lane = type === 'truck' || type === 'tanker' || type === 'tuktuk' || type === 'boda' ? 0 : Math.floor(Math.random() * lanes);
    const d = r.laneCenter(s, dir, lane) + (type === 'boda' ? -dir * 1.0 : 0);
    // keep a safe gap from existing cars in the same lane
    for (const c of this.cars) {
      if (c.dir === dir && Math.abs(c.d - d) < 2.5 && Math.abs(c.s - s) < 30) return null;
    }
    const [lo, hi] = CRUISE[type];
    const limit = r.limit[r.idx(s)];
    const cruise = (lo + Math.random() * (hi - lo)) * KMH;
    const car = {
      type, spec, dir, lane, s, d, targetD: d,
      len: spec.length, wid: spec.width,
      cruise,
      v: Math.min(cruise, limit * KMH * 1.1) * (0.8 + Math.random() * 0.2),
      overtaking: 0, overtakeTarget: null, laneTimer: 0,
      mesh: this.#getMesh(type),
      trailerYaw: null, yaw: 0, wheelSpin: 0,
      aggressive: type === 'matatu' || (type === 'sedan' && Math.random() < 0.3),
    };
    this.group.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  clear() {
    for (const c of this.cars) this.#release(c);
    this.cars.length = 0;
  }

  /** Populate the window around the player at start. */
  populate(ps) {
    this.clear();
    const n = Math.round(30 * this.density);
    for (let k = 0; k < n * 3 && this.cars.length < n; k++) {
      const s = ps + -300 + Math.random() * 1700;
      if (Math.abs(s - ps) < 40) continue;
      this.#spawn(s, Math.random() < 0.5 ? 1 : -1);
    }
  }

  update(dt, player) {
    const r = this.route;
    const ps = player.s;
    const target = Math.round(30 * this.density);
    const ahead = 1500, behind = 380;

    // recycle cars that left the window
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const c = this.cars[k];
      if (c.s < ps - behind - 40 || c.s > ps + ahead + 60 || c.s <= 5 || c.s >= r.length - 5) {
        this.#release(c);
        this.cars.splice(k, 1);
      }
    }
    // spawn at the edges of the window
    let tries = 0;
    while (this.cars.length < target && tries++ < 4) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      // oncoming traffic appears far ahead; same-direction traffic ahead (slower) or behind (faster)
      let s;
      if (dir < 0) s = ps + ahead - Math.random() * 200;
      else s = Math.random() < 0.7 ? ps + ahead - Math.random() * 300 : ps - behind + Math.random() * 60;
      this.#spawn(s, dir);
    }

    const cars = this.cars;
    // player expressed as an obstacle in (s, d) space
    const pv = player.speed * player.alongRoad;
    const P = { s: ps, d: player.d, v: Math.abs(pv), dirOf: pv >= 0 ? 1 : -1, len: player.spec.length, wid: player.spec.width, isPlayer: true };

    for (const c of cars) {
      const i = r.idx(c.s);
      const lanes = r.lanes[i];
      const limit = r.limit[i] * KMH;
      const curv = Math.abs(r.curv[Math.min(r.N - 1, i + Math.round((c.dir * 30) / 4))] || 0);
      let v0 = Math.min(c.cruise, limit * (c.aggressive ? 1.18 : 1.05));
      if (curv > 0.003) v0 = Math.min(v0, Math.sqrt(3.2 / curv));
      if (c.spec.governor) v0 = Math.min(v0, c.spec.governor * KMH);

      // find leader in my path
      let lead = null;
      let gap = Infinity;
      const consider = (o) => {
        if (o === c) return;
        const ahead = (o.s - c.s) * c.dir;
        if (ahead <= 0) return;
        if (Math.abs(o.d - c.d) > (o.wid + c.wid) / 2 + 0.6) return;
        const g = ahead - (o.len + c.len) / 2;
        if (g < gap) {
          gap = g;
          lead = o;
        }
      };
      for (const o of cars) consider(o);
      consider(P);

      // IDM acceleration
      const aMax = c.spec.accel * 0.9;
      const b = 3;
      let leadV = 0;
      if (lead) leadV = lead.isPlayer ? (lead.dirOf === c.dir ? lead.v : -lead.v) : lead.dir === c.dir ? lead.v : -lead.v;
      let acc = aMax * (1 - Math.pow(c.v / Math.max(1, v0), 4));
      if (lead) {
        const dv = c.v - leadV;
        const sStar = 3 + c.v * 1.4 + (c.v * dv) / (2 * Math.sqrt(aMax * b));
        acc -= aMax * Math.pow(Math.max(0, sStar) / Math.max(0.5, gap), 2);
      }
      acc = Math.max(-9, acc);
      c.v = Math.max(0, c.v + acc * dt);

      // --- lane logic
      c.laneTimer -= dt;
      const slowLead = lead && !lead.isPlayer && lead.dir === c.dir && leadV < v0 - 3 && gap < 45;
      const slowPlayer = lead && lead.isPlayer && leadV < v0 - 4 && gap < 45;
      if (lanes > 1 && c.dir !== 0) {
        // dual carriageway: move right to overtake, return left when clear
        if ((slowLead || slowPlayer) && c.lane < lanes - 1 && c.laneTimer <= 0) {
          if (this.#laneFree(c, c.lane + 1, 30, 50, P)) {
            c.lane++;
            c.laneTimer = 4;
          }
        } else if (c.lane > 0 && c.laneTimer <= 0 && !lead) {
          if (this.#laneFree(c, c.lane - 1, 25, 45, P)) {
            c.lane--;
            c.laneTimer = 5;
          }
        }
        c.lane = Math.min(c.lane, lanes - 1);
        c.overtaking = 0;
        c.targetD = r.laneCenter(c.s, c.dir, c.lane) + (c.type === 'boda' ? -c.dir * 1.0 : 0);
      } else {
        c.lane = 0;
        const home = r.laneCenter(c.s, c.dir, 0) + (c.type === 'boda' ? -c.dir * 1.0 : 0);
        if (c.overtaking) {
          const passed = !c.overtakeTarget || (c.s - c.overtakeTarget.s) * c.dir > (c.len + c.overtakeTarget.len) / 2 + 10;
          const danger = this.#oncomingWithin(c, 110, P);
          if (passed || danger || c.overtakeTarget.released) {
            c.overtaking = 0;
            c.overtakeTarget = null;
            c.laneTimer = 6;
          }
        } else if (slowLead && c.laneTimer <= 0 && v0 > leadV + 4 && curv < 0.0015 && !['truck', 'tanker', 'tuktuk'].includes(c.type)) {
          const need = 140 + c.v * 9;
          if (!this.#oncomingWithin(c, need, P) && Math.random() < (c.aggressive ? 0.5 : 0.15)) {
            c.overtaking = 1;
            c.overtakeTarget = lead;
            c.laneTimer = 2;
          } else c.laneTimer = 1.2;
        }
        c.targetD = c.overtaking ? -home : home;
        if (c.overtaking) {
          // ignore the vehicle being passed; just go
          c.v = Math.min(v0 * 1.12, c.v + aMax * 0.6 * dt);
        }
      }

      // lateral motion
      const latRate = 1.6 + c.v * 0.04;
      const dd = c.targetD - c.d;
      const step = Math.sign(dd) * Math.min(Math.abs(dd), latRate * dt);
      c.d += step;
      c.s += c.v * c.dir * dt;
      c.latV = step / Math.max(1e-3, dt);
    }

    // collisions with the player
    for (const c of cars) {
      const ds = c.s - P.s;
      const dd = c.d - P.d;
      if (Math.abs(ds) < (c.len + P.len) / 2 * 0.92 && Math.abs(dd) < (c.wid + P.wid) / 2 * 0.85) {
        if (c.hitCooldown > 0) continue;
        c.hitCooldown = 1.0;
        const m1 = player.spec.mass, m2 = c.spec.mass;
        const v1 = pv, v2 = c.v * c.dir;
        const e = 0.25;
        const v1n = (m1 * v1 + m2 * v2 - m2 * e * (v1 - v2)) / (m1 + m2);
        const v2n = (m1 * v1 + m2 * v2 + m1 * e * (v1 - v2)) / (m1 + m2);
        const impact = Math.abs(v1 - v1n);
        c.v = Math.max(0, v2n * c.dir);
        const ovS = ((c.len + P.len) / 2) * 0.92 - Math.abs(ds);
        const ovD = ((c.wid + P.wid) / 2) * 0.85 - Math.abs(dd);
        const longitudinal = ovS / (c.len + P.len) < ovD / (c.wid + P.wid);
        if (this.onCollision) this.onCollision({ car: c, impact, newAlong: v1n, side: Math.sign(dd) || 1, ds, push: longitudinal ? { s: -Math.sign(ds) * (ovS + 0.15), d: 0 } : { s: 0, d: -Math.sign(dd) * (ovD + 0.1) } });
      }
      if (c.hitCooldown > 0) c.hitCooldown -= dt;
    }

    this.#place(dt);
  }

  #laneFree(c, lane, back, front, P) {
    const r = this.route;
    const d = r.laneCenter(c.s, c.dir, lane);
    const check = (o) => {
      if (o === c) return true;
      if (Math.abs(o.d - d) > 2.4) return true;
      const rel = (o.s - c.s) * c.dir;
      return rel < -back || rel > front;
    };
    if (!check(P)) return false;
    for (const o of this.cars) if (!check(o)) return false;
    return true;
  }

  #oncomingWithin(c, dist, P) {
    const home = this.route.laneCenter(c.s, c.dir, 0);
    const opp = -home;
    const hit = (o, dir) => {
      const rel = (o.s - c.s) * c.dir;
      return rel > -5 && rel < dist && Math.abs(o.d - opp) < 2.8 && dir !== c.dir;
    };
    if (hit(P, P.dirOf) || (Math.abs(P.d - opp) < 2.8 && (P.s - c.s) * c.dir > -5 && (P.s - c.s) * c.dir < dist)) return true;
    for (const o of this.cars) if (o !== c && hit(o, o.dir)) return true;
    return false;
  }

  #place(dt) {
    const r = this.route;
    const fr = this.tmp;
    for (const c of this.cars) {
      r.frame(c.s, fr);
      const x = fr.x + fr.rx * c.d;
      const z = fr.z + fr.rz * c.d;
      const y = r.height(c.s, c.d);
      let yaw = Math.atan2(fr.tx * c.dir, fr.tz * c.dir);
      yaw += Math.atan2(-(c.latV || 0) * c.dir, Math.max(3, c.v)) * 1.0 * (c.dir > 0 ? 1 : 1);
      const m = c.mesh;
      m.position.set(x, y, z);
      m.rotation.order = 'YXZ';
      m.rotation.y = yaw;
      const pitch = r.pitch[r.idx(c.s)] * c.dir;
      m.rotation.x = -Math.atan(pitch);
      const ud = m.userData;
      for (const w of ud.wheels) w.rotation.x += (c.v * dt) / 0.4;
      if (ud.trailer) {
        if (c.trailerYaw === null) c.trailerYaw = yaw;
        const rel = yaw - c.trailerYaw;
        c.trailerYaw += (c.v / 9) * Math.sin(rel) * dt;
        ud.trailer.rotation.y = THREE.MathUtils.clamp(c.trailerYaw - yaw, -0.9, 0.9);
      }
      if (ud.lean) ud.lean.rotation.z = THREE.MathUtils.clamp((c.latV || 0) * 0.08 * c.dir, -0.3, 0.3);
    }
  }
}
