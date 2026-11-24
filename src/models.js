// Procedural low-poly models: every drivable/AI vehicle class, wildlife and
// roadside props. Vehicle parts are merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { matatuLivery, coachLivery, containerTexture, zebraTexture, giraffeTexture } from './textures.js';
import { mulberry32 } from './noise.js';

// ---------------------------------------------------------------- materials
export const MAT = {};
export function initMaterials() {
  MAT.glass = new THREE.MeshPhysicalMaterial({ color: 0x15212b, metalness: 0.2, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.6 });
  MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 1, roughness: 0.12 });
  MAT.black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.55, metalness: 0.2 });
  MAT.plastic = new THREE.MeshStandardMaterial({ color: 0x222224, roughness: 0.8 });
  MAT.rubber = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  MAT.rim = new THREE.MeshStandardMaterial({ color: 0xbfc3c7, metalness: 0.9, roughness: 0.28 });
  MAT.wheel = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.6 });
  MAT.steel = new THREE.MeshStandardMaterial({ color: 0x5c6166, metalness: 0.7, roughness: 0.45 });
  MAT.tank = new THREE.MeshStandardMaterial({ color: 0xd8dcdf, metalness: 0.85, roughness: 0.22 });
  MAT.canvas = new THREE.MeshStandardMaterial({ color: 0xcbb98f, roughness: 0.95 });
  MAT.plateW = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
  MAT.plateY = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.5 });
  MAT.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d0, emissiveIntensity: 0.3, roughness: 0.1 });
  MAT.tail = new THREE.MeshStandardMaterial({ color: 0x660000, emissive: 0xff1a1a, emissiveIntensity: 0.25, roughness: 0.3 });
  MAT.amber = new THREE.MeshStandardMaterial({ color: 0x804000, emissive: 0xff9900, emissiveIntensity: 0.15 });
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0x4a2c1d, roughness: 0.7 });
  MAT.helmet = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.3, metalness: 0.2 });
  MAT.vestO = new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0x331100, roughness: 0.6 });
  MAT.vestG = new THREE.MeshStandardMaterial({ color: 0x9be22d, emissive: 0x1a2a00, roughness: 0.6 });
  MAT.jeans = new THREE.MeshStandardMaterial({ color: 0x23324a, roughness: 0.9 });
  MAT.props = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  MAT.lamp = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffd98a, emissiveIntensity: 0 });
}

const paintCache = new Map();
export function paint(hex) {
  if (!paintCache.has(hex)) {
    paintCache.set(
      hex,
      new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
    );
  }
  return paintCache.get(hex);
}
const flatCache = new Map();
function flat(hex, rough = 0.8) {
  const k = hex + ':' + rough;
  if (!flatCache.has(k)) flatCache.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
  return flatCache.get(k);
}
const texMatCache = new Map();
function texMat(t, rough = 0.45) {
  if (!texMatCache.has(t.uuid)) texMatCache.set(t.uuid, new THREE.MeshPhysicalMaterial({ map: t, roughness: rough, metalness: 0.2, clearcoat: 0.8 }));
  return texMatCache.get(t.uuid);
}

export const CAR_COLORS = [0xf2f2f2, 0xc0c4c8, 0x1c1c1e, 0x8a1c1c, 0x1f3f7a, 0x5a5f63, 0x2c5a2e, 0xd9c7a0, 0x0f6d8c, 0x9a9a9a, 0xb71c1c, 0xe9e2d0];

// ---------------------------------------------------------------- geometry helpers
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Box whose top face is scaled (sx, sz) and shifted (oz): cabins, bonnets. */
export function taperBox(w, h, d, sx = 1, sz = 1, oz = 0) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * sx);
      p.setZ(i, p.getZ(i) * sz + oz);
    }
  }
  g.computeVertexNormals();
  return g;
}

class Builder {
  constructor() {
    this.parts = new Map();
  }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }
  box(w, h, d, mat, x, y, z, rx, ry, rz) {
    return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
  }
  build(target = new THREE.Group()) {
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = mat !== MAT.glass;
      target.add(mesh);
    }
    return target;
  }
}

const wheelGeoCache = new Map();
/** One merged, vertex-coloured mesh per wheel (tyre + rim + hub [+ dual tyre]). */
function makeWheel(r, w, dual = false, inner = 1) {
  const key = r + ':' + w + ':' + dual + ':' + inner;
  if (!wheelGeoCache.has(key)) {
    const parts = [];
    const tint = (g, hex) => {
      g = g.toNonIndexed();
      const c = new THREE.Color(hex);
      const n = g.attributes.position.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      g.deleteAttribute('uv');
      return g;
    };
    const tyre = (x) => tint(new THREE.CylinderGeometry(r, r, w, 20, 1).rotateZ(Math.PI / 2).translate(x, 0, 0), 0x141414);
    parts.push(tyre(0));
    if (dual) parts.push(tyre(inner * w * 1.05));
    parts.push(tint(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 12, 1).rotateZ(Math.PI / 2), 0xb8bcc0));
    parts.push(tint(new THREE.CylinderGeometry(r * 0.2, r * 0.25, w + 0.06, 8, 1).rotateZ(Math.PI / 2), 0xe8e8e8));
    wheelGeoCache.set(key, mergeGeometries(parts));
  }
  const m = new THREE.Mesh(wheelGeoCache.get(key), MAT.wheel);
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function addWheels(group, wheels, list) {
  for (const [x, y, z, r, w, dual] of list) {
    const wg = makeWheel(r, w, dual, x > 0 ? -1 : 1);
    wg.rotation.order = 'YXZ';
    wg.position.set(x, y, z);
    group.add(wg);
    wheels.push(wg);
  }
}

