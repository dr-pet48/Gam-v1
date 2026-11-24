import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HIGHWAYS, BORDER_COUNTRIES } from './data/highways.js';
import { VEHICLES } from './data/vehicles.js';
import { Route, SHOULDER } from './route.js';
import { World } from './world.js';
import { Environment } from './environment.js';
import { Traffic } from './traffic.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { initMaterials, buildVehicle, MAT } from './models.js';
import { setMaxAnisotropy } from './textures.js';

const DPR = window.devicePixelRatio || 1;
const QUALITY = {
  low: { pixelRatio: Math.min(DPR, 1) * 0.75, shadows: false, shadowMap: 1024, trees: 0.45, view: 1100, bloom: false, msaa: 0, fogBase: 0.0006, wildlife: 0.6 },
  medium: { pixelRatio: Math.min(DPR, 1), shadows: true, shadowMap: 1024, trees: 0.75, view: 1400, bloom: true, msaa: 2, fogBase: 0.00048, wildlife: 1 },
  high: { pixelRatio: Math.min(DPR, 1.5), shadows: true, shadowMap: 2048, trees: 1, view: 1700, bloom: true, msaa: 4, fogBase: 0.00042, wildlife: 1 },
  ultra: { pixelRatio: Math.min(DPR, 2), shadows: true, shadowMap: 4096, trees: 1.35, view: 2100, bloom: true, msaa: 4, fogBase: 0.00036, wildlife: 1.3 },
};
const COCKPIT = {
  sedan: [0.36, 1.18, 0.15], safari: [0.4, 1.75, 0.6], pickup: [0.38, 1.55, 0.8], matatu: [0.42, 1.75, 2.2],
  bus: [0.7, 2.6, 5.4], truck: [0.6, 2.9, 7.4], tanker: [0.6, 2.9, 6.6], tuktuk: [0, 1.4, 0.7], boda: [0, 1.85, 0.0],
};

const $ = (id) => document.getElementById(id);
const fmtHour = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');

