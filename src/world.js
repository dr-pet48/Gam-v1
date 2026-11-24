// Streams the landscape in chunks along the route: terrain, road surface,
// vegetation, towns, signage, roadside furniture and wildlife.
import * as THREE from 'three';
import { DS, LANE_W, SHOULDER, BIOMES, BIOME_NAMES } from './route.js';
import { mulberry32, fbm2 } from './noise.js';
import { MAT, buildPropGeometries, buildAnimal } from './models.js';
import {
  carriagewayTexture, groundDetailTexture, directionSignTexture, speedSignTexture, warningSignTexture,
  boardTexture, kmPostTexture, kenyaFlagTexture, facadeTexture, facadeLitTexture, shopSignTexture,
} from './textures.js';
import { BORDER_COUNTRIES } from './data/highways.js';

const CH = 64; // samples per chunk (256 m)
const OFFS = [0, 0.6, 1.6, 3, 4.6, 6.5, 9, 12, 16, 21, 28, 37, 48, 62, 80, 102, 130, 165, 210, 265, 330, 380];

const TREE_MIX = {
  urban: [['acacia', 0.3], ['eucalyptus', 0.35], ['bush', 0.35]],
  coastal: [['palm', 0.55], ['bush', 0.2], ['baobab', 0.08], ['banana', 0.1], ['eucalyptus', 0.07]],
  savanna: [['acacia', 0.45], ['bush', 0.22], ['termite', 0.12], ['baobab', 0.06], ['rock', 0.08], ['euphorbia', 0.07]],
  highland: [['eucalyptus', 0.35], ['cypress', 0.2], ['tea', 0.25], ['banana', 0.1], ['bush', 0.1]],
  forest: [['cypress', 0.55], ['eucalyptus', 0.35], ['bush', 0.1]],
  riftvalley: [['acacia', 0.4], ['euphorbia', 0.25], ['bush', 0.2], ['rock', 0.15]],
  farmland: [['maize', 0.35], ['banana', 0.15], ['eucalyptus', 0.2], ['bush', 0.15], ['acacia', 0.15]],
  arid: [['bush', 0.45], ['acacia', 0.2], ['rock', 0.2], ['palm', 0.05], ['termite', 0.1]],
};
const WALL_COLORS = [0xf1e6c8, 0xe9c46a, 0xd98c5f, 0x9ad1d4, 0xf4a6a6, 0xc6e2a5, 0xffffff, 0xe7d3b0, 0xb5c7e3, 0xf0d58c];

const pick = (mix, r) => {
  let a = 0;
  for (const [k, w] of mix) {
    a += w;
    if (r < a) return k;
  }
  return mix[mix.length - 1][0];
};