function lights(b, { fz, rz, y, x, w = 0.34, h = 0.13, ry = y }) {
  b.box(w, h, 0.06, MAT.head, x, y, fz);
  b.box(w, h, 0.06, MAT.head, -x, y, fz);
  return b;
}

function plates(b, fz, rz, fy = 0.45, ry = 0.55) {
  b.box(0.52, 0.12, 0.02, MAT.plateW, 0, fy, fz + 0.01);
  b.box(0.52, 0.12, 0.02, MAT.plateY, 0, ry, rz - 0.01);
}

// ---------------------------------------------------------------- vehicles
/**
 * Build a vehicle model. Returns a Group (forward = +Z, origin on the
 * ground at the vehicle centre) with userData: { wheels, steer, tailMat,
 * trailer, lean }.
 */
export function buildVehicle(type, opts = {}) {
  const rnd = mulberry32(opts.seed ?? (Math.random() * 1e9) | 0);
  const color = opts.color ?? CAR_COLORS[(rnd() * CAR_COLORS.length) | 0];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wheels = [];
  const steerWheels = [];
  const tailMat = opts.player ? MAT.tail.clone() : MAT.tail;
  const b = new Builder();
  const P = paint(color);
  let trailer = null;
  let lean = null;

  switch (type) {
    case 'sedan': {
      b.add(taperBox(1.8, 0.6, 4.6, 0.97, 0.96), P, 0, 0.62, 0);
      b.add(taperBox(1.64, 0.5, 2.55, 0.8, 0.6, -0.12), MAT.glass, 0, 1.17, -0.25);
      b.add(taperBox(1.34, 0.05, 1.5, 0.95, 0.95), P, 0, 1.44, -0.33);
      b.box(1.84, 0.2, 0.3, MAT.plastic, 0, 0.42, 2.2);
      b.box(1.84, 0.22, 0.3, MAT.plastic, 0, 0.45, -2.2);
      b.box(0.8, 0.16, 0.04, MAT.black, 0, 0.66, 2.31);
      lights(b, { fz: 2.28, y: 0.76, x: 0.62 });
      b.box(0.38, 0.14, 0.05, tailMat, 0.62, 0.8, -2.28);
      b.box(0.38, 0.14, 0.05, tailMat, -0.62, 0.8, -2.28);
      b.box(0.12, 0.1, 0.22, P, 0.95, 1.05, 0.72);
      b.box(0.12, 0.1, 0.22, P, -0.95, 1.05, 0.72);
      plates(b, 2.36, -2.36, 0.45, 0.6);
      b.build(body);
      addWheels(root, wheels, [[0.8, 0.33, 1.4, 0.33, 0.22], [-0.8, 0.33, 1.4, 0.33, 0.22], [0.8, 0.33, -1.35, 0.33, 0.22], [-0.8, 0.33, -1.35, 0.33, 0.22]]);
      steerWheels.push(wheels[0], wheels[1]);
      break;
    }
    case 'safari': {
      const P2 = paint(opts.color ?? [0xd8c9a3, 0x3d4a2c, 0xece6d6, 0x6b5b3e][(rnd() * 4) | 0]);
      b.add(taperBox(1.95, 0.85, 4.8, 0.99, 0.97), P2, 0, 0.92, 0);
      b.add(taperBox(1.86, 0.6, 3.3, 0.96, 0.86, -0.15), MAT.glass, 0, 1.64, -0.55);
      b.box(1.8, 0.06, 2.9, P2, 0, 1.97, -0.7);
      // pop-top roof
      b.box(1.9, 0.08, 3.0, P2, 0, 2.42, -0.7);
      b.box(1.86, 0.4, 2.9, MAT.canvas, 0, 2.2, -0.7);
      for (const x of [-0.85, 0.85]) for (const z of [-2.1, 0.7]) b.box(0.05, 0.42, 0.05, MAT.black, x, 2.2, z);
      // bull bar, snorkel, spare wheel, rack
      b.box(1.7, 0.08, 0.08, MAT.black, 0, 0.75, 2.5);
      b.box(1.7, 0.08, 0.08, MAT.black, 0, 1.05, 2.5);
      for (const x of [-0.5, 0.5]) b.box(0.08, 0.5, 0.08, MAT.black, x, 0.85, 2.48);
      b.box(0.12, 1.1, 0.12, MAT.black, 0.98, 1.5, 1.2);
      b.add(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 16).rotateX(Math.PI / 2), MAT.rubber, 0, 1.0, -2.55);
      b.box(1.6, 0.12, 0.3, MAT.black, 0, 0.55, 2.45);
      b.box(1.6, 0.12, 0.3, MAT.black, 0, 0.55, -2.42);
      lights(b, { fz: 2.41, y: 1.0, x: 0.66, w: 0.3, h: 0.22 });
      b.box(0.2, 0.3, 0.05, tailMat, 0.82, 1.05, -2.41);
      b.box(0.2, 0.3, 0.05, tailMat, -0.82, 1.05, -2.41);
      plates(b, 2.6, -2.45, 0.75, 0.75);
      b.build(body);
      addWheels(root, wheels, [[0.86, 0.42, 1.45, 0.42, 0.3], [-0.86, 0.42, 1.45, 0.42, 0.3], [0.86, 0.42, -1.4, 0.42, 0.3], [-0.86, 0.42, -1.4, 0.42, 0.3]]);
      steerWheels.push(wheels[0], wheels[1]);
      break;
    }
    case 'pickup': {
      b.add(taperBox(1.85, 0.7, 5.3, 0.98, 0.98), P, 0, 0.8, 0);
      b.add(taperBox(1.74, 0.62, 2.5, 0.84, 0.72, -0.1), MAT.glass, 0, 1.46, 0.45);
      b.add(taperBox(1.46, 0.05, 1.7, 0.95, 0.95), P, 0, 1.78, 0.37);
      // load bed walls
      b.box(1.85, 0.45, 0.08, P, 0, 1.38, -0.85);
      b.box(0.08, 0.45, 1.8, P, 0.88, 1.38, -1.75);
      b.box(0.08, 0.45, 1.8, P, -0.88, 1.38, -1.75);
      b.box(1.85, 0.45, 0.08, P, 0, 1.38, -2.62);
      b.box(1.7, 0.02, 1.75, MAT.black, 0, 1.16, -1.75);
      // cargo (sacks)
      for (let i = 0; i < 5; i++) b.box(0.6, 0.3, 0.45, flat(0xe8e0c8, 0.95), (i % 3) * 0.55 - 0.55, 1.33 + (i > 2 ? 0.3 : 0), -1.4 - (i % 2) * 0.6);
      b.box(1.86, 0.2, 0.3, MAT.chrome, 0, 0.5, 2.62);
      b.box(1.86, 0.2, 0.25, MAT.black, 0, 0.55, -2.62);
      b.box(0.9, 0.22, 0.04, MAT.chrome, 0, 0.85, 2.66);
      lights(b, { fz: 2.64, y: 0.95, x: 0.66 });
      b.box(0.14, 0.4, 0.05, tailMat, 0.86, 1.25, -2.66);
      b.box(0.14, 0.4, 0.05, tailMat, -0.86, 1.25, -2.66);
      plates(b, 2.7, -2.7, 0.6, 0.65);
      b.build(body);
      addWheels(root, wheels, [[0.82, 0.38, 1.7, 0.38, 0.26], [-0.82, 0.38, 1.7, 0.38, 0.26], [0.82, 0.38, -1.5, 0.38, 0.26], [-0.82, 0.38, -1.5, 0.38, 0.26]]);
      steerWheels.push(wheels[0], wheels[1]);
      break;
    }
    case 'matatu': {
      const base = opts.color ?? [0xf2f2f2, 0x111111, 0xf2f2f2, 0x1d1d6b][(rnd() * 4) | 0];
      const P2 = paint(base);
      b.add(taperBox(1.9, 1.95, 5.3, 0.97, 0.9, -0.2), P2, 0, 1.3, 0);
      b.add(taperBox(1.93, 0.58, 3.8, 1, 1, 0), MAT.glass, 0, 1.72, -0.55);
      b.add(taperBox(1.72, 0.6, 0.12, 0.96, 1, -0.32), MAT.glass, 0, 1.7, 2.6);
      const liv = texMat(matatuLivery((rnd() * 8) | 0));
      const plane = new THREE.PlaneGeometry(4.6, 0.95);
      b.add(plane, liv, 0.962, 0.86, -0.2, 0, Math.PI / 2, 0);
      b.add(plane, liv, -0.962, 0.86, -0.2, 0, -Math.PI / 2, 0);
      b.box(1.7, 0.08, 3.6, MAT.black, 0, 2.33, -0.5); // roof rack
      b.box(1.92, 0.25, 0.3, MAT.chrome, 0, 0.45, 2.6);
      b.box(1.92, 0.25, 0.3, MAT.black, 0, 0.45, -2.6);
      b.box(1.0, 0.22, 0.04, MAT.black, 0, 0.78, 2.66);
      lights(b, { fz: 2.64, y: 0.95, x: 0.68, w: 0.36, h: 0.18 });
      b.box(0.18, 0.4, 0.05, tailMat, 0.84, 1.2, -2.66);
      b.box(0.18, 0.4, 0.05, tailMat, -0.84, 1.2, -2.66);
      b.box(1.6, 0.18, 0.02, flat(0xffd200, 0.5), 0, 1.65, -2.67); // rear yellow PSV band
      plates(b, 2.7, -2.7, 0.55, 0.75);
      b.build(body);
      addWheels(root, wheels, [[0.82, 0.36, 1.75, 0.36, 0.24], [-0.82, 0.36, 1.75, 0.36, 0.24], [0.82, 0.36, -1.45, 0.36, 0.24], [-0.82, 0.36, -1.45, 0.36, 0.24]]);
      steerWheels.push(wheels[0], wheels[1]);
      break;
    }
    case 'bus': {
      const li = (rnd() * 4) | 0;
      const baseCol = [0xf5f5f5, 0x0a2a66, 0xffffff, 0xffd200][li];
      const P2 = paint(baseCol);
      b.add(taperBox(2.5, 3.05, 12, 0.98, 0.99), P2, 0, 1.95, 0);
      b.box(2.52, 1.05, 10.2, MAT.glass, 0, 2.55, -0.4);
      b.add(taperBox(2.3, 1.5, 0.1, 1, 1, -0.15), MAT.glass, 0, 2.45, 6.0);
      const liv = texMat(coachLivery(li));
      const plane = new THREE.PlaneGeometry(11.6, 1.5);
      b.add(plane, liv, 1.262, 1.2, 0, 0, Math.PI / 2, 0);
      b.add(plane, liv, -1.262, 1.2, 0, 0, -Math.PI / 2, 0);
      b.box(2.5, 0.35, 0.2, MAT.black, 0, 0.6, 6.0);
      b.box(1.8, 0.5, 0.05, MAT.black, 0, 1.0, -6.02);
      lights(b, { fz: 6.03, y: 0.95, x: 0.95, w: 0.4, h: 0.2 });
      b.box(0.2, 0.6, 0.06, tailMat, 1.1, 1.3, -6.02);
      b.box(0.2, 0.6, 0.06, tailMat, -1.1, 1.3, -6.02);
      b.box(0.1, 0.1, 0.5, MAT.black, 1.3, 2.8, 5.8);
      b.box(0.1, 0.1, 0.5, MAT.black, -1.3, 2.8, 5.8);
      plates(b, 6.06, -6.06, 0.7, 0.75);
      b.build(body);
      addWheels(root, wheels, [[1.08, 0.52, 4.0, 0.52, 0.32], [-1.08, 0.52, 4.0, 0.52, 0.32], [1.0, 0.52, -3.2, 0.52, 0.32, true], [-1.0, 0.52, -3.2, 0.52, 0.32, true]]);
      steerWheels.push(wheels[0], wheels[1]);
      break;
    }
    case 'truck':
    case 'tanker': {
      const L = type === 'truck' ? 16.5 : 15;
      const cabCol = opts.color ?? [0xf2f2f2, 0xb71c1c, 0x1f3f7a, 0xe9a100, 0x2c5a2e][(rnd() * 5) | 0];
      const Pc = paint(cabCol);
      const front = L / 2;
      // tractor
      b.add(taperBox(2.5, 2.7, 2.3, 0.97, 0.94, -0.05), Pc, 0, 2.05, front - 1.2);
      b.add(taperBox(2.3, 0.9, 0.08, 1, 1, -0.06), MAT.glass, 0, 2.55, front - 0.05);
      b.box(2.52, 0.7, 1.2, MAT.glass, 0, 2.55, front - 1.0);
      b.box(2.4, 0.7, 0.1, MAT.black, 0, 1.25, front - 0.02);
      b.box(2.54, 0.35, 0.3, MAT.steel, 0, 0.72, front - 0.1);
      b.box(1.2, 0.8, 2.2, MAT.steel, 0, 2.8, front - 1.4); // air deflector base
      b.box(0.9, 0.6, 3.6, MAT.black, 0, 0.75, front - 4.0); // chassis
      b.add(new THREE.CylinderGeometry(0.1, 0.1, 2.3, 8), MAT.chrome, 1.15, 2.6, front - 2.55);
      b.add(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 12).rotateX(Math.PI / 2), MAT.chrome, 1.0, 0.8, front - 3.2);
      lights(b, { fz: front + 0.02, y: 0.95, x: 0.95, w: 0.36, h: 0.2 });
      b.box(0.14, 0.12, 0.3, MAT.amber, 0, 3.45, front - 0.4);
      b.box(0.12, 0.4, 0.35, MAT.black, 1.35, 2.5, front - 0.3);
      b.box(0.12, 0.4, 0.35, MAT.black, -1.35, 2.5, front - 0.3);
      plates(b, front + 0.05, -L / 2, 0.75, 0.75);
      b.build(body);
      addWheels(root, wheels, [[1.05, 0.52, front - 1.4, 0.52, 0.32], [-1.05, 0.52, front - 1.4, 0.52, 0.32], [0.95, 0.52, front - 5.0, 0.52, 0.3, true], [-0.95, 0.52, front - 5.0, 0.52, 0.3, true]]);
      steerWheels.push(wheels[0], wheels[1]);
      // trailer (pivots at the fifth wheel)
      const pivotZ = front - 4.6;
      trailer = new THREE.Group();
      trailer.position.set(0, 0, pivotZ);
      const tb = new Builder();
      const tl = pivotZ + L / 2 + 0.6; // trailer length behind pivot
      if (type === 'truck') {
        const cm = texMat(containerTexture((rnd() * 5) | 0), 0.6);
        tb.box(2.5, 0.25, tl, MAT.steel, 0, 1.3, -tl / 2 + 0.6);
        tb.add(new THREE.BoxGeometry(2.48, 2.6, tl - 0.4), cm, 0, 2.75, -tl / 2 + 0.6);
      } else {
        tb.box(2.2, 0.25, tl, MAT.steel, 0, 1.15, -tl / 2 + 0.6);
        tb.add(new THREE.CylinderGeometry(1.25, 1.25, tl - 0.6, 24, 1).rotateX(Math.PI / 2), MAT.tank, 0, 2.5, -tl / 2 + 0.6);
        tb.add(new THREE.CylinderGeometry(1.27, 1.27, 0.5, 24, 1).rotateX(Math.PI / 2), flat(0xc8102e, 0.4), 0, 2.5, -tl / 2 + 0.6);
        tb.box(0.6, 0.2, tl - 1.5, MAT.steel, 0, 3.8, -tl / 2 + 0.6);
        tb.box(1.0, 0.4, 0.06, flat(0xf47920, 0.5), 0, 2.1, -tl + 0.88);
      }
      tb.box(0.2, 0.35, 0.06, tailMat, 1.1, 0.9, -tl + 0.61);
      tb.box(0.2, 0.35, 0.06, tailMat, -1.1, 0.9, -tl + 0.61);
      tb.box(2.4, 0.15, 0.06, flat(0xff3b1f, 0.4), 0, 0.6, -tl + 0.62);
      tb.box(0.08, 1.0, 0.08, MAT.steel, 1.0, 0.6, -1.2);
      tb.box(0.08, 1.0, 0.08, MAT.steel, -1.0, 0.6, -1.2);
      tb.build(trailer);
      const tw = [];
      for (const z of [-tl + 2.2, -tl + 3.5, -tl + 4.8]) {
        tw.push([1.0, 0.5, z, 0.5, 0.3, true], [-1.0, 0.5, z, 0.5, 0.3, true]);
      }
      addWheels(trailer, wheels, tw);
      root.add(trailer);
      break;
    }
    case 'tuktuk': {
      const P2 = paint(opts.color ?? [0xffd200, 0x00843d, 0x1f3f7a, 0xc8102e][(rnd() * 4) | 0]);
      b.add(taperBox(1.3, 0.8, 2.6, 0.95, 0.9, -0.05), P2, 0, 0.7, -0.05);
      b.add(taperBox(0.7, 0.9, 0.5, 0.6, 0.6, -0.1), P2, 0, 0.75, 1.2);
      b.add(taperBox(1.32, 0.08, 2.1, 1, 1), MAT.black, 0, 1.72, -0.2);
      b.box(1.2, 0.6, 0.06, MAT.glass, 0, 1.4, 0.92, -0.25);
      for (const x of [-0.62, 0.62]) for (const z of [0.85, -1.2]) b.box(0.05, 0.65, 0.05, MAT.black, x, 1.4, z);
      b.box(1.25, 0.55, 0.05, MAT.black, 0, 1.4, -1.25);
      b.box(1.1, 0.35, 0.5, flat(0x3a2a20), 0, 1.05, -0.8);
      b.box(0.22, 0.12, 0.05, MAT.head, 0, 1.05, 1.47);
      b.box(0.2, 0.1, 0.05, tailMat, 0.5, 0.8, -1.37);
      b.box(0.2, 0.1, 0.05, tailMat, -0.5, 0.8, -1.37);
      plates(b, 1.47, -1.37, 0.5, 0.55);
      b.build(body);
      addWheels(root, wheels, [[0, 0.24, 1.1, 0.24, 0.12], [0.58, 0.24, -0.85, 0.24, 0.14], [-0.58, 0.24, -0.85, 0.24, 0.14]]);
      steerWheels.push(wheels[0]);
      break;
    }
    case 'boda': {
      lean = new THREE.Group();
      root.remove(body);
      root.add(lean);
      lean.add(body);
      const P2 = paint(opts.color ?? [0xc8102e, 0x111111, 0x1f3f7a, 0xe0e0e0][(rnd() * 4) | 0]);
      b.box(0.12, 0.12, 1.1, MAT.black, 0, 0.55, 0);
      b.add(taperBox(0.32, 0.2, 0.5, 0.8, 0.8), P2, 0, 0.82, 0.25);
      b.box(0.3, 0.1, 0.75, MAT.black, 0, 0.88, -0.35);
      b.box(0.28, 0.06, 0.5, flat(0xb71c1c, 0.6), 0, 0.95, -0.6); // passenger cushion
      b.box(0.35, 0.3, 0.3, MAT.steel, 0, 0.45, 0.05);
      b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6), MAT.chrome, 0, 0.75, 0.6, 0.35, 0, 0);
      b.box(0.7, 0.04, 0.04, MAT.black, 0, 1.08, 0.66);
      b.box(0.2, 0.16, 0.1, MAT.head, 0, 0.95, 0.78);
      b.box(0.14, 0.06, 0.05, tailMat, 0, 0.85, -0.95);
      b.add(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 8).rotateX(Math.PI / 2), MAT.chrome, 0.17, 0.45, -0.5);
      // rider
      const vest = rnd() > 0.5 ? MAT.vestO : MAT.vestG;
      b.add(taperBox(0.42, 0.62, 0.26, 0.9, 0.9), vest, 0, 1.33, -0.2, 0.25, 0, 0);
      b.add(new THREE.SphereGeometry(0.15, 12, 10), MAT.helmet, 0, 1.78, -0.05);
      b.box(0.1, 0.1, 0.55, vest, 0.22, 1.35, 0.15, -0.5);
      b.box(0.1, 0.1, 0.55, vest, -0.22, 1.35, 0.15, -0.5);
      b.box(0.14, 0.14, 0.5, MAT.jeans, 0.15, 0.95, -0.05, -0.2);
      b.box(0.14, 0.14, 0.5, MAT.jeans, -0.15, 0.95, -0.05, -0.2);
      b.box(0.12, 0.5, 0.12, MAT.jeans, 0.2, 0.62, 0.16);
      b.box(0.12, 0.5, 0.12, MAT.jeans, -0.2, 0.62, 0.16);
      b.build(body);
      addWheels(lean, wheels, [[0, 0.3, 0.65, 0.3, 0.1], [0, 0.3, -0.65, 0.3, 0.12]]);
      steerWheels.push(wheels[0]);
      break;
    }
    default:
      return buildVehicle('sedan', opts);
  }

  root.userData = { type, wheels, steerWheels, tailMat, trailer, lean, color };
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return root;
}