class Game {
  constructor() {
    this.canvas = $('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    initMaterials();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 40000);
    this.input = new Input();
    this.input.bindTouch(document.body);
    this.audio = new AudioEngine();
    this.hud = new HUD($('hud'));
    this.clock = new THREE.Clock();
    this.state = 'menu';
    this.camMode = 0;
    this.time = 0;
    this.sel = { highway: HIGHWAYS[0], vehicle: VEHICLES[0], reverse: false };
    this.#menu();
    this.#bindOverlays();
    addEventListener('resize', () => this.#resize());
    this.#resize();
    this.renderer.setAnimationLoop(() => this.#frame());
    window.__game = this; // handy for debugging
  }

  // ------------------------------------------------------------ menu
  #menu() {
    const routes = $('routes');
    for (const hw of HIGHWAYS) {
      const b = document.createElement('button');
      b.className = 'route';
      const ends = hw.waypoints[0].name + ' ⇄ ' + hw.waypoints[hw.waypoints.length - 1].name;
      b.innerHTML = `<div class="code">${hw.code}</div><div><b>${hw.name}</b><small>${hw.connects}</small><small>${ends} · ${hw.waypoints.length} stops${hw.lengthKm ? ' · ' + hw.lengthKm + ' km' : ''}</small></div>`;
      b.onclick = () => {
        this.sel.highway = hw;
        this.sel.reverse = false;
        this.#refreshMenu();
      };
      b.dataset.id = hw.id;
      routes.appendChild(b);
    }
    const vehs = $('vehicles');
    const previews = this.#previews();
    for (const v of VEHICLES) {
      const b = document.createElement('button');
      b.className = 'veh';
      b.dataset.id = v.id;
      b.innerHTML = `<img alt="${v.name}" src="${previews[v.id] || ''}"/><b>${v.name}</b><small>${v.desc}</small><div class="stats"><span>${v.topSpeed} km/h</span><span>${(v.mass / 1000).toFixed(1)} t</span>${v.governor ? '<span>Gov 80</span>' : ''}</div>`;
      b.onclick = () => {
        this.sel.vehicle = v;
        this.#refreshMenu();
      };
      vehs.appendChild(b);
    }
    $('opt-dir').onchange = (e) => {
      this.sel.reverse = e.target.value === '1';
      this.#refreshMenu(true);
    };
    $('opt-hour').oninput = (e) => ($('opt-hour-v').textContent = fmtHour(+e.target.value));
    $('btn-drive').onclick = () => this.start();
    this.#refreshMenu();
  }

  #refreshMenu(keepDir = false) {
    const hw = this.sel.highway;
    for (const el of document.querySelectorAll('.route')) el.classList.toggle('sel', el.dataset.id === hw.id);
    for (const el of document.querySelectorAll('.veh')) el.classList.toggle('sel', el.dataset.id === this.sel.vehicle.id);
    const a = hw.waypoints[0].name, z = hw.waypoints[hw.waypoints.length - 1].name;
    if (!keepDir) $('opt-dir').innerHTML = `<option value="0">${a} → ${z}</option><option value="1">${z} → ${a}</option>`;
    $('opt-dir').value = this.sel.reverse ? '1' : '0';
    const wps = this.sel.reverse ? hw.waypoints.slice().reverse() : hw.waypoints;
    $('opt-start').innerHTML = wps.slice(0, -1).map((w, i) => `<option value="${i}">${w.name} (${w.county})</option>`).join('');
    $('route-info').innerHTML = `<b>${hw.code} — ${hw.name}</b><br/>${hw.description}<div class="towns">${wps.map((w) => w.name).join(' · ')}</div><div class="towns">Also known as: ${hw.aka}</div>`;
  }

  #previews() {
    const out = {};
    try {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setSize(320, 200);
      r.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xdde8ff, 0x5a4a3a, 1.6));
      const d = new THREE.DirectionalLight(0xffffff, 3);
      d.position.set(5, 8, 6);
      scene.add(d);
      const pmrem = new THREE.PMREMGenerator(r);
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x8899aa);
      scene.environment = pmrem.fromScene(envScene).texture;
      const cam = new THREE.PerspectiveCamera(30, 1.6, 0.1, 200);
      for (const v of VEHICLES) {
        const m = buildVehicle(v.id, { seed: 7, color: v.id === 'sedan' ? 0xb71c1c : undefined });
        scene.add(m);
        const L = v.length;
        cam.position.set(L * 0.85 + 2, L * 0.35 + 1.4, L * 0.75 + 2);
        cam.lookAt(0, v.height * 0.45, 0);
        m.rotation.y = 0.15;
        r.render(scene, cam);
        out[v.id] = r.domElement.toDataURL('image/png');
        scene.remove(m);
      }
      r.dispose();
    } catch (e) {
      console.warn('preview failed', e);
    }
    return out;
  }

  #bindOverlays() {
    $('p-resume').onclick = () => this.#pause(false);
    $('p-menu').onclick = () => this.toMenu();
    $('p-hour').oninput = (e) => {
      this.env.hour = +e.target.value;
      $('p-hour-v').textContent = fmtHour(this.env.hour);
    };
    $('p-weather').onchange = (e) => this.env.setWeather(e.target.value);
    $('p-traffic').onchange = (e) => {
      this.traffic.setDensity(+e.target.value);
      this.traffic.populate(this.player.s);
    };
    $('p-jump').onchange = (e) => {
      const w = +e.target.value;
      this.player.reset(this.route.wpS[w] + 30);
      this.camPos = null;
      this.world.prewarm(this.player.s);
      this.traffic.populate(this.player.s);
      this.lastWp = this.route.nextWaypoint(this.player.s);
      this.#pause(false);
    };
    $('a-menu').onclick = () => this.toMenu();
    $('a-close').onclick = () => {
      $('arrive').classList.add('hidden');
      this.state = 'drive';
    };
  }

  // ------------------------------------------------------------ session
  start() {
    $('loading').classList.remove('hidden');
    // let the spinner paint before the heavy build
    setTimeout(() => this.#build(), 30);
  }

  #build() {
    this.#teardown();
    const q = (this.q = QUALITY[$('opt-quality').value]);
    const scale = +$('opt-scale').value;
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.shadowMap.enabled = q.shadows;

    const scene = (this.scene = new THREE.Scene());
    const route = (this.route = new Route(this.sel.highway, this.sel.reverse, scale));
    this.env = new Environment(scene, this.renderer, route, q);
    this.env.hour = +$('opt-hour').value;
    this.env.setWeather($('opt-weather').value);
    this.timeFlow = +$('opt-timeflow').value;
    this.world = new World(scene, route, q);

    const startWp = +$('opt-start').value;
    const s0 = Math.max(25, route.wpS[startWp] + (startWp === 0 ? 25 : 40));
    this.player = new Player(scene, route, this.sel.vehicle, s0);
    this.player.world = this.world;
    this.traffic = new Traffic(scene, route, +$('opt-traffic').value);
    this.traffic.onCollision = (info) => {
      this.player.hit(info);
      this.shake = Math.min(1.2, info.impact * 0.08);
      this.audio.crash(info.impact);
      if (info.impact > 2) this.hud.toast(`Collision with a ${info.car.spec.name.toLowerCase()}! Damage ${Math.round(this.player.damage)}%`, 'warn', 'crash', 2);
    };

    // headlights
    this.headlights = [];
    for (const x of [-0.6, 0.6]) {
      const L = new THREE.SpotLight(0xfff1d6, 0, 120, 0.42, 0.5, 1.4);
      L.position.set(this.sel.vehicle.bike ? 0 : x, this.sel.vehicle.height * 0.45 + 0.3, this.sel.vehicle.length / 2);
      L.target.position.set(x * 3, 0, this.sel.vehicle.length / 2 + 30);
      this.player.mesh.add(L, L.target);
      this.headlights.push(L);
      if (this.sel.vehicle.bike) break;
    }

    // post-processing
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(scene, this.camera));
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.25, 0.45, 0.92);
      this.composer.addPass(this.bloom);
    } else this.bloom = null;
    this.composer.addPass(new OutputPass());
    this.#resize();

    this.hud.setRoute(route);
    this.world.prewarm(s0);
    this.traffic.populate(s0);
    this.lastWp = route.nextWaypoint(s0);
    this.lastCounty = route.waypoints[route.prevWaypoint(s0)].county;
    this.overSpeedT = 0;
    this.driveTime = 0;
    this.shake = 0;
    this.camPos = null;
    this.arrived = false;
    this.autoLights = true;
    this.passedEquator = this.world.equatorS !== undefined && s0 > this.world.equatorS;

    $('p-jump').innerHTML = route.waypoints.map((w, i) => `<option value="${i}">${w.name}</option>`).join('');
    $('p-weather').value = this.env.weather;
    $('p-traffic').value = $('opt-traffic').value;

    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('loading').classList.add('hidden');
    this.audio.start(this.sel.vehicle);
    this.audio.setEnabled(!this.userMuted);
    this.state = 'drive';
    const wp = route.waypoints[route.prevWaypoint(s0)];
    this.hud.toast(`${route.highway.code} ${route.highway.name}: ${wp.name} → ${route.waypoints.at(-1).name}`, 'place', 'start', 1);
    if (wp.note) setTimeout(() => this.hud.toast(wp.note, 'info'), 1500);
    if (this.sel.vehicle.governor) setTimeout(() => this.hud.toast('PSV & commercial vehicles are speed-governed to 80 km/h (press G to toggle)', 'info'), 3200);
    this.clock.getDelta();
  }

  #teardown() {
    if (!this.scene) return;
    this.traffic?.clear();
    this.scene.traverse((o) => {
      if (o.isMesh && o.userData.ownGeo) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
    this.env?.envRT?.dispose();
    this.composer?.dispose?.();
    this.scene = null;
  }

  toMenu() {
    this.state = 'menu';
    // silence the engine while in the menu (respecting the user's mute choice)
    this.audio.setEnabled(false);
    if (this.player) this.audio.update(this.player, { rainAmount: 0 });
    this.audio.horn(this.sel.vehicle, false);
    $('pause').classList.add('hidden');
    $('arrive').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('menu').classList.remove('hidden');
  }

  #pause(on) {
    if (on) {
      this.state = 'pause';
      $('p-hour').value = this.env.hour;
      $('p-hour-v').textContent = fmtHour(this.env.hour);
      $('pause').classList.remove('hidden');
      this.audio.setEnabled(false);
      this.audio.update(this.player, { rainAmount: 0 });
      this.audio.horn(this.player.spec, false);
    } else {
      this.state = 'drive';
      this.audio.setEnabled(!this.userMuted);
      $('pause').classList.add('hidden');
      this.clock.getDelta();
    }
  }

  #resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  // ------------------------------------------------------------ loop
  #frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'menu' || !this.scene) return;
    if (this.input.hit('Escape') || this.input.hit('KeyP')) this.#pause(this.state !== 'pause');
    if (this.state === 'pause') {
      this.input.endFrame();
      this.composer.render();
      return;
    }
    this.time += dt;
    this.driveTime += dt;
    const inp = this.input.read(dt);
    inp.wet = this.env.wet > 0.3;
    if (this.input.hit('KeyC')) this.camMode = (this.camMode + 1) % 5;
    if (this.input.hit('KeyL')) {
      this.player.lightsOn = !this.player.lightsOn;
      this.autoLights = false;
    }
    if (this.input.hit('KeyG') && this.player.spec.governor) {
      this.player.governorOn = !this.player.governorOn;
      this.hud.toast(this.player.governorOn ? 'Speed governor ON (80 km/h)' : 'Speed governor OFF — illegal for PSVs in Kenya!', this.player.governorOn ? 'info' : 'warn', 'gov', 0);
    }
    if (this.input.hit('KeyR')) {
      this.player.reset(this.player.s);
      this.player.damage = 0;
      this.camPos = null;
      this.hud.toast('Towed back onto the road and repaired', 'info', 'tow', 0);
    }
    if (this.input.hit('KeyT')) this.env.hour = (this.env.hour + 1) % 24;
    if (this.input.hit('KeyM')) {
      this.userMuted = this.audio.enabled;
      this.audio.setEnabled(!this.userMuted);
      this.hud.toast(this.audio.enabled ? 'Sound on' : 'Sound muted', 'info', 'mute', 0);
    }
    this.audio.horn(this.player.spec, inp.horn);

    this.env.hour = (this.env.hour + (dt * this.timeFlow) / 3600) % 24;
    this.player.update(dt, inp);
    this.traffic.update(dt, this.player);
    this.world.update(this.player.s, this.player.mesh.position, null);
    this.world.animate(this.time);
    const { day } = this.env.update(dt, this.camera, this.player.mesh.position, this.player.s, this.time);
    this.world.setWetness(this.env.wet);
    this.world.setNight(1 - day);
    // headlights
    if (this.autoLights) this.player.lightsOn = day < 0.35 || this.env.weather === 'fog' || this.env.mist > 0.5;
    const lightI = this.player.lightsOn ? 60 : 0;
    for (const L of this.headlights) L.intensity = lightI;
    MAT.head.emissiveIntensity = day < 0.4 ? 3 : 0.3;
    MAT.tail.emissiveIntensity = day < 0.4 ? 1.2 : 0.25;
    if (this.bloom) this.bloom.strength = 0.15 + (1 - day) * 0.55;
    this.renderer.toneMappingExposure = 0.9 + (1 - day) * 0.35;

    // far ground colour from local biome
    const i = this.route.idx(this.player.s);
    const fc = new THREE.Color(this.route.col[i * 3], this.route.col[i * 3 + 1], this.route.col[i * 3 + 2]).multiplyScalar(0.55 + day * 0.35);
    this.world.farMat.color.copy(fc);

    this.#events(dt);
    this.#updateCamera(dt);
    this.audio.update(this.player, this.env);
    this.hud.update({ player: this.player, route: this.route, hour: this.env.hour, env: this.env });
    this.input.endFrame();
    this.composer.render();
  }

  #events(dt) {
    const r = this.route;
    const p = this.player;
    const nw = r.nextWaypoint(p.s);
    if (nw !== this.lastWp) {
      const wp = r.waypoints[nw - 1] || r.waypoints[0];
      if (nw > this.lastWp && wp) {
        this.hud.toast(`${wp.name} · ${wp.county} County · ${wp.elev} m`, 'place', 'wp' + wp.name, 30);
        if (wp.note) setTimeout(() => this.hud.toast(wp.note, 'info'), 1200);
      }
      this.lastWp = nw;
    }
    const prev = r.waypoints[r.prevWaypoint(p.s)];
    const midCounty = this.#countyAt(p.s);
    if (midCounty !== this.lastCounty) {
      this.hud.toast(`Welcome to ${midCounty} County`, 'place', 'c' + midCounty, 30);
      this.lastCounty = midCounty;
    }
    void prev;
    if (this.world.equatorS !== undefined && !this.passedEquator && p.s > this.world.equatorS) {
      this.passedEquator = true;
      this.hud.toast('You just crossed the Equator (0° latitude)!', 'place', 'eq', 60);
    }
    // speeding
    const limit = r.limit[r.idx(p.s)];
    const vehLimit = p.spec.governor ? Math.min(limit, 80) : limit;
    if (p.kmh > vehLimit + 10) {
      this.overSpeedT += dt;
      if (this.overSpeedT > 3) this.hud.toast(`Over the ${vehLimit} km/h limit — watch out for traffic police speed guns!`, 'warn', 'speed', 20);
    } else this.overSpeedT = 0;
    if (p.offroad && Math.abs(p.speed) > 8) this.hud.toast('Off the road — rough murram!', 'warn', 'off', 15);
    // arrival
    if (!this.arrived && p.s > r.length - 60) {
      this.arrived = true;
      const end = r.waypoints.at(-1);
      const country = BORDER_COUNTRIES[end.name];
      const realKm = r.realKmAt(p.s) - 0;
      $('a-title').textContent = `Karibu ${end.name}!`;
      $('a-text').innerHTML = `You drove the <b>${r.highway.code} ${r.highway.name}</b> to ${end.name}${country ? `, at the border with <b>${country}</b>` : ''}.<br/>Distance: <b>${Math.round(realKm)} km</b> (real) · Drive time: <b>${Math.round(this.driveTime / 60)} min</b> · Damage: <b>${Math.round(p.damage)}%</b>`;
      $('arrive').classList.remove('hidden');
      this.state = 'pause';
    }
  }

  #countyAt(s) {
    const r = this.route;
    const w = r.prevWaypoint(s);
    if (w >= r.waypoints.length - 1) return r.waypoints[w].county;
    const mid = (r.wpS[w] + r.wpS[w + 1]) / 2;
    return s < mid ? r.waypoints[w].county : r.waypoints[w + 1].county;
  }

  #updateCamera(dt) {
    const p = this.player;
    const m = p.mesh;
    const spec = p.spec;
    const cam = this.camera;
    const fwd = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    m.visible = this.camMode !== 2;
    let targetFov = 60 + Math.min(14, Math.abs(p.speed) * 0.25);
    if (this.camMode === 0 || this.camMode === 1 || this.camMode === 4) {
      const far = this.camMode === 1 ? 1.7 : 1;
      const heli = this.camMode === 4;
      const dist = spec.camDist * far * (heli ? 1.6 : 1);
      const height = spec.camHeight * far * (heli ? 4 : 1);
      // look direction follows velocity heading with lag
      if (!this.camYaw) this.camYaw = p.yaw;
      let dy = p.yaw - this.camYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.camYaw += dy * Math.min(1, dt * 4);
      const back = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
      const target = m.position.clone().addScaledVector(back, -dist);
      target.y = m.position.y + height;
      // keep camera above terrain
      const loc = this.route.locate(target.x, target.z, p.s);
      target.y = Math.max(target.y, this.route.height(loc.s, loc.d) + 1.2);
      if (!this.camPos) this.camPos = target.clone();
      this.camPos.lerp(target, Math.min(1, dt * 6));
      cam.position.copy(this.camPos);
      const look = m.position.clone().addScaledVector(back, 6).add(new THREE.Vector3(0, spec.height * 0.6, 0));
      cam.lookAt(look);
    } else if (this.camMode === 2) {
      const [cx, cy, cz] = COCKPIT[spec.id];
      const local = new THREE.Vector3(-cx, cy, cz);
      m.updateMatrixWorld();
      cam.position.copy(local.applyMatrix4(m.matrixWorld));
      const look = new THREE.Vector3(-cx, cy - 0.15, cz + 20).applyMatrix4(m.matrixWorld);
      cam.lookAt(look);
      targetFov = 70;
      this.camPos = null;
    } else if (this.camMode === 3) {
      // roadside cinematic cameras
      if (!this.cine || p.s - this.cine.s > 45 || this.cine.s - p.s > 220) {
        const s = p.s + 120 + Math.random() * 60;
        const side = Math.random() < 0.5 ? -1 : 1;
        const d = side * (this.route.halfWidth(s) + SHOULDER + 6 + Math.random() * 10);
        const pt = this.route.point(s, d);
        this.cine = { s, pos: new THREE.Vector3(pt.x, pt.y + 1.5 + Math.random() * 4, pt.z) };
      }
      cam.position.copy(this.cine.pos);
      cam.lookAt(m.position.clone().add(new THREE.Vector3(0, spec.height * 0.5, 0)));
      targetFov = 38;
      this.camPos = null;
    }
    void fwd;
    // shake (bumps, collisions, rough ground)
    const rough = p.offroad ? Math.min(1, Math.abs(p.speed) / 15) * 0.05 : 0;
    this.shake = Math.max(0, (this.shake || 0) - dt * 1.5);
    const sh = this.shake * 0.15 + rough + p.bumpKick * 0.08;
    p.bumpKick = Math.max(0, p.bumpKick - dt * 3);
    if (sh > 0) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
  }
}

new Game();
