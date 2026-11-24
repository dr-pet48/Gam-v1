// Player vehicle dynamics: kinematic bicycle model with engine/brake/grade
// forces, automatic gearbox, suspension feel, speed governors, off-road drag.
import * as THREE from 'three';
import { buildVehicle } from './models.js';
import { SHOULDER } from './route.js';

const G = 9.81;

export class Player {
  constructor(scene, route, spec, s0) {
    this.scene = scene;
    this.route = route;
    this.spec = spec;
    this.mesh = buildVehicle(spec.id, { player: true, seed: 4242 });
    scene.add(this.mesh);
    this.governorOn = !!spec.governor;
    this.lightsOn = false;
    this.damage = 0;
    this.odometer = 0; // world metres
    this.reset(s0);
  }

  reset(s, keepSpeed = false) {
    const r = this.route;
    s = Math.max(10, Math.min(r.length - 10, s));
    const fr = r.frame(s);
    const d = r.laneCenter(s, 1, 0) + (this.spec.bike ? -0.8 : 0);
    this.x = fr.x + fr.rx * d;
    this.z = fr.z + fr.rz * d;
    this.yaw = Math.atan2(fr.tx, fr.tz);
    this.s = s;
    this.d = d;
    if (!keepSpeed) this.speed = 0;
    this.steer = 0;
    this.gear = 1;
    this.rpm = 0;
    this.y = r.height(s, d);
    this.vy = 0;
    this.suspY = 0;
    this.pitch = 0;
    this.roll = 0;
    this.trailerYaw = this.yaw;
    this.alongRoad = 1;
    this.offroad = false;
    this.bumpKick = 0;
    this.lastBumpS = -1;
    this.place(0);
  }

  get kmh() {
    return this.speed * 3.6;
  }

  update(dt, input) {
    const r = this.route;
    const sp = this.spec;
    const v = this.speed;
    const av = Math.abs(v);

    // --- steering (speed sensitive)
    const maxSteer = sp.steer / (1 + (av * av) / (sp.bike ? 900 : 650));
    const target = -input.steer * maxSteer;
    const rate = (input.steer === 0 ? 3.2 : 2.2) * (sp.bike ? 1.4 : 1);
    this.steer += THREE.MathUtils.clamp(target - this.steer, -rate * dt, rate * dt);

    // --- longitudinal forces
    let a = 0;
    const top = sp.topSpeed / 3.6;
    const gov = this.governorOn && sp.governor ? sp.governor / 3.6 : Infinity;
    // a badly damaged vehicle limps along
    const vmax = Math.min(top, gov) * (1 - Math.max(0, this.damage - 50) / 80);
    if (input.throttle > 0) {
      if (v >= -0.5) {
        const power = 1 - Math.pow(Math.max(0, v) / vmax, 2.2);
        a += sp.accel * input.throttle * Math.max(0, power) * (v < 3 ? 1.1 : 1);
      } else a += sp.brake * input.throttle; // braking out of reverse
    }
    if (input.brake > 0) {
      if (v > 0.5) a -= sp.brake * input.brake;
      else if (v > -15 / 3.6) a -= Math.min(2.2, sp.accel) * input.brake; // reverse
    }
    if (input.handbrake) a -= Math.sign(v) * Math.min(av / dt, sp.brake * 0.8);
    // aerodynamic + rolling resistance
    a -= Math.sign(v) * (0.00045 * v * v * (sp.category === 'heavy' ? 1.6 : 1) + 0.12);
    // grade
    const i = r.idx(this.s);
    const grade = r.pitch[i] * this.alongRoad;
    a -= G * grade * (sp.category === 'heavy' ? 1.15 : 0.9);
    // off-road resistance
    const hw = r.halfWidth(this.s) + SHOULDER;
    this.offroad = Math.abs(this.d) > hw + 0.3;
    if (this.offroad) a -= Math.sign(v) * (sp.offroad ? 0.5 : 1.3 + av * 0.03);
    // engine braking
    if (input.throttle === 0 && input.brake === 0) a -= Math.sign(v) * 0.35;

    let nv = v + a * dt;
    if (v > 0 && nv < 0 && input.brake > 0 && v > 0.5) nv = 0;
    if (Math.abs(nv) < 0.05 && input.throttle === 0 && input.brake === 0) nv = 0;
    if (nv > vmax) nv = Math.max(vmax, v - 2 * dt);
    this.speed = nv;

    // --- yaw (bicycle model) with grip limit
    const grip = (this.offroad ? 0.55 : 0.85) * (input.wet ? 0.75 : 1);
    let yawRate = (nv / sp.wheelbase) * Math.tan(this.steer);
    const latAcc = Math.abs(yawRate * nv);
    const maxLat = grip * G;
    this.sliding = latAcc > maxLat;
    if (this.sliding) yawRate *= maxLat / latAcc;
    if (input.handbrake && av > 5) yawRate *= 1.35;
    this.yaw += yawRate * dt;
    this.yawRate = yawRate;

    // --- integrate position
    this.x += Math.sin(this.yaw) * nv * dt;
    this.z += Math.cos(this.yaw) * nv * dt;
    const loc = r.locate(this.x, this.z, this.s);
    // keep inside the terrain strip
    const maxD = 300;
    if (Math.abs(loc.d) > maxD) {
      const fr = r.frame(loc.s);
      const dd = Math.sign(loc.d) * maxD;
      this.x = fr.x + fr.rx * dd;
      this.z = fr.z + fr.rz * dd;
      loc.d = dd;
      this.speed *= 0.9;
    }
    const outward = nv * (Math.sin(this.yaw) * r.tx[r.idx(loc.s)] + Math.cos(this.yaw) * r.tz[r.idx(loc.s)]);
    if ((loc.s >= r.length - 2 && outward > 0) || (loc.s <= 2 && outward < 0)) {
      this.speed = 0;
      this.atEnd = loc.s >= r.length - 2;
    }
    this.odometer += Math.abs(nv * dt);
    this.s = loc.s;
    this.d = loc.d;
    const fr = r.frame(this.s);
    this.alongRoad = Math.sin(this.yaw) * fr.tx + Math.cos(this.yaw) * fr.tz;

    // --- automatic gearbox (for sound & HUD)
    const gears = sp.category === 'heavy' ? 10 : sp.bike || sp.threeWheeler ? 5 : 6;
    const gearTop = (g) => (vmax * 1.05 * Math.pow(g / gears, 0.85));
    if (nv < -0.2) this.gear = -1;
    else {
      if (this.gear < 1) this.gear = 1;
      const ratio = av / gearTop(this.gear);
      if (ratio > 0.92 && this.gear < gears) this.gear++;
      else if (this.gear > 1 && av / gearTop(this.gear - 1) < 0.62) this.gear--;
    }
    const gTop = gearTop(Math.max(1, this.gear));
    const lowGear = this.gear <= 1 ? 0.25 : 0;
    const rpmTarget = Math.min(1.05, Math.max(0.12 + lowGear * input.throttle, av / gTop) * (0.85 + input.throttle * 0.15));
    this.rpm += (rpmTarget - this.rpm) * Math.min(1, dt * 8);
    this.throttle = input.throttle;
    this.braking = input.brake > 0 && nv > 0.5;

    // --- vertical: road height, suspension, speed bumps
    const groundY = this.#groundHeight(0, 0);
    const front = this.#groundHeight(sp.wheelbase / 2, 0);
    const rear = this.#groundHeight(-sp.wheelbase / 2, 0);
    const left = this.#groundHeight(0, sp.width / 2);
    const right = this.#groundHeight(0, -sp.width / 2);
    const tp = Math.atan2(front - rear, sp.wheelbase);
    const tr = Math.atan2(left - right, sp.width);
    // bumps
    const world = this.world;
    if (world && Math.abs(this.d) < hw) {
      for (const b of world.bumps) {
        if (Math.abs(b - this.s) < 0.8 && Math.abs(b - this.lastBumpS) > 2) {
          this.vy += Math.min(3.5, av * 0.22);
          this.lastBumpS = b;
          this.bumpKick = Math.min(1, av / 15);
        }
      }
    }
    // spring
    const rough = this.offroad ? (Math.sin(this.odometer * 1.7) + Math.sin(this.odometer * 3.1)) * 0.02 * Math.min(1, av / 8) : 0;
    this.vy += (-90 * this.suspY - 9 * this.vy) * dt;
    this.suspY += this.vy * dt;
    this.y = groundY + this.suspY + rough;
    // body pitch from acceleration, roll from cornering
    const accPitch = THREE.MathUtils.clamp(a * 0.006, -0.04, 0.04);
    const corneringRoll = THREE.MathUtils.clamp(yawRate * nv * 0.006, -0.06, 0.06);
    this.pitch += (tp + accPitch - this.pitch) * Math.min(1, dt * 10);
    this.roll += (tr + (sp.bike ? 0 : corneringRoll) - this.roll) * Math.min(1, dt * 8);
    this.place(dt);
  }

