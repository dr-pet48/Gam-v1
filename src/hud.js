// Heads-up display: speedometer, route info, speed-limit sign, toasts and a
// minimap of Kenya's trunk-road network with the player's live position.
import { HIGHWAYS, BORDER_COUNTRIES } from './data/highways.js';

// Approximate national outline (lon, lat) for the minimap.
const KENYA_OUTLINE = [
  [39.22, -4.67], [37.70, -3.45], [37.60, -2.95], [36.80, -2.55], [34.0, -1.0], [33.95, 0.1], [34.1, 0.45],
  [34.28, 0.64], [34.55, 1.13], [34.8, 1.8], [35.0, 2.6], [34.6, 3.6], [33.95, 4.2], [34.4, 4.62], [35.9, 4.62],
  [36.05, 4.45], [37.0, 4.35], [38.1, 3.6], [39.05, 3.52], [40.0, 4.0], [41.0, 3.95], [41.9, 3.98], [41.0, 2.8],
  [41.0, -0.9], [41.56, -1.68], [40.9, -2.27], [40.12, -3.22], [39.67, -4.05], [39.22, -4.67],
];
const NEIGHBOURS = [
  ['UGANDA', 33.2, 1.6], ['TANZANIA', 35.6, -3.9], ['ETHIOPIA', 38.8, 4.5], ['SOMALIA', 41.9, 1.4],
  ['S. SUDAN', 34.2, 5.0], ['Indian Ocean', 40.6, -3.9],
];
const BOUNDS = { lon0: 33.0, lon1: 42.3, lat0: -5.0, lat1: 5.2 };

export class HUD {
  constructor(root) {
    this.root = root;
    this.el = (id) => root.querySelector('#' + id);
    this.speed = this.el('hud-speed');
    this.gear = this.el('hud-gear');
    this.gauge = this.el('hud-gauge');
    this.gctx = this.gauge.getContext('2d');
    this.mapC = this.el('hud-map');
    this.mctx = this.mapC.getContext('2d');
    this.toasts = this.el('hud-toasts');
    this.lastToast = new Map();
    this.mapBase = null;
  }

  setRoute(route) {
    this.route = route;
    const hw = route.highway;
    this.el('hud-code').textContent = hw.code;
    this.el('hud-name').textContent = hw.name;
    const w = route.waypoints;
    this.el('hud-trip').textContent = `${w[0].name} → ${w[w.length - 1].name} · ${Math.round(route.realLengthKm)} km`;
    this.mapBase = null;
  }

  toast(text, kind = 'info', key = text, cooldown = 8) {
    const now = performance.now() / 1000;
    if (this.lastToast.has(key) && now - this.lastToast.get(key) < cooldown) return;
    this.lastToast.set(key, now);
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    this.toasts.prepend(d);
    setTimeout(() => d.classList.add('out'), 4200);
    setTimeout(() => d.remove(), 5000);
    while (this.toasts.children.length > 4) this.toasts.lastChild.remove();
  }

  update(state) {
    const { player, route, hour, env } = state;
    const kmh = Math.abs(player.kmh);
    this.speed.textContent = Math.round(kmh);
    this.gear.textContent = player.gear < 0 ? 'R' : kmh < 1 && player.throttle === 0 ? 'N' : 'D' + player.gear;
    this.#gauge(kmh, player);

    const s = player.s;
    const km = route.realKmAt(s);
    const nw = route.nextWaypoint(s);
    const next = route.waypoints[nw];
    const prev = route.waypoints[route.prevWaypoint(s)];
    const remain = Math.max(0, next.km - km);
    this.el('hud-next').textContent = next.name;
    this.el('hud-next-km').textContent = remain < 10 ? remain.toFixed(1) + ' km' : Math.round(remain) + ' km';
    const total = route.realLengthKm;
    this.el('hud-progress').style.width = ((km / total) * 100).toFixed(2) + '%';
    this.el('hud-county').textContent = (route.town[route.idx(s)] > 0.5 ? prev.name + ', ' : '') + prev.county + ' County';
    this.el('hud-elev').textContent = Math.round(route.elevAt(s)) + ' m';
    this.el('hud-odo').textContent = km.toFixed(1) + ' / ' + Math.round(total) + ' km';
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    this.el('hud-clock').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    const limit = route.limit[route.idx(s)];
    const vehLimit = player.spec.governor ? Math.min(limit, 80) : limit;
    const sl = this.el('hud-limit');
    sl.textContent = vehLimit;
    sl.classList.toggle('over', kmh > vehLimit + 5);
    this.el('hud-damage').style.width = player.damage + '%';
    this.el('hud-gov').style.display = player.spec.governor ? '' : 'none';
    this.el('hud-gov').classList.toggle('off', !player.governorOn);
    this.el('hud-lights').classList.toggle('on', player.lightsOn);
    this.#map(route, player);
  }

