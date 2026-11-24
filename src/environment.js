// Sky, sun/moon lighting, clouds, fog, weather (rain, dust, highland mist)
// and the distant mountain skyline built from real peak positions.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { LANDMARKS } from './data/highways.js';
import { mountainGeometry } from './models.js';

const SKY_R = 18000;

// Adds a brightness gain to three's physical sky so it sits well under ACES.
function patchSky(sky) {
  const m = sky.material;
  m.uniforms.skyGain = { value: 0.5 };
  m.fragmentShader = m.fragmentShader
    .replace('uniform float mieDirectionalG;', 'uniform float mieDirectionalG;\nuniform float skyGain;')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyGain, 1.0 );');
  return sky;
}

export class Environment {
  constructor(scene, renderer, route, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.route = route;
    this.quality = quality;
    this.hour = 9;
    this.weather = 'clear';
    this.wet = 0;
    this.rainAmount = 0;
    this.mist = 0;

    this.sky = patchSky(new Sky());
    this.sky.scale.setScalar(SKY_R);
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality.shadows;
    const sm = quality.shadowMap;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a3a, 0.9);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xc8d6e5, 0.00045);

    this.#buildClouds();
    this.#buildStars();
    this.#buildRain();
    this.#buildLandmarks();

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = patchSky(new Sky());
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.lastEnvHour = -10;
    this.sunDir = new THREE.Vector3();
  }

  #buildClouds() {
    const geo = new THREE.SphereGeometry(SKY_R * 0.9, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
      uniforms: {
        time: { value: 0 },
        cover: { value: 0.45 },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        light: { value: new THREE.Color(1, 1, 1) },
        shadow: { value: new THREE.Color(0.6, 0.65, 0.72) },
        offset: { value: new THREE.Vector2() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float time; uniform float cover; uniform vec3 sunDir; uniform vec3 light; uniform vec3 shadow; uniform vec2 offset;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          if (vDir.y < 0.0) discard;
          vec2 uv = vDir.xz / (vDir.y + 0.12) * 1.6 + offset;
          float n = fbm(uv + vec2(time*0.004, time*0.002));
          float d = fbm(uv*2.0 + 4.0 - vec2(time*0.006, 0.0));
          float c = smoothstep(1.0 - cover, 1.0 - cover + 0.28, n * 0.75 + d * 0.35);
          float horizon = smoothstep(0.0, 0.18, vDir.y);
          float lit = clamp(0.55 + 0.45 * dot(normalize(vDir), sunDir) , 0.0, 1.0);
          vec3 col = mix(shadow, light, lit * (1.0 - d*0.5));
          gl_FragColor = vec4(col, c * horizon * 0.95);
          #include <colorspace_fragment>
        }`,
    });
    this.clouds = new THREE.Mesh(geo, this.cloudMat);
    this.clouds.renderOrder = -1;
    this.scene.add(this.clouds);
  }

  #buildStars() {
    const n = 2500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random() * 0.95 + 0.05;
      const th = u * Math.PI * 2, ph = Math.acos(v);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * SKY_R * 0.85;
      pos[i * 3 + 1] = Math.cos(ph) * SKY_R * 0.85;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * SKY_R * 0.85;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(g, this.starMat);
    this.scene.add(this.stars);
  }

  #buildRain() {
    const n = 9000;
    const pos = new Float32Array(n * 6);
    this.rainOff = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.rainOff[i * 3] = (Math.random() - 0.5) * 80;
      this.rainOff[i * 3 + 1] = Math.random() * 40;
      this.rainOff[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.45 });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  #buildLandmarks() {
    this.mountainMat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: { haze: { value: new THREE.Color(0xc8d6e5) }, amount: { value: 0.5 }, light: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 color; varying vec3 vC; varying float vH;
        void main(){ vC = color; vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 haze; uniform float amount; uniform float light; varying vec3 vC; varying float vH;
        void main(){ vec3 c = vC * light; float a = clamp(amount + (1.0 - vH) * 0.25, 0.0, 1.0);
          gl_FragColor = vec4(mix(c, haze, a), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.landmarks = LANDMARKS.map((L, i) => {
      const m = new THREE.Mesh(mountainGeometry(L.snow, L.crater, 50 + i), this.mountainMat.clone());
      m.frustumCulled = false;
      m.renderOrder = -0.5;
      const p = this.route.project(L.lat, L.lon);
      this.scene.add(m);
      return { ...L, mesh: m, wx: p.x, wz: p.z };
    });
  }

  setWeather(w) {
    this.weather = w;
  }

  /** hour 0..24 -> sun direction (Kenya ~ equator: sun rises due east ~06:30, sets ~18:45). */
  sunPosition(hour) {
    const t = (hour - 6.6) / 12.2; // 0 at sunrise, 1 at sunset
    const elev = Math.sin(t * Math.PI) * (Math.PI / 2) * 0.92;
    const az = Math.PI * t; // east -> west
    const dir = new THREE.Vector3(Math.cos(az), Math.sin(elev), -0.25).normalize(); // +x = east
    return { dir, elev: Math.sin(t * Math.PI) * 90 * 0.92, t };
  }

  update(dt, camera, playerPos, s, time) {
    const route = this.route;
    // Weather targets
    const i = route.idx(s);
    const elevReal = route.elev[i];
    const targetRain = this.weather === 'rain' ? 1 : this.weather === 'storm' ? 1.4 : 0;
    this.rainAmount += (targetRain - this.rainAmount) * Math.min(1, dt * 0.5);
    this.wet += ((targetRain > 0 ? 1 : 0) - this.wet) * Math.min(1, dt * (targetRain > 0 ? 0.08 : 0.02));
    // highland mist at altitude (Timboroa, Kinale) & in the morning
    const morning = this.hour < 9 ? (9 - Math.max(5.5, this.hour)) / 3.5 : 0;
    const mistTarget = Math.max(0, (elevReal - 2350) / 500) * 0.9 + morning * 0.35 + (this.weather === 'fog' ? 1 : 0);
    this.mist += (Math.min(1.3, mistTarget) - this.mist) * Math.min(1, dt * 0.3);

    const { dir, elev } = this.sunPosition(this.hour);
    this.sunDir.copy(dir);
    const day = THREE.MathUtils.smoothstep(elev, -6, 10); // 0 night .. 1 day
    const golden = 1 - THREE.MathUtils.smoothstep(elev, 2, 28);
    this.day = day;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(dir).multiplyScalar(1000);
    const overcastEarly = this.weather === 'rain' || this.weather === 'storm' ? 1 : this.weather === 'cloudy' ? 0.5 : 0;
    u.skyGain.value = (0.42 + golden * 0.15) * (0.06 + 0.94 * THREE.MathUtils.smoothstep(elev, -8, 4)) * (1 - overcastEarly * 0.45);
    const overcast = this.weather === 'rain' || this.weather === 'storm' ? 1 : this.weather === 'cloudy' ? 0.5 : 0;
    u.turbidity.value = 2.6 + overcast * 10 + (this.weather === 'dusty' ? 10 : 0) + this.mist * 4;
    u.rayleigh.value = 1.9 + golden * 1.0 - overcast * 0.9;

    // Sun light
    const sunCol = new THREE.Color().setRGB(1, 0.95 - golden * 0.3, 0.88 - golden * 0.5);
    const moon = 1 - day;
    if (day > 0.02) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = day * (3.2 - overcast * 2.2);
      this.sun.position.copy(playerPos).addScaledVector(dir, 300);
    } else {
      this.sun.color.setRGB(0.55, 0.65, 0.9);
      this.sun.intensity = 0.25;
      const md = new THREE.Vector3(-dir.x, Math.abs(dir.y) + 0.4, dir.z).normalize();
      this.sun.position.copy(playerPos).addScaledVector(md, 300);
    }
    this.sun.target.position.copy(playerPos);
    // stabilise shadow map (texel snapping) to avoid shimmering
    this.hemi.intensity = 0.25 + day * (0.85 - overcast * 0.2);
    this.hemi.color.setRGB(0.55 + day * 0.2, 0.65 + day * 0.18, 0.85 + day * 0.1);
    this.hemi.groundColor.setRGB(0.25 * day + 0.03, 0.2 * day + 0.03, 0.14 * day + 0.04);

    // Fog / haze colour follows the sky near the horizon
    const fogDay = new THREE.Color().setRGB(0.62 + golden * 0.3, 0.71 - golden * 0.0, 0.84 - golden * 0.3, THREE.SRGBColorSpace);
    if (this.weather === 'dusty') fogDay.setRGB(0.85, 0.74, 0.58, THREE.SRGBColorSpace);
    const fogCol = new THREE.Color(0x0a0e18).lerp(fogDay, day);
    fogCol.lerp(new THREE.Color(0.62, 0.65, 0.68).multiplyScalar(0.3 + day * 0.7), Math.min(1, overcast * 0.6 + this.mist * 0.7));
    this.scene.fog.color.copy(fogCol);
    const baseDensity = this.quality.fogBase;
    this.scene.fog.density = baseDensity * (1 + overcast * 1.2 + (this.weather === 'dusty' ? 1.5 : 0)) + this.mist * 0.0035;
    this.fogColor = fogCol;

    // Clouds
    const cu = this.cloudMat.uniforms;
    cu.time.value = time;
    cu.cover.value = { clear: 0.32, cloudy: 0.62, rain: 0.85, storm: 0.95, dusty: 0.25, fog: 0.6 }[this.weather] ?? 0.4;
    cu.sunDir.value.copy(dir);
    cu.light.value.setRGB(1, 0.96 - golden * 0.25, 0.9 - golden * 0.45).multiplyScalar(0.12 + day * 0.95 - overcast * 0.35);
    cu.shadow.value.setRGB(0.55, 0.6, 0.68).multiplyScalar(0.08 + day * 0.85 - overcast * 0.3);
    cu.offset.value.set(playerPos.x / 9000, playerPos.z / 9000);
    this.clouds.position.copy(camera.position);
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.rotation.y = time * 0.002;
    this.starMat.opacity = Math.max(0, 1 - day * 1.5) * (1 - overcast);

    // Rain particles around the camera
    this.rain.visible = this.rainAmount > 0.02;
    if (this.rain.visible) {
      const pos = this.rain.geometry.attributes.position.array;
      const n = this.rainOff.length / 3;
      const active = Math.floor(n * Math.min(1, this.rainAmount));
      const fall = dt * 22;
      for (let k = 0; k < n; k++) {
        let y = (this.rainOff[k * 3 + 1] -= fall);
        if (y < -5) this.rainOff[k * 3 + 1] = y = 35;
        const x = camera.position.x + this.rainOff[k * 3];
        const z = camera.position.z + this.rainOff[k * 3 + 2];
        const yy = camera.position.y + y - 10;
        const o = k * 6;
        if (k < active) {
          pos[o] = x; pos[o + 1] = yy; pos[o + 2] = z;
          pos[o + 3] = x + 0.05; pos[o + 4] = yy - 0.9; pos[o + 5] = z;
        } else {
          pos[o + 1] = pos[o + 4] = -1e5;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rainMat.opacity = 0.12 + day * 0.3;
      this.rainMat.color.setRGB(0.55 + day * 0.3, 0.6 + day * 0.3, 0.68 + day * 0.3);
    }

    // Distant mountains: angular size from real distance, drawn on a far shell
    const scale = route.scale;
    const D = 9000;
    const obsElev = elevReal;
    const vis = this.weather === 'clear' ? 1 : this.weather === 'cloudy' ? 0.75 : this.weather === 'dusty' ? 0.45 : 0.25;
    for (const L of this.landmarks) {
      const dx = L.wx - camera.position.x;
      const dz = L.wz - camera.position.z;
      const distWorld = Math.hypot(dx, dz);
      const realKm = (distWorld * scale) / 1000;
      const maxKm = (L.h > 4000 ? 220 : 120) * vis;
      if (realKm > maxKm || realKm < 3) {
        L.mesh.visible = false;
        continue;
      }
      L.mesh.visible = true;
      const ang = Math.atan2(L.h - obsElev, realKm * 1000);
      const height = Math.max(40, Math.tan(Math.max(0.002, ang)) * D);
      const width = height * (2.8 + L.w * 2.2) * (L.h > 4000 ? 1.2 : 1) * (1.0 + 600 / Math.max(300, L.h - obsElev));
      L.mesh.position.set(camera.position.x + (dx / distWorld) * D, camera.position.y - 60 - height * 0.04, camera.position.z + (dz / distWorld) * D);
      L.mesh.scale.set(width, height + 60, width * 0.6);
      const mu = L.mesh.material.uniforms;
      mu.haze.value.copy(fogCol);
      mu.amount.value = Math.min(0.92, 0.25 + (realKm / maxKm) * 0.6 + (1 - vis) * 0.3);
      mu.light.value = 0.25 + day * 0.85;
    }

    // Environment map for reflections (refresh when the light changes)
    if (Math.abs(this.hour - this.lastEnvHour) > 0.35 || this.lastWeather !== this.weather) {
      const eu = this.envSky.material.uniforms;
      for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'skyGain']) eu[k].value = u[k].value;
      eu.sunPosition.value.copy(u.sunPosition.value);
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.25 + day * 0.75;
      this.lastEnvHour = this.hour;
      this.lastWeather = this.weather;
    }
    return { day, overcast };
  }
}
