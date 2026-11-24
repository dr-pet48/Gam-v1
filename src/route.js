// Turns a highway definition into a drivable centre-line: a dense, evenly
// spaced array of samples (position, heading, elevation, lane layout,
// landscape parameters) that every other system queries by arc length `s`.

import { fbm1, fbm2 } from './noise.js';

export const DS = 4; // metres between samples
export const LANE_W = 3.6;
export const SHOULDER = 2.2;

const R_EARTH = 6371000;

export const BIOMES = {
  urban: { id: 0, amp: 6, hill: 3, trees: 0.25, color: [0.47, 0.41, 0.33], alt: [0.36, 0.42, 0.24], curvy: 0.4, verge: [0.42, 0.3, 0.2] },
  coastal: { id: 1, amp: 10, hill: 3, trees: 0.9, color: [0.3, 0.46, 0.18], alt: [0.72, 0.64, 0.46], curvy: 0.6, verge: [0.62, 0.52, 0.36] },
  savanna: { id: 2, amp: 22, hill: 5, trees: 0.45, color: [0.66, 0.55, 0.32], alt: [0.6, 0.32, 0.18], curvy: 0.5, verge: [0.62, 0.3, 0.17] },
  highland: { id: 3, amp: 55, hill: 10, trees: 0.8, color: [0.22, 0.42, 0.14], alt: [0.32, 0.48, 0.18], curvy: 1.0, verge: [0.5, 0.27, 0.16] },
  forest: { id: 4, amp: 65, hill: 12, trees: 1.0, color: [0.14, 0.3, 0.1], alt: [0.2, 0.36, 0.13], curvy: 1.3, verge: [0.42, 0.24, 0.15] },
  riftvalley: { id: 5, amp: 45, hill: 7, trees: 0.5, color: [0.64, 0.58, 0.34], alt: [0.48, 0.48, 0.26], curvy: 0.8, verge: [0.55, 0.42, 0.28] },
  farmland: { id: 6, amp: 30, hill: 7, trees: 0.6, color: [0.3, 0.48, 0.17], alt: [0.5, 0.4, 0.24], curvy: 0.7, verge: [0.52, 0.3, 0.18] },
  arid: { id: 7, amp: 18, hill: 4, trees: 0.25, color: [0.74, 0.62, 0.44], alt: [0.36, 0.3, 0.26], curvy: 0.45, verge: [0.66, 0.52, 0.36] },
};
export const BIOME_NAMES = Object.keys(BIOMES);