export class World {
  constructor(scene, route, quality) {
    this.scene = scene;
    this.route = route;
    this.quality = quality;
    this.chunks = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.props = buildPropGeometries();
    this.animalTemplates = { zebra: buildAnimal('zebra'), giraffe: buildAnimal('giraffe'), elephant: buildAnimal('elephant') };
    this.animals = [];

    const gtex = groundDetailTexture();
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: gtex, roughness: 0.95, metalness: 0 });
    this.roadMats = new Map();
    this.facadeMat = new THREE.MeshStandardMaterial({ map: facadeTexture(), vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: facadeLitTexture(), emissiveIntensity: 0 });
    this.shopMat = new THREE.MeshStandardMaterial({ map: shopSignTexture(), roughness: 0.6, side: THREE.DoubleSide });
    this.signBackMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.6, metalness: 0.5 });
    this.postMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.6 });
    this.signMats = new Map();
    this.concreteMat = new THREE.MeshStandardMaterial({ color: 0xbdb8ae, roughness: 0.9 });

    // Far ground disc that fills the view beyond the terrain strip.
    const far = new THREE.CircleGeometry(16000, 48);
    far.rotateX(-Math.PI / 2);
    this.farMat = new THREE.MeshStandardMaterial({ color: 0x8a7a50, roughness: 1 });
    this.farGround = new THREE.Mesh(far, this.farMat);
    this.farGround.receiveShadow = false;
    scene.add(this.farGround);

    this.#planEvents();
  }

  roadMat(lanes, dual) {
    const key = lanes + ':' + dual;
    if (!this.roadMats.has(key)) {
      const m = new THREE.MeshStandardMaterial({ map: carriagewayTexture(lanes, dual), roughness: 0.82, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.roadMats.set(key, m);
    }
    return this.roadMats.get(key);
  }

  signMat(tex) {
    if (!this.signMats.has(tex.uuid)) this.signMats.set(tex.uuid, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.05 }));
    return this.signMats.get(tex.uuid);
  }

  setWetness(w) {
    for (const m of this.roadMats.values()) {
      m.roughness = 0.82 - w * 0.62;
      m.color.setScalar(1 - w * 0.35);
    }
    this.terrainMat.color.setScalar(1 - w * 0.2);
  }

  setNight(n) {
    MAT.lamp.emissiveIntensity = n * 6;
    this.facadeMat.emissiveIntensity = n * 1.4;
    for (const m of this.signMats.values()) m.emissiveIntensity = 0.05 + n * 0.35; // retro-reflective
  }

  // ---------------------------------------------------------------- planning
  #planEvents() {
    const r = this.route;
    const wps = r.waypoints;
    const ev = (this.events = []);
    const code = r.highway.code;
    const compression = (r.realLengthKm * 1000) / r.length; // real m per world m
    this.compression = compression;
    const kmAt = (s) => r.realKmAt(s);
    const fmtKm = (k) => (k < 10 ? k.toFixed(1) : Math.round(k)) + ' km';

    for (let w = 0; w < wps.length; w++) {
      const ws = r.wpS[w];
      const wp = wps[w];
      // approach sign
      if (w > 0 && ws - 520 > 0) {
        const rows = [{ name: wp.name, km: fmtKm(Math.max(0.1, wp.km - kmAt(ws - 520))) }];
        ev.push({ s: ws - 520, type: 'dir', tex: directionSignTexture(code, rows), w: 5, h: 5 * (200 / 512), side: -1 });
      }
      // town name board
      if (wp.kind !== 'landmark' && wp.kind !== 'junction') {
        ev.push({ s: Math.max(30, ws - 150), type: 'board', tex: boardTexture(['KARIBU', wp.name.toUpperCase()], '#1f4e9c'), w: 4, h: 2, side: -1 });
      }
      // departure sign listing the next destinations
      if (w < wps.length - 1) {
        const nexts = [];
        for (let k = w + 1; k < wps.length && nexts.length < 2; k++) {
          if (wps[k].kind === 'landmark') continue;
          nexts.push({ name: wps[k].name, km: fmtKm(wps[k].km - kmAt(ws + 260)) });
        }
        const last = wps[wps.length - 1];
        if (!nexts.find((n) => n.name === last.name)) nexts.push({ name: last.name, km: fmtKm(last.km - kmAt(ws + 260)) });
        ev.push({ s: ws + 260, type: 'dir', tex: directionSignTexture(code, nexts), w: 5, h: 5 * ((128 + nexts.length * 72) / 512), side: -1 });
      }
      // county boundary (half way to next waypoint)
      if (w < wps.length - 1 && wps[w + 1].county !== wp.county) {
        const sm = (ws + r.wpS[w + 1]) / 2;
        ev.push({ s: sm, type: 'board', tex: boardTexture(['WELCOME TO', wps[w + 1].county.toUpperCase() + ' COUNTY'], '#6b3e1f'), w: 4.4, h: 2.2, side: -1, county: wps[w + 1].county });
        ev.push({ s: sm + 4, type: 'board', tex: boardTexture(['WELCOME TO', wp.county.toUpperCase() + ' COUNTY'], '#6b3e1f'), w: 4.4, h: 2.2, side: 1, facing: -1 });
      }
      if (wp.kind === 'weighbridge') {
        ev.push({ s: ws - 380, type: 'board', tex: boardTexture(['WEIGHBRIDGE AHEAD', 'ALL HEAVY VEHICLES'], '#0b6a3a'), w: 4.4, h: 2.2, side: -1 });
        ev.push({ s: ws, type: 'weighbridge', side: -1 });
      }
      if (wp.kind === 'border') {
        ev.push({ s: ws, type: 'border', country: BORDER_COUNTRIES[wp.name] || 'Border' });
        const sBoard = w === 0 ? ws + 120 : ws - 300;
        ev.push({ s: sBoard, type: 'board', tex: boardTexture(['ONE STOP BORDER POST', (BORDER_COUNTRIES[wp.name] || '').toUpperCase()], '#0b6a3a'), w: 4.4, h: 2.2, side: -1 });
      }
      if (wp.note && /wildlife|National Park|Tsavo/i.test(wp.note)) {
        for (let k = -2; k <= 2; k++) ev.push({ s: ws + k * 900, type: 'warn', tex: warningSignTexture('wildlife'), w: 1.4, h: 1.4, side: -1 });
      }
    }
    // Equator crossings
    for (let w = 0; w < wps.length - 1; w++) {
      const a = wps[w].lat, b = wps[w + 1].lat;
      if (a === 0 || Math.sign(a) !== Math.sign(b)) {
        const f = a / (a - b);
        const s = r.wpS[w] + (r.wpS[w + 1] - r.wpS[w]) * f;
        ev.push({ s, type: 'board', tex: boardTexture(['EQUATOR', 'LATITUDE 0°'], '#f2c500', '#111'), w: 4, h: 2, side: -1, equator: true });
        ev.push({ s: s + 3, type: 'board', tex: boardTexture(['EQUATOR', 'LATITUDE 0°'], '#f2c500', '#111'), w: 4, h: 2, side: 1, facing: -1 });
        this.equatorS = s;
      }
    }
    // Speed limit changes
    let prev = -1;
    for (let i = 0; i < r.N; i += 5) {
      const l = r.limit[i];
      if (l !== prev) {
        ev.push({ s: i * DS + 20, type: 'speed', tex: speedSignTexture(l), w: 1.2, h: 1.2, side: -1, limit: l });
        prev = l;
      }
    }
    // Speed bumps in towns
    this.bumps = [];
    for (let w = 0; w < wps.length; w++) {
      if (!['town', 'border', 'weighbridge'].includes(wps[w].kind)) continue;
      for (const off of [-220, 200]) {
        const s = r.wpS[w] + off;
        if (s < 40 || s > r.length - 40) continue;
        this.bumps.push(s);
        ev.push({ s: s - (off < 0 ? 70 : -70), type: 'warn', tex: warningSignTexture('bump'), w: 1.3, h: 1.3, side: off < 0 ? -1 : 1, facing: off < 0 ? 1 : -1 });
      }
    }
    // Sharp curve warnings
    for (let i = 0; i < r.N; i += 25) {
      if (Math.abs(r.curv[i]) > 0.0045) {
        ev.push({ s: Math.max(10, i * DS - 120), type: 'warn', tex: warningSignTexture('curve'), w: 1.3, h: 1.3, side: -1 });
        i += 75;
      }
    }
    // Kilometre posts
    const steps = [1, 2, 5, 10, 20, 50];
    let K = steps.find((k) => (k * 1000) / compression >= 160) || 50;
    this.kmStep = K;
    for (let k = K; k < r.realLengthKm; k += K) {
      // find s by binary search on km
      let lo = 0, hi = r.N - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (r.km[mid] < k) lo = mid + 1;
        else hi = mid;
      }
      ev.push({ s: lo * DS, type: 'km', km: k, side: -1 });
    }
    ev.sort((a, b) => a.s - b.s);
  }

  // ---------------------------------------------------------------- streaming
  update(s, camPos, biomeColor) {
    const r = this.route;
    const ahead = this.quality.view;
    const behind = 420;
    const c0 = Math.max(0, Math.floor((s - behind) / DS / CH));
    const c1 = Math.min(Math.floor((r.N - 2) / CH), Math.floor((s + ahead) / DS / CH));
    let built = 0;
    // build nearest first
    const want = [];
    for (let c = c0; c <= c1; c++) want.push(c);
    want.sort((a, b) => Math.abs(a * CH * DS - s) - Math.abs(b * CH * DS - s));
    for (const c of want) {
      if (!this.chunks.has(c) && built < 1) {
        this.chunks.set(c, this.#buildChunk(c));
        built++;
      }
    }
    for (const [c, ch] of this.chunks) {
      if (c < c0 - 1 || c > c1 + 1) {
        this.#disposeChunk(ch);
        this.chunks.delete(c);
      }
    }
    this.farGround.position.set(camPos.x, r.height(s, 0) - 30, camPos.z);
    if (biomeColor) this.farMat.color.copy(biomeColor);
    return want.every((c) => this.chunks.has(c));
  }

  /** Build everything needed around s synchronously (used at spawn). */
  prewarm(s) {
    const r = this.route;
    const c0 = Math.max(0, Math.floor((s - 420) / DS / CH));
    const c1 = Math.min(Math.floor((r.N - 2) / CH), Math.floor((s + this.quality.view) / DS / CH));
    for (let c = c0; c <= c1; c++) if (!this.chunks.has(c)) this.chunks.set(c, this.#buildChunk(c));
  }

  animate(t) {
    for (const ch of this.chunks.values()) {
      for (const a of ch.animals) {
        a.mesh.position.y = a.y + Math.abs(Math.sin(t * a.speed + a.phase)) * 0.04;
        a.mesh.rotation.y = a.rot + Math.sin(t * 0.2 + a.phase) * 0.3;
      }
    }
  }

  #disposeChunk(ch) {
    this.group.remove(ch.group);
    ch.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.userData.ownGeo && o.geometry) o.geometry.dispose();
    });
  }

  #buildChunk(c) {
    const r = this.route;
    const g = new THREE.Group();
    const i0 = c * CH;
    const i1 = Math.min(r.N - 1, i0 + CH);
    const rnd = mulberry32(r.seed * 977 + c * 7919);
    const ch = { group: g, animals: [] };

    this.#buildTerrain(g, i0, i1);
    this.#buildRoad(g, i0, i1);
    this.#scatter(g, ch, i0, i1, rnd);
    this.#buildTown(g, i0, i1, rnd);
    this.#buildEvents(g, i0 * DS, i1 * DS);

    this.group.add(g);
    return ch;
  }

  #buildTerrain(g, i0, i1) {
    const r = this.route;
    const rows = i1 - i0 + 1;
    const nO = OFFS.length;
    // columns: left side (outer -> inner), median strip, right side (inner -> outer)
    const cols = nO * 2 + 2;
    const pos = new Float32Array(rows * cols * 3);
    const col = new Float32Array(rows * cols * 3);
    const uv = new Float32Array(rows * cols * 2);
    const fr = {};
    for (let ri = 0; ri < rows; ri++) {
      const i = i0 + ri;
      const s = i * DS;
      r.frame(s, fr);
      const hwRoad = r.median[i] / 2 + r.lanes[i] * LANE_W + SHOULDER;
      const ry = r.y[i];
      const cb = [r.col[i * 3], r.col[i * 3 + 1], r.col[i * 3 + 2]];
      const ca = [r.alt[i * 3], r.alt[i * 3 + 1], r.alt[i * 3 + 2]];
      const cv = [r.verge[i * 3], r.verge[i * 3 + 1], r.verge[i * 3 + 2]];
      const town = r.town[i];
      for (let ci = 0; ci < cols; ci++) {
        let d;
        let o = 0;
        let median = false;
        if (ci < nO) {
          o = OFFS[nO - 1 - ci];
          d = -(hwRoad + o);
        } else if (ci === nO || ci === nO + 1) {
          median = true;
          d = (ci === nO ? -1 : 1) * Math.max(0.01, r.median[i] / 2);
        } else {
          o = OFFS[ci - nO - 2];
          d = hwRoad + o;
        }
        let y = r.height(s, d);
        if (median) y = ry + (r.median[i] > 0.5 ? 0.12 : -0.2);
        if (o >= OFFS[nO - 1]) y = ry - 32; // skirt into the far ground
        const k = (ri * cols + ci) * 3;
        pos[k] = fr.x + fr.rx * d;
        pos[k + 1] = y;
        pos[k + 2] = fr.z + fr.rz * d;
        // colour: verge murram -> natural ground with patches
        const patch = fbm2(s / 90, d / 90, 3, r.seed + 11);
        const fields = r.biome[i] === BIOMES.farmland.id ? (Math.floor(s / 70) + Math.floor(d / 55)) % 3 === 0 : false;
        let m = Math.min(1, Math.max(0, (patch - 0.38) * 3));
        if (fields) m = 0.85;
        let cr = cb[0] + (ca[0] - cb[0]) * m;
        let cg = cb[1] + (ca[1] - cb[1]) * m;
        let cbb = cb[2] + (ca[2] - cb[2]) * m;
        const vergeW = Math.max(0, 1 - o / (5 + town * 18));
        cr += (cv[0] - cr) * vergeW;
        cg += (cv[1] - cg) * vergeW;
        cbb += (cv[2] - cbb) * vergeW;
        if (median) {
          cr = 0.36; cg = 0.45; cbb = 0.2;
          if (r.biome[i] === BIOMES.urban.id) { cr = 0.42; cg = 0.4; cbb = 0.36; }
        }
        const shade = 0.9 + fbm2(s / 23, d / 23, 2, r.seed + 2) * 0.2;
        col[k] = cr * shade;
        col[k + 1] = cg * shade;
        col[k + 2] = cbb * shade;
        const u = (ri * cols + ci) * 2;
        uv[u] = d / 9;
        uv[u + 1] = s / 9;
      }
    }
    const idx = [];
    for (let ri = 0; ri < rows - 1; ri++) {
      for (let ci = 0; ci < cols - 1; ci++) {
        if (ci === nO - 1 || ci === nO + 1) continue; // road gap (road mesh fills it)
        const a = ri * cols + ci;
        const b = a + cols;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    // Note on winding: columns go from -d (left) to +d (right); with rows
    // advancing along +s this yields upward-facing triangles in Three's frame.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.receiveShadow = true;
    mesh.userData.ownGeo = true;
    g.add(mesh);
  }

  #buildRoad(g, i0, i1) {
    const r = this.route;
    // runs of constant lane configuration
    let start = i0;
    for (let i = i0 + 1; i <= i1 + 1; i++) {
      const brk = i > i1 || r.lanes[i] !== r.lanes[start] || (r.median[i] > 0.5) !== (r.median[start] > 0.5);
      if (!brk) continue;
      const end = Math.min(i, i1);
      if (end > start) {
        const lanes = r.lanes[start];
        const dual = r.median[start] > 0.5;
        for (const side of [-1, 1]) this.#carriageway(g, start, end, side, lanes, dual);
        if (dual && r.biome[start] === BIOMES.urban.id) this.#barrier(g, start, end);
      }
      start = Math.min(i, i1);
    }
  }

  #carriageway(g, i0, i1, side, lanes, dual) {
    const r = this.route;
    const rows = i1 - i0 + 1;
    const across = 3;
    const pos = new Float32Array(rows * across * 3);
    const uv = new Float32Array(rows * across * 2);
    const fr = {};
    for (let ri = 0; ri < rows; ri++) {
      const i = i0 + ri;
      const s = i * DS;
      r.frame(s, fr);
      const inner = r.median[i] / 2;
      const width = lanes * LANE_W + SHOULDER;
      for (let a = 0; a < across; a++) {
        const t = a / (across - 1);
        const d = side * (inner + width * t);
        const k = (ri * across + a) * 3;
        pos[k] = fr.x + fr.rx * d;
        pos[k + 1] = r.height(s, d) + 0.03;
        pos[k + 2] = fr.z + fr.rz * d;
        const u = (ri * across + a) * 2;
        uv[u] = t;
        uv[u + 1] = s / 16;
      }
    }
    const idx = [];
    for (let ri = 0; ri < rows - 1; ri++) {
      for (let a = 0; a < across - 1; a++) {
        const p = ri * across + a;
        const q = p + across;
        if (side > 0) idx.push(p, p + 1, q, q, p + 1, q + 1);
        else idx.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.roadMat(lanes, dual));
    mesh.receiveShadow = true;
    mesh.userData.ownGeo = true;
    g.add(mesh);
  }

  #barrier(g, i0, i1) {
    const r = this.route;
    const rows = i1 - i0 + 1;
    const prof = [[-0.22, 0], [-0.08, 0.8], [0.08, 0.8], [0.22, 0]];
    const pos = [];
    const fr = {};
    for (let ri = 0; ri < rows; ri++) {
      const s = (i0 + ri) * DS;
      r.frame(s, fr);
      const y = r.y[i0 + ri];
      for (const [d, h] of prof) pos.push(fr.x + fr.rx * d, y + h + 0.1, fr.z + fr.rz * d);
    }
    const idx = [];
    for (let ri = 0; ri < rows - 1; ri++) {
      for (let a = 0; a < 3; a++) {
        const p = ri * 4 + a, q = p + 4;
        idx.push(p, p + 1, q, q, p + 1, q + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.concreteMat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.ownGeo = true;
    g.add(m);
  }

  #scatter(g, ch, i0, i1, rnd) {
    const r = this.route;
    const dens = this.quality.trees;
    const lists = {};
    const push = (type, x, y, z, ry, s, sy = s) => {
      (lists[type] ||= []).push([x, y, z, ry, s, sy]);
    };
    const fr = {};
    for (let i = i0; i < i1; i += 2) {
      const s = i * DS;
      const bname = BIOME_NAMES[r.biome[i]];
      const mix = TREE_MIX[bname];
      const hw = r.median[i] / 2 + r.lanes[i] * LANE_W + SHOULDER;
      const town = r.town[i];
      for (const side of [-1, 1]) {
        const p = r.trees[i] * dens * 0.9;
        let n = Math.floor(p * 2.2 + rnd());
        for (let k = 0; k < n; k++) {
          const type = pick(mix, rnd());
          const minO = town > 0.25 ? 26 + town * 30 : type === 'maize' || type === 'tea' ? 10 : 7;
          const o = minO + Math.pow(rnd(), 1.6) * 320;
          const ss = s + rnd() * DS * 2;
          const d = side * (hw + o);
          r.frame(ss, fr);
          const x = fr.x + fr.rx * d, z = fr.z + fr.rz * d;
          const y = r.height(ss, d) - 0.15;
          const sc = 0.75 + rnd() * 0.6;
          if (type === 'maize') {
            for (let a = 0; a < 6; a++) {
              const dd = d + side * (a % 3) * 2.2;
              const s2 = ss + Math.floor(a / 3) * 2.2;
              r.frame(s2, fr);
              push('maize', fr.x + fr.rx * dd, r.height(s2, dd) - 0.1, fr.z + fr.rz * dd, rnd() * 6, 0.9 + rnd() * 0.3);
            }
          } else if (type === 'tea') {
            const rot = Math.atan2(fr.tx, fr.tz);
            for (let a = 0; a < 3; a++) {
              const dd = d + side * a * 1.8;
              push('tea', fr.x + fr.rx * dd, r.height(ss, dd) - 0.1, fr.z + fr.rz * dd, rot, 1);
            }
          } else {
            push(type, x, y, z, rnd() * Math.PI * 2, sc);
          }
        }
      }
      // power poles along the left verge (rural) every ~64 m
      if ((i % 16) === 0 && r.town[i] < 0.5 && r.biome[i] !== BIOMES.forest.id) {
        const d = -(hw + 7);
        r.frame(s, fr);
        push('pole', fr.x + fr.rx * d, r.height(s, d) - 0.2, fr.z + fr.rz * d, Math.atan2(fr.tx, fr.tz), 1);
      }
      // street lights in built-up areas
      if ((i % 10) === 0 && town > 0.45) {
        for (const side of [-1, 1]) {
          const d = side * (hw + 1.4);
          r.frame(s, fr);
          const rot = Math.atan2(-side * fr.rx, -side * fr.rz);
          const x = fr.x + fr.rx * d, z = fr.z + fr.rz * d, y = r.height(s, d);
          push('streetlight', x, y, z, rot, 1);
          push('lamphead', x, y, z, rot, 1);
        }
      }
      // guard rails on mountain sections
      const b = r.biome[i];
      if ((b === BIOMES.forest.id || b === BIOMES.riftvalley.id || b === BIOMES.highland.id) && Math.abs(r.curv[i]) > 0.0018 && town < 0.3) {
        for (let k = 0; k < 2; k++) {
          const sk = s + k * DS;
          r.frame(sk, fr);
          for (const side of [-1, 1]) {
            const d = side * (hw + 0.9);
            push('rail', fr.x + fr.rx * d, r.height(sk, d) - 0.05, fr.z + fr.rz * d, Math.atan2(fr.tx, fr.tz) + (side > 0 ? Math.PI : 0), 1);
          }
        }
      }
      // roadside kiosks / fruit stalls on the edge of towns
      if (town > 0.12 && town < 0.8 && rnd() < 0.08) {
        const side = rnd() < 0.5 ? -1 : 1;
        const d = side * (hw + 5 + rnd() * 4);
        r.frame(s, fr);
        const rot = Math.atan2(-side * fr.rx, -side * fr.rz);
        push(rnd() < 0.5 ? 'kiosk' : 'stall', fr.x + fr.rx * d, r.height(s, d) - 0.05, fr.z + fr.rz * d, rot, 1);
      }
    }
    // speed bumps that fall in this chunk
    for (const bs of this.bumps) {
      if (bs < i0 * DS || bs >= i1 * DS) continue;
      r.frame(bs, fr);
      const hwr = r.halfWidth(bs);
      push('bump', fr.x, r.height(bs, 0) + 0.0, fr.z, Math.atan2(fr.tx, fr.tz), 1, 1);
      (lists.bump.at(-1)).push(hwr * 2);
    }

    const dummy = new THREE.Object3D();
    for (const [type, items] of Object.entries(lists)) {
      const geo = this.props[type];
      if (!geo) continue;
      const mat = type === 'lamphead' ? MAT.lamp : MAT.props;
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach(([x, y, z, ry, s, sy, wx], k) => {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        if (type === 'bump') dummy.scale.set(wx, 1, 1);
        else dummy.scale.set(s, sy ?? s, s);
        dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
      });
      im.castShadow = !['bump', 'lamphead', 'maize', 'tea'].includes(type) && this.quality.shadows;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    }

    // wildlife herds in open country
    const bname = BIOME_NAMES[r.biome[i0]];
    const wild = { savanna: 0.35, riftvalley: 0.2, arid: 0.12 }[bname] || 0;
    if (r.town[i0] < 0.1 && rnd() < wild * this.quality.wildlife) {
      const kinds = bname === 'savanna' ? ['zebra', 'giraffe', 'elephant'] : bname === 'arid' ? ['giraffe', 'zebra'] : ['zebra', 'giraffe'];
      const kind = kinds[(rnd() * kinds.length) | 0];
      const count = kind === 'elephant' ? 3 + ((rnd() * 4) | 0) : 3 + ((rnd() * 6) | 0);
      const side = rnd() < 0.5 ? -1 : 1;
      const sc = i0 * DS + rnd() * CH * DS;
      const dc = side * (35 + rnd() * 120);
      for (let k = 0; k < count; k++) {
        const ss = sc + (rnd() - 0.5) * 40;
        const dd = dc + (rnd() - 0.5) * 30;
        r.frame(ss, fr);
        const m = this.animalTemplates[kind].clone();
        const y = r.height(ss, dd) - 0.05;
        m.position.set(fr.x + fr.rx * dd, y, fr.z + fr.rz * dd);
        const rot = rnd() * Math.PI * 2;
        m.rotation.y = rot;
        m.scale.setScalar(0.9 + rnd() * 0.25);
        g.add(m);
        ch.animals.push({ mesh: m, y, rot, phase: rnd() * 10, speed: 0.5 + rnd() });
      }
    }
  }

  #buildTown(g, i0, i1, rnd) {
    const r = this.route;
    const cityNear = r.waypoints.some((w, k) => w.kind === 'city' && Math.abs(r.wpS[k] - i0 * DS) < 9000 / r.scale + 900);
    const boxes = [];
    const signs = [];
    const fr = {};
    for (let i = i0; i < i1; i += 3) {
      const t = r.town[i];
      if (t < 0.18) continue;
      const s = i * DS;
      const hw = r.median[i] / 2 + r.lanes[i] * LANE_W + SHOULDER;
      for (const side of [-1, 1]) {
        if (rnd() > t * 1.1) continue;
        for (let row = 0; row < (t > 0.6 ? 3 : t > 0.35 ? 2 : 1); row++) {
          const w = 7 + rnd() * 9;
          const dpt = 7 + rnd() * 8;
          const maxF = cityNear ? 2 + Math.pow(t, 3) * 16 : 1 + t * 3;
          const floors = Math.max(1, Math.round(1 + rnd() * (maxF - 1) * (row === 0 ? 0.7 : 1)));
          const o = 10 + t * 4 + row * 24 + rnd() * 5 + dpt / 2;
          const d = side * (hw + o);
          const ss = s + rnd() * 6;
          r.frame(ss, fr);
          const x = fr.x + fr.rx * d, z = fr.z + fr.rz * d;
          const y = Math.min(r.height(ss, d - side * dpt / 2), r.height(ss, d + side * dpt / 2)) - 0.3;
          const rot = Math.atan2(-side * fr.rx, -side * fr.rz);
          const color = new THREE.Color(WALL_COLORS[(rnd() * WALL_COLORS.length) | 0]);
          boxes.push({ x, y, z, w, d: dpt, floors, rot, color, shop: row === 0 && floors < 6, rnd: rnd() });
          if (row === 0 && floors < 6 && rnd() < 0.85) signs.push({ x, y, z, w, d: dpt, rot, cell: (rnd() * 64) | 0 });
        }
      }
    }
    if (!boxes.length) return;
    const geo = buildingsGeometry(boxes);
    const mesh = new THREE.Mesh(geo, this.facadeMat);
    mesh.castShadow = this.quality.shadows;
    mesh.receiveShadow = true;
    mesh.userData.ownGeo = true;
    g.add(mesh);
    if (signs.length) {
      const sg = signsGeometry(signs);
      const sm = new THREE.Mesh(sg, this.shopMat);
      sm.userData.ownGeo = true;
      g.add(sm);
    }
  }

  #buildEvents(g, s0, s1) {
    const r = this.route;
    const fr = {};
    for (const e of this.events) {
      if (e.s < s0 || e.s >= s1) continue;
      r.frame(e.s, fr);
      const hw = r.halfWidth(e.s) + SHOULDER;
      const side = e.side ?? -1;
      const facing = e.facing ?? 1; // +1: readable by traffic travelling +s
      if (e.type === 'km') {
        const d = side * (hw + 1.2);
        const tex = kmPostTexture(e.km, r.highway.code);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, 0.2), [this.postMat, this.postMat, this.postMat, this.postMat, this.signMat(tex), this.signMat(tex)]);
        m.userData.ownGeo = true;
        m.position.set(fr.x + fr.rx * d, r.height(e.s, d) + 0.5, fr.z + fr.rz * d);
        m.rotation.y = Math.atan2(-fr.tx, -fr.tz);
        m.castShadow = true;
        g.add(m);
        continue;
      }
      if (e.type === 'weighbridge') {
        this.#weighbridge(g, e.s);
        continue;
      }
      if (e.type === 'border') {
        this.#borderPost(g, e.s, e.country);
        continue;
      }
      // sign on posts
      const d = side * (hw + 1.6 + e.w / 2);
      const x = fr.x + fr.rx * d, z = fr.z + fr.rz * d;
      const y = r.height(e.s, d);
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.rotation.y = Math.atan2(-fr.tx * facing, -fr.tz * facing);
      const isRound = e.type === 'speed';
      const boardY = e.type === 'dir' || e.type === 'board' ? 2.0 + e.h / 2 : 2.2;
      let face;
      if (isRound) face = new THREE.CircleGeometry(e.w / 2, 32);
      else face = new THREE.PlaneGeometry(e.w, e.h);
      const fm = new THREE.Mesh(face, this.signMat(e.tex));
      fm.position.set(0, boardY, 0.05);
      fm.userData.ownGeo = true;
      const back = new THREE.Mesh(isRound ? new THREE.CircleGeometry(e.w / 2, 24) : new THREE.PlaneGeometry(e.w, e.h), this.signBackMat);
      back.position.set(0, boardY, 0.0);
      back.rotation.y = Math.PI;
      back.userData.ownGeo = true;
      grp.add(fm, back);
      const posts = e.w > 2 ? [-e.w * 0.35, e.w * 0.35] : [0];
      for (const px of posts) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, boardY + e.h / 2, 6), this.postMat);
        p.position.set(px, (boardY + e.h / 2) / 2, -0.06);
        p.castShadow = true;
        p.userData.ownGeo = true;
        grp.add(p);
      }
      fm.castShadow = true;
      g.add(grp);
    }
  }

  #weighbridge(g, s) {
    const r = this.route;
    const fr = r.frame(s);
    const hw = r.halfWidth(s) + SHOULDER;
    const d = -(hw + 14);
    const grp = new THREE.Group();
    grp.position.set(fr.x + fr.rx * d, r.height(s, d), fr.z + fr.rz * d);
    grp.rotation.y = Math.atan2(fr.tx, fr.tz);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 26), this.concreteMat);
    deck.position.y = 0.15;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 30), new THREE.MeshStandardMaterial({ color: 0x0b6a3a, roughness: 0.5, metalness: 0.4 }));
    roof.position.y = 6;
    roof.castShadow = true;
    grp.add(deck, roof);
    for (const z of [-13, 0, 13]) for (const x of [-3.6, 3.6]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), this.postMat);
      c.position.set(x, 3, z);
      grp.add(c);
    }
    const hut = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 6), new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 0.8 }));
    hut.position.set(7, 1.5, 0);
    hut.castShadow = true;
    grp.add(hut);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), this.signMat(boardTexture(['KeNHA WEIGHBRIDGE'], '#0b6a3a', '#fff', 512, 96)));
    label.position.set(-3.65, 5.2, 0);
    label.rotation.y = -Math.PI / 2;
    grp.add(label);
    grp.traverse((o) => { if (o.isMesh) o.userData.ownGeo = true; });
    g.add(grp);
  }

  #borderPost(g, s, country) {
    const r = this.route;
    const fr = r.frame(s);
    const hw = r.halfWidth(s) + SHOULDER;
    const grp = new THREE.Group();
    grp.position.set(fr.x, r.y[r.idx(s)], fr.z);
    grp.rotation.y = Math.atan2(fr.tx, fr.tz);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 10, 0.6, 18), canopyMat);
    canopy.position.y = 7;
    canopy.castShadow = true;
    grp.add(canopy);
    for (const x of [-hw - 4, -2, 2, hw + 4]) for (const z of [-7, 7]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), this.concreteMat);
      c.position.set(x, 3.5, z);
      c.castShadow = true;
      grp.add(c);
    }
    const band = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 8, 1.4), this.signMat(boardTexture([`KENYA · ${country.toUpperCase()} — ONE STOP BORDER POST`], '#0b6a3a', '#fff', 1024, 96)));
    band.position.set(0, 7, 9.05);
    grp.add(band);
    const band2 = band.clone();
    band2.position.z = -9.05;
    band2.rotation.y = Math.PI;
    grp.add(band2);
    for (const side of [-1, 1]) {
      const office = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 16), new THREE.MeshStandardMaterial({ color: 0xe7d3b0, roughness: 0.8 }));
      office.position.set(side * (hw + 14), 2, 0);
      office.castShadow = true;
      grp.add(office);
    }
    // flags
    const flagMat = new THREE.MeshStandardMaterial({ map: kenyaFlagTexture(), side: THREE.DoubleSide, roughness: 0.8 });
    for (const x of [-hw - 8, hw + 8]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 10, 6), this.postMat);
      pole.position.set(x, 5, 10);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6, 8, 1), flagMat);
      flag.position.set(x + 1.2, 9, 10);
      grp.add(pole, flag);
    }
    // boom barriers
    for (const side of [-1, 1]) {
      const boom = new THREE.Mesh(new THREE.BoxGeometry(hw - 0.5, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0xd0021b }));
      boom.position.set(side * (hw / 2), 1.1, side * 4);
      grp.add(boom);
    }
    grp.traverse((o) => { if (o.isMesh) o.userData.ownGeo = true; });
    g.add(grp);
  }
}