// ---------------------------------------------------------------- wildlife
export function buildAnimal(kind) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (kind === 'giraffe') {
    const mat = new THREE.MeshStandardMaterial({ map: giraffeTexture(), roughness: 0.9 });
    add(new THREE.BoxGeometry(0.8, 0.9, 1.8), mat, 0, 2.3, 0, 0.1, 0, 0);
    for (const [x, z] of [[0.28, 0.7], [-0.28, 0.7], [0.28, -0.7], [-0.28, -0.7]]) add(new THREE.BoxGeometry(0.14, 2.0, 0.14), mat, x, 1.0, z);
    add(new THREE.BoxGeometry(0.28, 2.4, 0.35), mat, 0, 3.6, 1.1, 0.45, 0, 0);
    add(new THREE.BoxGeometry(0.3, 0.3, 0.7), mat, 0, 4.7, 1.75, 0.2, 0, 0);
  } else if (kind === 'zebra') {
    const mat = new THREE.MeshStandardMaterial({ map: zebraTexture(), roughness: 0.9 });
    add(new THREE.BoxGeometry(0.6, 0.7, 1.5), mat, 0, 1.15, 0);
    for (const [x, z] of [[0.2, 0.55], [-0.2, 0.55], [0.2, -0.55], [-0.2, -0.55]]) add(new THREE.BoxGeometry(0.12, 0.85, 0.12), mat, x, 0.42, z);
    add(new THREE.BoxGeometry(0.25, 0.8, 0.35), mat, 0, 1.55, 0.85, 0.6, 0, 0);
    add(new THREE.BoxGeometry(0.22, 0.25, 0.6), mat, 0, 1.75, 1.2, 0.5, 0, 0);
    add(new THREE.BoxGeometry(0.06, 0.6, 0.06), MAT.black, 0, 1.0, -0.8, -0.3, 0, 0);
  } else {
    const mat = flat(0x7c746c, 0.95);
    add(new THREE.BoxGeometry(1.8, 1.9, 3.2), mat, 0, 2.4, 0);
    for (const [x, z] of [[0.6, 1.1], [-0.6, 1.1], [0.6, -1.1], [-0.6, -1.1]]) add(new THREE.CylinderGeometry(0.33, 0.36, 1.6, 8), mat, x, 0.8, z);
    add(new THREE.BoxGeometry(1.2, 1.3, 1.0), mat, 0, 2.8, 1.9);
    add(new THREE.BoxGeometry(0.1, 1.4, 1.1), mat, 0.75, 2.8, 1.6, 0, 0.3, 0);
    add(new THREE.BoxGeometry(0.1, 1.4, 1.1), mat, -0.75, 2.8, 1.6, 0, -0.3, 0);
    add(new THREE.CylinderGeometry(0.12, 0.22, 1.7, 8), mat, 0, 1.7, 2.45, 0.15, 0, 0);
    add(new THREE.ConeGeometry(0.07, 0.7, 6), flat(0xf3efe2, 0.5), 0.3, 2.2, 2.55, 1.2, 0, 0);
    add(new THREE.ConeGeometry(0.07, 0.7, 6), flat(0xf3efe2, 0.5), -0.3, 2.2, 2.55, 1.2, 0, 0);
  }
  return g;
}