function haversine(a, b) {
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lon - a.lon) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export class Route {
  /**
   * @param {object} highway  entry from HIGHWAYS
   * @param {boolean} reverse drive from the last waypoint to the first
   * @param {number} scale    real metres per world metre (1 = real length)
   */
  constructor(highway, reverse = false, scale = 20) {
    this.highway = highway;
    this.reverse = reverse;
    this.scale = scale;
    this.seed = [...highway.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) + (reverse ? 101 : 0);

    // Waypoints in travel order; segment info always describes wp[i] -> wp[i+1].
    let wps = highway.waypoints.map((w) => ({ ...w }));
    if (reverse) {
      const orig = highway.waypoints;
      const n = orig.length;
      wps = orig.slice().reverse().map((w, i) => ({
        ...w,
        seg: i < n - 1 ? orig[n - 2 - i].seg : orig[0].seg,
      }));
    }
    this.waypoints = wps;

    // Real distances and winding factor.
    let straight = 0;
    const legs = [];
    for (let i = 0; i < wps.length - 1; i++) {
      const d = haversine(wps[i], wps[i + 1]);
      legs.push(d);
      straight += d;
    }
    const wind = highway.official && highway.lengthKm ? (highway.lengthKm * 1000) / straight : 1.16;
    this.realLengthKm = (straight * wind) / 1000;
    let acc = 0;
    wps[0].km = 0;
    legs.forEach((d, i) => {
      acc += d * wind;
      wps[i + 1].km = acc / 1000;
    });

    // Local planar projection (east = +x, north = -z).
    const lat0 = wps[0].lat;
    const lon0 = wps[0].lon;
    const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
    const kz = 110540;
    this.project = (lat, lon) => ({ x: ((lon - lon0) * kx) / scale, z: (-(lat - lat0) * kz) / scale });
    // World units per real metre along the road includes winding: we stretch
    // the road so that world length * scale ~= real road length.
    this.windFactor = wind;

    const minElev = Math.min(...wps.map((w) => w.elev));
    this.minElev = minElev;
    // Vertical exaggeration keeps grades realistic when distances are compressed.
    this.vScale = Math.min(1, Math.max(0.05, 2.4 / scale));

    this.#buildCenterline(legs, wind);
  }

  #buildCenterline(legs, wind) {
    const wps = this.waypoints;
    const seed = this.seed;
    // 1) control points: each leg is subdivided with lateral wiggle so the
    //    road meanders realistically between towns. Winding factor is
    //    honoured by adding enough lateral deviation to lengthen the path.
    const ctrl = [];
    const ctrlLeg = [];
    for (let i = 0; i < wps.length - 1; i++) {
      const a = this.project(wps[i].lat, wps[i].lon);
      const b = this.project(wps[i + 1].lat, wps[i + 1].lon);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const biome = BIOMES[wps[i].seg.biome];
      const spacing = 260 + 200 / biome.curvy;
      const n = Math.max(2, Math.round(len / spacing));
      const nx = -dz / len;
      const nz = dx / len;
      const amp = Math.min(len * 0.12, 30 + 55 * biome.curvy);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const env = Math.sin(Math.PI * t);
        const off = (fbm1((i * 97 + t * n) * 0.45, 3, seed) - 0.5) * 2 * amp * env;
        ctrl.push({ x: a.x + dx * t + nx * off, z: a.z + dz * t + nz * off });
        ctrlLeg.push(i + t);
      }
    }
    const last = this.project(wps[wps.length - 1].lat, wps[wps.length - 1].lon);
    ctrl.push(last);
    ctrlLeg.push(wps.length - 1);

    // 2) dense Catmull-Rom (centripetal) sampling.
    const dense = [];
    const P = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const steps = Math.max(4, Math.ceil(segLen / 2));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        dense.push({ ...catmull(p0, p1, p2, p3, t), leg: lerp(ctrlLeg[i], ctrlLeg[i + 1], t) });
      }
    }
    dense.push({ ...last, leg: wps.length - 1 });

    // 2b) low-pass the polyline so short legs between nearby towns don't
    //     produce hairpins (moving average, ~180 m window, ends pinned).
    {
      const n = dense.length;
      const R = 45;
      const px = new Float64Array(n + 1), pz = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) {
        px[i + 1] = px[i] + dense[i].x;
        pz[i + 1] = pz[i] + dense[i].z;
      }
      const sm = dense.map((p, i) => {
        const r = Math.min(R, i, n - 1 - i);
        const a = i - r, b = i + r;
        return { x: (px[b + 1] - px[a]) / (b - a + 1), z: (pz[b + 1] - pz[a]) / (b - a + 1), leg: p.leg };
      });
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) {
          px[i + 1] = px[i] + sm[i].x;
          pz[i + 1] = pz[i] + sm[i].z;
        }
        for (let i = 0; i < n; i++) {
          const r = Math.min(R, i, n - 1 - i);
          const a = i - r, b = i + r;
          sm[i] = { x: (px[b + 1] - px[a]) / (b - a + 1), z: (pz[b + 1] - pz[a]) / (b - a + 1), leg: sm[i].leg };
        }
      }
      for (let i = 0; i < n; i++) dense[i] = sm[i];
    }

    // 3) resample uniformly by arc length.
    const cum = [0];
    for (let i = 1; i < dense.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
    }
    const total = cum[cum.length - 1];
    const N = Math.floor(total / DS) + 1;
    this.N = N;
    this.length = (N - 1) * DS;
    const x = (this.x = new Float32Array(N));
    const z = (this.z = new Float32Array(N));
    const y = (this.y = new Float32Array(N));
    const tx = (this.tx = new Float32Array(N));
    const tz = (this.tz = new Float32Array(N));
    const leg = (this.leg = new Float32Array(N));
    const km = (this.km = new Float32Array(N));
    const elev = (this.elev = new Float32Array(N));
    const lanes = (this.lanes = new Uint8Array(N));
    const median = (this.median = new Float32Array(N));
    const limit = (this.limit = new Uint8Array(N));
    const biome = (this.biome = new Uint8Array(N));
    const amp = (this.amp = new Float32Array(N));
    const hill = (this.hill = new Float32Array(N));
    const trees = (this.trees = new Float32Array(N));
    const col = (this.col = new Float32Array(N * 3));
    const alt = (this.alt = new Float32Array(N * 3));
    const verge = (this.verge = new Float32Array(N * 3));
    const town = (this.town = new Float32Array(N)); // 0..1 built-up intensity

    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * DS;
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      x[i] = lerp(dense[j].x, dense[j + 1].x, f);
      z[i] = lerp(dense[j].z, dense[j + 1].z, f);
      leg[i] = lerp(dense[j].leg, dense[j + 1].leg, f);
    }
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(N - 1, i + 1);
      const dx = x[b] - x[a];
      const dz = z[b] - z[a];
      const l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l;
      tz[i] = dz / l;
    }

    // Per-sample attributes from the leg we are on.
    const townRadius = (w) => {
      const r = w.kind === 'city' ? 7000 : w.kind === 'border' ? 2200 : w.kind === 'town' ? 2400 : w.kind === 'weighbridge' ? 1600 : 900;
      return Math.max(r / this.scale, w.kind === 'city' ? 700 : w.kind === 'landmark' ? 0 : 260);
    };
    this.wpS = new Float32Array(wps.length); // arc length of each waypoint
    for (let w = 0; w < wps.length; w++) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < N; i += 1) {
        const d = Math.abs(leg[i] - w);
        if (d < bd) { bd = d; best = i; }
      }
      this.wpS[w] = best * DS;
    }

    for (let i = 0; i < N; i++) {
      const li = Math.min(wps.length - 2, Math.floor(leg[i]));
      const lf = Math.min(1, leg[i] - li);
      const A = wps[li];
      const B = wps[li + 1];
      km[i] = lerp(A.km, B.km, lf);
      elev[i] = lerp(A.elev, B.elev, lf);
      const seg = A.seg;
      lanes[i] = seg.lanes;
      median[i] = seg.dual ? (seg.biome === 'urban' ? 3 : 6) : 0;
      limit[i] = seg.limit;
      const bm = BIOMES[seg.biome];
      biome[i] = bm.id;
      amp[i] = bm.amp;
      hill[i] = bm.hill;
      trees[i] = bm.trees;
      for (let c = 0; c < 3; c++) {
        // palette is authored roughly in sRGB; vertex colours are linear (gamma 1.7 keeps the detail texture bright enough)
        col[i * 3 + c] = Math.pow(bm.color[c], 1.7);
        alt[i * 3 + c] = Math.pow(bm.alt[c], 1.7);
        verge[i * 3 + c] = Math.pow(bm.verge[c], 1.7);
      }
      // built-up intensity from nearby towns
      let t = 0;
      const s = i * DS;
      for (let w = 0; w < wps.length; w++) {
        const r = townRadius(wps[w]);
        if (r <= 0) continue;
        const d = Math.abs(s - this.wpS[w]);
        if (d < r) t = Math.max(t, 1 - smooth(d / r) ** 0.8 * 0.9 - (d / r) * 0.1);
      }
      town[i] = Math.max(0, t);
    }
    // Town speed limits (50 km/h in built-up areas).
    for (let i = 0; i < N; i++) if (town[i] > 0.55) limit[i] = Math.min(limit[i], 50);

    // Smooth landscape parameters so biomes blend over ~600 m.
    smoothArr(amp, 150);
    smoothArr(hill, 150);
    smoothArr(trees, 60);
    smoothArr(median, 40);
    smoothArr3(col, N, 150);
    smoothArr3(alt, N, 150);
    smoothArr3(verge, N, 80);

    // Elevation: real profile (scaled) + rolling hills.
    const vs = this.vScale;
    for (let i = 0; i < N; i++) {
      const s = i * DS;
      const roll = (fbm1(s / 950, 3, this.seed + 5) - 0.5) * 1.2 * hill[i];
      y[i] = (elev[i] - this.minElev) * vs + roll;
    }
    smoothArr(y, 60); // road grade smoothing
    smoothArr(y, 40);
    this.pitch = new Float32Array(N);
    this.curv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
      this.pitch[i] = (y[b] - y[a]) / ((b - a) * DS || 1);
      const cross = tx[a] * tz[b] - tz[a] * tx[b];
      this.curv[i] = cross / ((b - a) * DS || 1);
    }
  }

  idx(s) {
    return Math.max(0, Math.min(this.N - 1, Math.round(s / DS)));
  }

  /** Interpolated centre-line frame at arc length s. */
  frame(s, out = {}) {
    const f = Math.max(0, Math.min(this.N - 1.001, s / DS));
    const i = Math.floor(f);
    const t = f - i;
    out.x = lerp(this.x[i], this.x[i + 1], t);
    out.y = lerp(this.y[i], this.y[i + 1], t);
    out.z = lerp(this.z[i], this.z[i + 1], t);
    let hx = lerp(this.tx[i], this.tx[i + 1], t);
    let hz = lerp(this.tz[i], this.tz[i + 1], t);
    const l = Math.hypot(hx, hz) || 1;
    out.tx = hx / l;
    out.tz = hz / l;
    // right-hand normal (direction of travel = +s)
    out.rx = -out.tz;
    out.rz = out.tx;
    return out;
  }

  /** World position of a point d metres to the right of the centre-line. */
  point(s, d, out = {}) {
    this.frame(s, out);
    out.x += out.rx * d;
    out.z += out.rz * d;
    out.y = this.height(s, d);
    return out;
  }

  halfWidth(s) {
    const i = this.idx(s);
    return this.median[i] / 2 + this.lanes[i] * LANE_W;
  }

  /** Lateral centre of lane `lane` (0 = kerb-side) for a travel direction.
   *  Kenya drives on the LEFT: forward traffic (+s) uses negative d. */
  laneCenter(s, dir, lane) {
    const i = this.idx(s);
    const off = this.median[i] / 2 + (this.lanes[i] - 1 - Math.min(lane, this.lanes[i] - 1) + 0.5) * LANE_W;
    // lane 0 = outermost (slow lane), higher = towards centre (overtaking)
    return dir > 0 ? -off : off;
  }

  /** Terrain/road height for a point (s, d). Road is flat across its width. */
  height(s, d) {
    const f = Math.max(0, Math.min(this.N - 1.001, s / DS));
    const i = Math.floor(f);
    const t = f - i;
    const ry = lerp(this.y[i], this.y[i + 1], t);
    const ad = Math.abs(d);
    const hw = this.median[i] / 2 + this.lanes[i] * LANE_W + SHOULDER;
    if (ad <= hw) {
      // gentle camber
      return ry + 0.06 - (ad / hw) * 0.12 + (this.median[i] > 1 && ad < this.median[i] / 2 - 0.5 ? 0.15 : 0);
    }
    const amp = this.amp[i];
    const e = ad - hw;
    const ditch = -0.7 * Math.sin(Math.min(1, e / 7) * Math.PI) * (e < 7 ? 1 : 0);
    const blend = smooth(Math.min(1, Math.max(0, (e - 5) / 90)));
    const n =
      (fbm2(s / 260, d / 260, 4, this.seed) - 0.45) * amp +
      (fbm2(s / 60, d / 60, 2, this.seed + 3) - 0.5) * amp * 0.08;
    // escarpment feel in the Rift: one side rises, the other falls away
    const rift = this.biome[i] === BIOMES.riftvalley.id || this.biome[i] === BIOMES.forest.id ? Math.sign(d) * e * 0.06 * (amp / 45) : 0;
    const far = Math.min(1, e / 250) * amp * 0.4;
    return ry + ditch + blend * (n + rift + far);
  }

  /** Find the closest arc length to (x,z), searching around a guess. */
  locate(x, z, sGuess, out = {}) {
    let i0 = this.idx(sGuess);
    let best = i0;
    let bd = Infinity;
    const R = 40;
    for (let i = Math.max(0, i0 - R); i <= Math.min(this.N - 1, i0 + R); i++) {
      const dx = x - this.x[i];
      const dz = z - this.z[i];
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // refine by projecting onto local tangent
    const dx = x - this.x[best];
    const dz = z - this.z[best];
    const along = dx * this.tx[best] + dz * this.tz[best];
    const s = Math.max(0, Math.min(this.length, best * DS + along));
    const fr = this.frame(s);
    out.s = s;
    out.d = (x - fr.x) * fr.rx + (z - fr.z) * fr.rz;
    return out;
  }

  realKmAt(s) {
    const f = Math.max(0, Math.min(this.N - 1.001, s / DS));
    const i = Math.floor(f);
    return lerp(this.km[i], this.km[i + 1], f - i);
  }

  elevAt(s) {
    return this.elev[this.idx(s)];
  }

  /** index of the next waypoint ahead of s */
  nextWaypoint(s) {
    for (let w = 0; w < this.waypoints.length; w++) if (this.wpS[w] > s + 1) return w;
    return this.waypoints.length - 1;
  }

  prevWaypoint(s) {
    let p = 0;
    for (let w = 0; w < this.waypoints.length; w++) if (this.wpS[w] <= s + 1) p = w;
    return p;
  }
}