// ---------------------------------------------------------------- building geometry
const CELL = 0.25;
function cellUV(gx, gy) {
  // atlas cell -> [u0, v0, u1, v1] (canvas y grows downward; texture v upward)
  return [gx * CELL + 0.003, 1 - (gy + 1) * CELL + 0.003, (gx + 1) * CELL - 0.003, 1 - gy * CELL - 0.003];
}

function buildingsGeometry(boxes) {
  const pos = [], nor = [], uv = [], col = [];
  const _v = new THREE.Vector3();
  const quad = (corners, n, uvr, c, rot, ox, oy, oz) => {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const tr = (p) => [ox + p[0] * cs + p[2] * sn, oy + p[1], oz - p[0] * sn + p[2] * cs];
    const nn = [n[0] * cs + n[2] * sn, n[1], -n[0] * sn + n[2] * cs];
    const [a, b, cc, d] = corners.map(tr);
    const [u0, v0, u1, v1] = uvr;
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(...[a, b, cc, d][k]);
      nor.push(...nn);
      uv.push(...uvs[k]);
      col.push(c.r, c.g, c.b);
    }
  };
  for (const B of boxes) {
    const hw = B.w / 2, hd = B.d / 2;
    const FH = 3.2;
    for (let f = 0; f < B.floors; f++) {
      const y0 = f * FH, y1 = y0 + FH;
      const gy = f === 0 && B.shop ? 2 + (B.rnd > 0.5 ? 1 : 0) : (B.rnd * 7 + f) % 2 < 1 ? 0 : 1;
      const gx = f === 0 && B.shop ? ((B.rnd * 13) | 0) % 4 : 1 + (((B.rnd * 29) | 0) % 3);
      const front = cellUV(gx, gy);
      const sideC = cellUV(B.floors > 3 ? gx : 0, B.floors > 3 ? gy % 2 : 0);
      const c = B.color;
      // front (+z faces the road)
      quad([[-hw, y0, hd], [hw, y0, hd], [hw, y1, hd], [-hw, y1, hd]], [0, 0, 1], front, c, B.rot, B.x, B.y, B.z);
      quad([[hw, y0, -hd], [-hw, y0, -hd], [-hw, y1, -hd], [hw, y1, -hd]], [0, 0, -1], cellUV(B.floors > 3 ? gx : 0, B.floors > 3 ? gy % 2 : 0), c, B.rot, B.x, B.y, B.z);
      quad([[hw, y0, hd], [hw, y0, -hd], [hw, y1, -hd], [hw, y1, hd]], [1, 0, 0], sideC, c, B.rot, B.x, B.y, B.z);
      quad([[-hw, y0, -hd], [-hw, y0, hd], [-hw, y1, hd], [-hw, y1, -hd]], [-1, 0, 0], sideC, c, B.rot, B.x, B.y, B.z);
    }
    const top = B.floors * FH;
    const roofC = B.floors <= 2 ? new THREE.Color(B.rnd > 0.5 ? 0x8d9399 : 0x9c4a2a) : new THREE.Color(0x9a9690);
    const plain = cellUV(0, 0);
    if (B.floors <= 2) {
      // low-pitched corrugated roof
      const ph = 0.9;
      quad([[-hw - 0.3, top, hd + 0.5], [hw + 0.3, top, hd + 0.5], [hw + 0.3, top + ph, 0], [-hw - 0.3, top + ph, 0]], [0, 0.9, 0.45], plain, roofC, B.rot, B.x, B.y, B.z);
      quad([[hw + 0.3, top, -hd - 0.5], [-hw - 0.3, top, -hd - 0.5], [-hw - 0.3, top + ph, 0], [hw + 0.3, top + ph, 0]], [0, 0.9, -0.45], plain, roofC, B.rot, B.x, B.y, B.z);
      quad([[hw, top, hd], [hw, top, -hd], [hw, top + ph, 0], [hw, top + ph, 0]], [1, 0, 0], plain, B.color, B.rot, B.x, B.y, B.z);
      quad([[-hw, top, -hd], [-hw, top, hd], [-hw, top + ph, 0], [-hw, top + ph, 0]], [-1, 0, 0], plain, B.color, B.rot, B.x, B.y, B.z);
    } else {
      quad([[-hw, top, hd], [hw, top, hd], [hw, top, -hd], [-hw, top, -hd]], [0, 1, 0], plain, roofC, B.rot, B.x, B.y, B.z);
      // parapet + water tank
      quad([[-hw, top, hd], [hw, top, hd], [hw, top + 0.8, hd], [-hw, top + 0.8, hd]], [0, 0, 1], plain, B.color, B.rot, B.x, B.y, B.z);
    }
  }
  void _v;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function signsGeometry(signs) {
  const pos = [], nor = [], uv = [];
  for (const S of signs) {
    const w = Math.min(S.w - 0.6, 6), h = 1.0;
    const y = 3.0;
    const z = S.d / 2 + 0.06;
    const cs = Math.cos(S.rot), sn = Math.sin(S.rot);
    const tr = (x, yy, zz) => [S.x + x * cs + zz * sn, S.y + yy, S.z - x * sn + zz * cs];
    const row = S.cell >> 2, colI = S.cell & 3;
    const u0 = colI / 4, u1 = (colI + 1) / 4;
    const v1 = 1 - row / 16, v0 = 1 - (row + 1) / 16;
    const P = [tr(-w / 2, y - h / 2, z), tr(w / 2, y - h / 2, z), tr(w / 2, y + h / 2, z), tr(-w / 2, y + h / 2, z)];
    const U = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const n = [sn, 0, cs];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(...P[k]);
      nor.push(...n);
      uv.push(...U[k]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