  #gauge(kmh, player) {
    const c = this.gctx;
    const W = this.gauge.width, H = this.gauge.height;
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = W / 2 - 10;
    const max = Math.ceil(player.spec.topSpeed / 20) * 20;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    c.lineCap = 'round';
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath();
    c.arc(cx, cy, R, a0, a1);
    c.stroke();
    const f = Math.min(1, kmh / max);
    const grad = c.createLinearGradient(0, H, W, 0);
    grad.addColorStop(0, '#1fd17a');
    grad.addColorStop(0.6, '#ffd200');
    grad.addColorStop(1, '#ff3b30');
    c.strokeStyle = grad;
    c.beginPath();
    c.arc(cx, cy, R, a0, a0 + (a1 - a0) * f);
    c.stroke();
    // ticks
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.font = '600 11px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let v = 0; v <= max; v += 20) {
      const a = a0 + ((a1 - a0) * v) / max;
      c.fillText(String(v), cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
    }
    // rpm arc (inner)
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(255,255,255,0.1)';
    c.beginPath();
    c.arc(cx, cy, R - 40, a0, a1);
    c.stroke();
    c.strokeStyle = player.rpm > 0.9 ? '#ff3b30' : '#6cc8ff';
    c.beginPath();
    c.arc(cx, cy, R - 40, a0, a0 + (a1 - a0) * Math.min(1, player.rpm));
    c.stroke();
  }

  #proj(lon, lat, W, H) {
    const x = ((lon - BOUNDS.lon0) / (BOUNDS.lon1 - BOUNDS.lon0)) * W;
    const y = (1 - (lat - BOUNDS.lat0) / (BOUNDS.lat1 - BOUNDS.lat0)) * H;
    return [x, y];
  }

  #map(route, player) {
    const W = this.mapC.width, H = this.mapC.height;
    const c = this.mctx;
    if (!this.mapBase) {
      const off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      const o = off.getContext('2d');
      o.fillStyle = 'rgba(10,20,30,0.0)';
      o.fillRect(0, 0, W, H);
      // ocean
      o.fillStyle = 'rgba(40,90,140,0.35)';
      o.beginPath();
      const [ox, oy] = this.#proj(41.56, -1.68, W, H);
      o.moveTo(ox, oy);
      for (const [lon, lat] of [[40.9, -2.27], [40.12, -3.22], [39.67, -4.05], [39.22, -4.67], [39.22, -5.2], [42.5, -5.2], [42.5, -1.0]]) o.lineTo(...this.#proj(lon, lat, W, H));
      o.fill();
      // lake victoria & turkana (approx.)
      o.fillStyle = 'rgba(60,120,180,0.55)';
      o.beginPath();
      o.ellipse(...this.#proj(33.4, -0.6, W, H), 18, 24, 0, 0, Math.PI * 2);
      o.fill();
      o.beginPath();
      o.ellipse(...this.#proj(36.05, 3.5, W, H), 4, 26, 0.12, 0, Math.PI * 2);
      o.fill();
      // country
      o.fillStyle = 'rgba(255,255,255,0.07)';
      o.strokeStyle = 'rgba(255,255,255,0.45)';
      o.lineWidth = 1.2;
      o.beginPath();
      KENYA_OUTLINE.forEach(([lon, lat], k) => (k ? o.lineTo(...this.#proj(lon, lat, W, H)) : o.moveTo(...this.#proj(lon, lat, W, H))));
      o.fill();
      o.stroke();
      o.fillStyle = 'rgba(255,255,255,0.4)';
      o.font = '600 9px Inter, system-ui, sans-serif';
      o.textAlign = 'center';
      for (const [n, lon, lat] of NEIGHBOURS) o.fillText(n, ...this.#proj(lon, lat, W, H));
      // all highways
      for (const hw of HIGHWAYS) {
        const cur = hw.id === route.highway.id;
        o.strokeStyle = cur ? '#ffd200' : 'rgba(255,255,255,0.35)';
        o.lineWidth = cur ? 3 : 1.5;
        o.beginPath();
        hw.waypoints.forEach((w, k) => (k ? o.lineTo(...this.#proj(w.lon, w.lat, W, H)) : o.moveTo(...this.#proj(w.lon, w.lat, W, H))));
        o.stroke();
      }
      // towns on the current route
      for (const w of route.waypoints) {
        const [x, y] = this.#proj(w.lon, w.lat, W, H);
        o.fillStyle = w.kind === 'border' ? '#ff6b6b' : w.kind === 'city' ? '#fff' : 'rgba(255,255,255,0.7)';
        o.beginPath();
        o.arc(x, y, w.kind === 'city' ? 3.2 : 2, 0, Math.PI * 2);
        o.fill();
        if (w.kind === 'city' || w.kind === 'border') {
          o.fillStyle = 'rgba(255,255,255,0.85)';
          o.font = '600 9px Inter, system-ui, sans-serif';
          o.textAlign = 'left';
          o.fillText(w.name, x + 4, y - 3);
        }
      }
      // Nairobi always labelled
      o.fillStyle = '#fff';
      o.font = '700 9px Inter, system-ui, sans-serif';
      o.fillText('Nairobi', ...this.#proj(36.95, -1.2, W, H));
      this.mapBase = off;
    }
    c.clearRect(0, 0, W, H);
    c.drawImage(this.mapBase, 0, 0);
    // player position: interpolate lat/lon along current leg
    const leg = route.leg[route.idx(player.s)];
    const li = Math.min(route.waypoints.length - 2, Math.floor(leg));
    const f = leg - li;
    const A = route.waypoints[li], B = route.waypoints[li + 1];
    const [x, y] = this.#proj(A.lon + (B.lon - A.lon) * f, A.lat + (B.lat - A.lat) * f, W, H);
    const pulse = 4 + Math.sin(performance.now() / 200) * 1.5;
    c.fillStyle = 'rgba(31,209,122,0.35)';
    c.beginPath();
    c.arc(x, y, pulse + 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1fd17a';
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x, y, 4, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
}

export { BORDER_COUNTRIES };