  #groundHeight(fwd, left) {
    // vehicle-local offset -> world -> route height
    const sx = Math.sin(this.yaw), cz = Math.cos(this.yaw);
    // left vector (vehicle +x) = (cos yaw, -sin yaw)
    const x = this.x + sx * fwd + cz * left;
    const z = this.z + cz * fwd - sx * left;
    const loc = this.route.locate(x, z, this.s);
    return this.route.height(loc.s, loc.d);
  }

  place(dt) {
    const m = this.mesh;
    m.position.set(this.x, this.y, this.z);
    m.rotation.order = 'YXZ';
    m.rotation.y = this.yaw;
    m.rotation.x = -this.pitch;
    m.rotation.z = this.roll;
    const ud = m.userData;
    for (const w of ud.wheels) w.rotation.x += (this.speed * dt) / 0.4;
    for (const w of ud.steerWheels) w.rotation.y = this.steer;
    if (ud.trailer) {
      const rel = this.yaw - this.trailerYaw;
      this.trailerYaw += (this.speed / 9) * Math.sin(rel) * dt;
      ud.trailer.rotation.y = THREE.MathUtils.clamp(this.trailerYaw - this.yaw, -1.1, 1.1);
      this.trailerYaw = this.yaw + ud.trailer.rotation.y;
    }
    if (ud.lean) ud.lean.rotation.z = THREE.MathUtils.clamp(-(this.yawRate || 0) * this.speed * 0.06, -0.5, 0.5);
    ud.tailMat.emissiveIntensity = this.braking ? 4 : this.lightsOn ? 1.2 : 0.25;
  }

  /** collision response from traffic */
  hit(info) {
    const along = info.newAlong;
    this.speed = along * (this.alongRoad >= 0 ? 1 : -1);
    this.damage = Math.min(100, this.damage + Math.min(35, info.impact * 3.6 * 0.4));
    // separate the bodies so we don't stay interlocked
    const fr = this.route.frame(this.s);
    const ps = info.push?.s ?? 0;
    const pd = info.push?.d ?? -info.side * 0.35;
    this.x += fr.tx * ps + fr.rx * pd;
    this.z += fr.tz * ps + fr.rz * pd;
    this.vy += Math.min(2, info.impact * 0.2);
  }
}