function catmull(p0, p1, p2, p3, t) {
  // centripetal Catmull-Rom
  const alpha = 0.5;
  const d01 = Math.pow(Math.hypot(p1.x - p0.x, p1.z - p0.z), alpha) || 1e-4;
  const d12 = Math.pow(Math.hypot(p2.x - p1.x, p2.z - p1.z), alpha) || 1e-4;
  const d23 = Math.pow(Math.hypot(p3.x - p2.x, p3.z - p2.z), alpha) || 1e-4;
  const t0 = 0, t1 = d01, t2 = t1 + d12, t3 = t2 + d23;
  const tt = t1 + (t2 - t1) * t;
  const C = (k) => {
    const A1 = lerpP(p0, p1, (tt - t0) / (t1 - t0), k);
    const A2 = lerpP(p1, p2, (tt - t1) / (t2 - t1), k);
    const A3 = lerpP(p2, p3, (tt - t2) / (t3 - t2), k);
    const B1 = A1 + (A2 - A1) * ((tt - t0) / (t2 - t0));
    const B2 = A2 + (A3 - A2) * ((tt - t1) / (t3 - t1));
    return B1 + (B2 - B1) * ((tt - t1) / (t2 - t1));
  };
  return { x: C('x'), z: C('z') };
}
const lerpP = (a, b, t, k) => a[k] + (b[k] - a[k]) * t;

function smoothArr(arr, radius) {
  const n = arr.length;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n - 1, i + radius);
    out[i] = (pre[b + 1] - pre[a]) / (b - a + 1);
  }
  arr.set(out);
}

function smoothArr3(arr, n, radius) {
  for (let c = 0; c < 3; c++) {
    const tmp = new Float32Array(n);
    for (let i = 0; i < n; i++) tmp[i] = arr[i * 3 + c];
    smoothArr(tmp, radius);
    for (let i = 0; i < n; i++) arr[i * 3 + c] = tmp[i];
  }
}