// ---------------------------------------------------------------- props (vertex coloured)
function colored(geo, hex, jitter = 0, rnd = Math.random) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (rnd() - 0.5) * jitter;
    for (let k = 0; k < 3 && i + k < n; k++) {
      arr[(i + k) * 3] = c.r * j;
      arr[(i + k) * 3 + 1] = c.g * j;
      arr[(i + k) * 3 + 2] = c.b * j;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
function place(geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
  return geo.applyMatrix4(_m);
}

export function buildPropGeometries() {
  const rnd = mulberry32(1234);
  const G = {};
  const trunkC = 0x5a4030;
  // Acacia tortilis: umbrella crown
  {
    const parts = [];
    parts.push(colored(place(new THREE.CylinderGeometry(0.16, 0.28, 3.4, 6), 0.3, 1.7, 0, 0, 0, -0.18), trunkC));
    parts.push(colored(place(new THREE.CylinderGeometry(0.1, 0.15, 2.0, 5), -0.5, 3.3, 0, 0, 0, 0.7), trunkC));
    parts.push(colored(place(new THREE.CylinderGeometry(0.1, 0.15, 2.0, 5), 1.0, 3.2, 0.3, 0.3, 0, -0.7), trunkC));
    const crown = new THREE.SphereGeometry(1, 10, 6);
    crown.scale(4.2, 0.65, 3.6);
    parts.push(colored(place(crown, 0.2, 4.4, 0), 0x56662a, 0.25, rnd));
    const crown2 = new THREE.SphereGeometry(1, 8, 5);
    crown2.scale(2.4, 0.5, 2.2);
    parts.push(colored(place(crown2, -1.4, 4.1, 0.8), 0x4d5e26, 0.25, rnd));
    G.acacia = mergeGeometries(parts);
  }
  // Coconut palm
  {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.CylinderGeometry(0.17, 0.2, 2, 7);
      parts.push(colored(place(seg, i * 0.18, 1 + i * 1.98, 0, 0, 0, -0.09), 0x7a6a55, 0.2, rnd));
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const leaf = new THREE.BoxGeometry(0.5, 0.05, 3.6, 1, 1, 4);
      const p = leaf.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const z = p.getZ(k) + 1.8;
        p.setY(k, p.getY(k) - z * z * 0.12);
        p.setX(k, p.getX(k) * (1 - z / 4.5));
      }
      leaf.translate(0, 0, 1.8);
      leaf.rotateX(-0.2);
      leaf.rotateY(a);
      parts.push(colored(place(leaf, 0.9, 10.1, 0), 0x3f7a2a, 0.3, rnd));
    }
    parts.push(colored(place(new THREE.SphereGeometry(0.4, 6, 5), 0.9, 9.9, 0), 0x6b5a2a));
    G.palm = mergeGeometries(parts);
  }
  // Highland tree (eucalyptus / grevillea)
  {
    const parts = [];
    parts.push(colored(place(new THREE.CylinderGeometry(0.15, 0.3, 9, 6), 0, 4.5, 0), 0xbdb3a0));
    for (let i = 0; i < 5; i++) {
      const c = new THREE.IcosahedronGeometry(1.6 + rnd() * 0.8, 0);
      c.scale(1, 1.4, 1);
      parts.push(colored(place(c, (rnd() - 0.5) * 2, 8 + i * 1.3, (rnd() - 0.5) * 2), 0x3f5a2f, 0.3, rnd));
    }
    G.eucalyptus = mergeGeometries(parts);
  }
  // Cypress / pine (forest plantations)
  {
    const parts = [];
    parts.push(colored(place(new THREE.CylinderGeometry(0.15, 0.25, 3, 5), 0, 1.5, 0), trunkC));
    for (let i = 0; i < 4; i++) {
      parts.push(colored(place(new THREE.ConeGeometry(2.4 - i * 0.5, 3.2, 8), 0, 3 + i * 2.1, 0), 0x1f3a1c, 0.25, rnd));
    }
    G.cypress = mergeGeometries(parts);
  }
  // Baobab (Tsavo & coast)
  {
    const parts = [];
    parts.push(colored(place(new THREE.CylinderGeometry(1.1, 1.7, 7, 9), 0, 3.5, 0), 0x8a7d6e, 0.15, rnd));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd();
      parts.push(colored(place(new THREE.CylinderGeometry(0.15, 0.4, 3, 5), Math.cos(a) * 1.3, 7.8, Math.sin(a) * 1.3, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7), 0x7d7062));
      const c = new THREE.IcosahedronGeometry(0.9, 0);
      parts.push(colored(place(c, Math.cos(a) * 2.3, 9.0, Math.sin(a) * 2.3), 0x5d6b2c, 0.3, rnd));
    }
    G.baobab = mergeGeometries(parts);
  }
  // Bush
  {
    const c = new THREE.IcosahedronGeometry(1, 1);
    c.scale(1.4, 0.9, 1.3);
    G.bush = colored(place(c, 0, 0.6, 0), 0x55642e, 0.35, rnd);
  }
  // Candelabra euphorbia
  {
    const parts = [];
    parts.push(colored(place(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), 0, 1.5, 0), 0x4a5a2a));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 0.9 + rnd() * 0.6;
      parts.push(colored(place(new THREE.CylinderGeometry(0.15, 0.17, r, 5), Math.cos(a) * r * 0.5, 3.1, Math.sin(a) * r * 0.5, Math.sin(a) * 1.57, 0, -Math.cos(a) * 1.57), 0x3f6a2c));
      parts.push(colored(place(new THREE.CylinderGeometry(0.15, 0.17, 2.4, 5), Math.cos(a) * r, 4.2, Math.sin(a) * r), 0x47742f, 0.2, rnd));
    }
    G.euphorbia = mergeGeometries(parts);
  }
  // Banana plant
  {
    const parts = [];
    parts.push(colored(place(new THREE.CylinderGeometry(0.15, 0.2, 2, 6), 0, 1, 0), 0x6d7a3a));
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.BoxGeometry(0.6, 0.03, 2.0);
      leaf.translate(0, 0, 1);
      leaf.rotateX(-0.5 + rnd() * 0.3);
      leaf.rotateY((i / 6) * Math.PI * 2);
      parts.push(colored(place(leaf, 0, 2.1, 0), 0x4f8a2a, 0.3, rnd));
    }
    G.banana = mergeGeometries(parts);
  }
  // Maize clump
  {
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const st = new THREE.BoxGeometry(0.05, 2.2, 0.05);
      parts.push(colored(place(st, (i % 3) * 0.7 - 0.7, 1.1, Math.floor(i / 3) * 0.7 - 0.7, 0, 0, (rnd() - 0.5) * 0.1), 0x6f8a33));
      for (let k = 0; k < 3; k++) {
        const lf = new THREE.BoxGeometry(0.08, 0.02, 0.8);
        lf.translate(0, 0, 0.4);
        lf.rotateX(-0.4);
        lf.rotateY(rnd() * Math.PI * 2);
        parts.push(colored(place(lf, (i % 3) * 0.7 - 0.7, 0.8 + k * 0.5, Math.floor(i / 3) * 0.7 - 0.7), 0x7a9a3a, 0.3, rnd));
      }
    }
    G.maize = mergeGeometries(parts);
  }
  // Tea hedge row
  {
    const c = new THREE.BoxGeometry(1.2, 1, 7, 2, 2, 6);
    const p = c.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + (rnd() - 0.5) * 0.15);
    c.computeVertexNormals();
    G.tea = colored(place(c, 0, 0.5, 0), 0x4c9a2a, 0.15, rnd);
  }
  // Rock
  {
    const c = new THREE.DodecahedronGeometry(1, 0);
    c.scale(1.3, 0.7, 1);
    G.rock = colored(place(c, 0, 0.3, 0), 0x77706a, 0.3, rnd);
  }
  // Termite mound (red earth)
  {
    const parts = [];
    parts.push(colored(place(new THREE.ConeGeometry(1.1, 2.6, 7), 0, 1.3, 0), 0x9c4a26, 0.2, rnd));
    parts.push(colored(place(new THREE.ConeGeometry(0.35, 1.3, 5), 0.4, 2.3, 0.1, 0, 0, -0.15), 0x924323, 0.2, rnd));
    G.termite = mergeGeometries(parts);
  }
  // Wooden power pole
  {
    const parts = [];
    parts.push(colored(place(new THREE.CylinderGeometry(0.1, 0.13, 9, 6), 0, 4.5, 0), 0x6b5038));
    parts.push(colored(place(new THREE.BoxGeometry(1.8, 0.12, 0.12), 0, 8.5, 0), 0x5b4030));
    for (const x of [-0.75, 0, 0.75]) parts.push(colored(place(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 5), x, 8.68, 0), 0xdddddd));
    G.pole = mergeGeometries(parts);
  }
  // Street light pole (head added separately as emissive instance)
  {
    const parts = [];
    parts.push(colored(place(new THREE.CylinderGeometry(0.08, 0.12, 9, 6), 0, 4.5, 0), 0x8a8f94));
    parts.push(colored(place(new THREE.BoxGeometry(0.08, 0.08, 2.2), 0, 8.9, 1.0), 0x8a8f94));
    G.streetlight = mergeGeometries(parts);
    G.lamphead = place(new THREE.BoxGeometry(0.35, 0.12, 0.6), 0, 8.8, 2.0);
  }
  // Guard rail post + rail segment (length 4m)
  {
    const parts = [];
    parts.push(colored(place(new THREE.BoxGeometry(0.12, 0.8, 0.12), 0, 0.4, 0), 0x8a8f94));
    parts.push(colored(place(new THREE.BoxGeometry(0.05, 0.3, 4.05), -0.08, 0.65, 0), 0xc8ccd0));
    G.rail = mergeGeometries(parts);
  }
  // Kenyan roadside kiosk with corrugated roof
  {
    const parts = [];
    parts.push(colored(place(new THREE.BoxGeometry(2.4, 2.2, 2.4), 0, 1.1, 0), 0x2f8f4e));
    parts.push(colored(place(new THREE.BoxGeometry(2.8, 0.08, 2.9), 0, 2.4, 0.2, 0.12, 0, 0), 0x9aa0a6));
    parts.push(colored(place(new THREE.BoxGeometry(1.8, 0.8, 0.05), 0, 1.5, 1.22), 0x2a1f18));
    G.kiosk = mergeGeometries(parts);
  }
  // Fruit stall
  {
    const parts = [];
    parts.push(colored(place(new THREE.BoxGeometry(2.2, 0.9, 1.0), 0, 0.45, 0), 0x7a5a3a));
    for (let i = 0; i < 12; i++) parts.push(colored(place(new THREE.SphereGeometry(0.14, 6, 4), -0.9 + (i % 6) * 0.36, 1.0, -0.2 + Math.floor(i / 6) * 0.4), [0xff8c00, 0xc8102e, 0x7cbf2a][i % 3]));
    for (const [x, z] of [[-1, -0.4], [1, -0.4], [-1, 0.4], [1, 0.4]]) parts.push(colored(place(new THREE.BoxGeometry(0.06, 2, 0.06), x, 1, z), 0x5a4030));
    parts.push(colored(place(new THREE.BoxGeometry(2.5, 0.05, 1.5), 0, 2.0, 0), 0x1f6fbf));
    G.stall = mergeGeometries(parts);
  }
  // Speed bump (rumble) — Kenyan towns are full of them
  {
    const c = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false, 0, Math.PI);
    c.rotateZ(Math.PI / 2);
    c.scale(1, 0.14, 1);
    // painted stripes
    G.bump = colored(c, 0xdedc3a, 0.5, rnd);
  }
  return G;
}

/** Mountain silhouette geometry for horizon landmarks (unit height, base radius = w). */
export function mountainGeometry(snow, crater, seed) {
  const rnd = mulberry32(seed);
  const seg = 48, rings = 10;
  const pos = [];
  const col = [];
  const idx = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings; // 0 = base, 1 = summit
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const n = 1 + (rnd() - 0.5) * 0.18 * (1 - t);
      let radius = (1 - Math.pow(t, 0.7)) * n + (crater ? 0.12 : 0.02);
      let y = Math.pow(t, 1.25);
      if (crater && t > 0.92) y -= (t - 0.92) * 0.9;
      pos.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
      const shade = 0.55 + 0.45 * Math.max(0, Math.cos(a - 0.8));
      if (snow && t > 0.82) col.push(0.95 * shade + 0.05, 0.96 * shade + 0.04, 1.0 * shade);
      else col.push((0.32 + t * 0.1) * shade, (0.36 + t * 0.06) * shade, (0.3 + t * 0.05) * shade);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
