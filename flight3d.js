// 3D flight replay: terrain (AWS Terrarium elevation) + Esri imagery + animated IGC track.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

const ELEV_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const IMG_URL = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
export const ATTRIBUTION = "Imagerie © Esri, Maxar, Earthstar Geographics · Relief : Mapzen / AWS Open Data";

const EXAG = 1.4; // vertical exaggeration, applied to terrain and track alike
const KM = 1 / 1000; // scene units are kilometres

// ---------- Web Mercator helpers ----------
const lon2px = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const lat2px = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z;
};
const px2lon = (px, z) => (px / (256 * 2 ** z)) * 360 - 180;
const px2lat = (py, z) => {
  const n = Math.PI - (2 * Math.PI * py) / (256 * 2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function stitch(urlFn, z, x0, y0, nx, ny) {
  const c = document.createElement("canvas");
  c.width = nx * 256;
  c.height = ny * 256;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const jobs = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++)
      jobs.push(loadImage(urlFn(z, x0 + i, y0 + j)).then((img) => img && ctx.drawImage(img, i * 256, j * 256)));
  await Promise.all(jobs);
  return c;
}

function pickArea(tracks) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const [, lat, lon] of tracks.flat()) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
  }
  const lat0 = (minLat + maxLat) / 2, lon0 = (minLon + maxLon) / 2;
  // pad 30% and keep at least ~8 km around small flights
  const minSpan = 0.08;
  const dLat = Math.max(maxLat - minLat, minSpan) * 0.65;
  const dLon = Math.max(maxLon - minLon, minSpan / Math.cos((lat0 * Math.PI) / 180)) * 0.65;
  const box = { n: lat0 + dLat, s: lat0 - dLat, w: lon0 - dLon, e: lon0 + dLon };
  let z = 13;
  const tiles = (z) => ({
    x0: Math.floor(lon2px(box.w, z) / 256), x1: Math.floor(lon2px(box.e, z) / 256),
    y0: Math.floor(lat2px(box.n, z) / 256), y1: Math.floor(lat2px(box.s, z) / 256),
  });
  while (z > 8) {
    const t = tiles(z);
    if (t.x1 - t.x0 + 1 <= 4 && t.y1 - t.y0 + 1 <= 4) break;
    z--;
  }
  return { z, ...tiles(z), lat0, lon0 };
}

const PALETTE = ["#3d7bff", "#2fe6b0", "#c6ff3d", "#ffb13d", "#ff3d6e"].map((c) => new THREE.Color(c));
function rampColor(t) {
  t = Math.min(1, Math.max(0, t)) * (PALETTE.length - 1);
  const i = Math.min(PALETTE.length - 2, Math.floor(t));
  return PALETTE[i].clone().lerp(PALETTE[i + 1], t - i);
}

// terrain + renderer shared by the single and group replays
async function buildWorld(container, tracks, { exag = EXAG, lowSun = false } = {}) {
  const area = pickArea(tracks);
  const { z, x0, x1, y0, y1, lat0, lon0 } = area;
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const imgZ = Math.min(17, nx * ny <= 9 ? z + 2 : z + 1);
  const scale = 2 ** (imgZ - z);
  const [elev, img] = await Promise.all([
    stitch(ELEV_URL, z, x0, y0, nx, ny),
    stitch(IMG_URL, imgZ, x0 * scale, y0 * scale, nx * scale, ny * scale),
  ]);
  const W = elev.width, H = elev.height;
  const ed = elev.getContext("2d").getImageData(0, 0, W, H).data;
  const heightAtPx = (px, py) => {
    const x = Math.max(0, Math.min(W - 1, Math.round(px))), y = Math.max(0, Math.min(H - 1, Math.round(py)));
    const k = (y * W + x) * 4;
    return ed[k] * 256 + ed[k + 1] + ed[k + 2] / 256 - 32768;
  };
  const originPx = { x: x0 * 256, y: y0 * 256 };
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  const toLocal = (lat, lon, alt) => new THREE.Vector3(
    (lon - lon0) * 111320 * cosLat * KM,
    alt * exag * KM,
    -(lat - lat0) * 110574 * KM,
  );
  const groundAt = (lat, lon) => heightAtPx(lon2px(lon, z) - originPx.x, lat2px(lat, z) - originPx.y);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b0b1a");
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);

  const SEG = 220;
  const geo = new THREE.PlaneGeometry(1, 1, SEG, SEG);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  let spanKm = 0;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = 1 - uv.getY(i); // v=0 top (north)
    const px = u * W, py = v * H;
    const lat = px2lat(originPx.y + py, z), lon = px2lon(originPx.x + px, z);
    const p = toLocal(lat, lon, heightAtPx(px, py));
    pos.setXYZ(i, p.x, p.y, p.z);
    spanKm = Math.max(spanKm, Math.abs(p.x), Math.abs(p.z));
  }
  geo.computeVertexNormals();
  const tex = new THREE.CanvasTexture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex })));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, lowSun ? 1.3 : 2.2));
  const sun = new THREE.DirectionalLight(0xfff1dd, lowSun ? 3.2 : 1.6);
  if (lowSun) sun.position.set(-40, 14, -10); // grazing light: ridges and valleys pop
  else sun.position.set(-30, 40, 20);
  scene.add(sun);
  scene.fog = new THREE.Fog("#0b0b1a", spanKm * 2.2, spanKm * 5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 0.5;
  controls.maxDistance = spanKm * 4;

  const dispose = () => {
    controls.dispose();
    scene.traverse((o) => {
      o.geometry && o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map && m.map.dispose(); m.dispose(); });
    });
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  return { renderer, scene, camera, controls, toLocal, groundAt, spanKm, dispose, exag };
}

// one coloured track: line + curtain + glider; colorAt(i) gives each vertex colour
function addTrack(world, track, colorAt, { curtainOpacity = 0.16, haloColor = "#c6ff3d", linewidth = 3.2 } = {}) {
  const { scene, toLocal, groundAt } = world;
  const EXAG = world.exag;
  const pts = track.map(([, lat, lon, alt]) => toLocal(lat, lon, alt));
  const positions = [], colors = [];
  pts.forEach((p, i) => {
    positions.push(p.x, p.y, p.z);
    const c = colorAt(i);
    colors.push(c.r, c.g, c.b);
  });
  const lineGeo = new LineGeometry();
  lineGeo.setPositions(positions);
  lineGeo.setColors(colors);
  const lineMat = new LineMaterial({ vertexColors: true, linewidth, worldUnits: false, transparent: true });
  const line = new Line2(lineGeo, lineMat);
  line.computeLineDistances();
  scene.add(line);

  const cPos = [], cCol = [];
  const ground = track.map(([, lat, lon]) => groundAt(lat, lon));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ga = new THREE.Vector3(a.x, ground[i - 1] * EXAG * KM, a.z), gb = new THREE.Vector3(b.x, ground[i] * EXAG * KM, b.z);
    const ca = colorAt(i - 1), cb = colorAt(i);
    for (const [p, c] of [[a, ca], [ga, ca], [b, cb], [b, cb], [ga, ca], [gb, cb]]) {
      cPos.push(p.x, p.y, p.z);
      cCol.push(c.r, c.g, c.b);
    }
  }
  const curtainGeo = new THREE.BufferGeometry();
  curtainGeo.setAttribute("position", new THREE.Float32BufferAttribute(cPos, 3));
  curtainGeo.setAttribute("color", new THREE.Float32BufferAttribute(cCol, 3));
  scene.add(new THREE.Mesh(curtainGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: curtainOpacity, side: THREE.DoubleSide, depthWrite: false,
  })));

  const glider = new THREE.Group();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 20), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 20), new THREE.MeshBasicMaterial({ color: haloColor, transparent: true, opacity: 0.35, depthWrite: false }));
  glider.add(dot, halo);
  scene.add(glider);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7 }));
  scene.add(pin);

  return {
    pts, lineMat, glider,
    setSize(markerSize) {
      dot.scale.setScalar(markerSize);
      halo.scale.setScalar(markerSize * 2.6);
      pin.scale.set(markerSize, (pts[0].y - ground[0] * EXAG * KM) + markerSize * 4, markerSize);
      pin.position.set(pts[0].x, (pts[0].y + ground[0] * EXAG * KM) / 2, pts[0].z);
      this.markerSize = markerSize;
    },
    pulse(now) { halo.scale.setScalar(this.markerSize * (2.4 + Math.sin(now / 250) * 0.5)); },
    show(n) {
      n = Math.max(1, Math.min(pts.length - 1, n));
      lineGeo.instanceCount = n;
      curtainGeo.setDrawRange(0, n * 6);
      glider.position.copy(pts[n]);
      return n;
    },
  };
}

// orbiting camera that fits a set of points, with an intro zoom
function makeCamera(world, allPts) {
  const { camera, controls } = world;
  let follow = true;
  controls.addEventListener("start", () => { follow = false; });
  const box = new THREE.Box3().setFromPoints(allPts);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(Math.hypot(size.x, size.z) / 2, 1.5) * 1.08;
  const target = center.clone();
  let azimuth = Math.PI * 0.15;
  return {
    center, radius,
    reset() { follow = true; azimuth = Math.PI * 0.15; },
    update(dt, el, focusPoint, introSeconds) {
      if (!follow) return;
      azimuth += dt * 0.12;
      const intro = Math.min(1, el / introSeconds);
      const ease = 1 - Math.pow(1 - intro, 3);
      target.lerp(focusPoint ? center.clone().lerp(focusPoint, 0.3) : center, 0.04);
      // fit the track in the narrower of the two FOVs (portrait phones are narrow)
      const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const fit = radius / Math.min(tv, tv * camera.aspect);
      const dist = THREE.MathUtils.lerp(fit * 1.8, fit, ease);
      const elevAng = THREE.MathUtils.lerp(1.35, 0.55, ease);
      camera.position.set(
        target.x + Math.cos(azimuth) * Math.cos(elevAng) * dist,
        target.y + Math.sin(elevAng) * dist,
        target.z + Math.sin(azimuth) * Math.cos(elevAng) * dist,
      );
      controls.target.copy(target);
      camera.lookAt(target);
    },
  };
}

function runLoop(world, container, lineMats, step) {
  const { renderer, camera, controls, scene } = world;
  let raf = 0, running = true, last = performance.now(), t0 = performance.now();
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    lineMats.forEach((m) => m.resolution.set(w, h));
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!running) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    step(now, dt, (now - t0) / 1000);
    controls.update();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  return {
    restart() { t0 = performance.now(); },
    pause() { running = false; },
    resume() { running = true; },
    stop() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

const DRAW_SECONDS = 16;
const INTRO_SECONDS = 2.4;

export async function createReplay(container, flight, { onProgress, onReady } = {}) {
  const track = flight.track;
  const world = await buildWorld(container, [track]);
  const alts = track.map((p) => p[3]);
  const aMin = Math.min(...alts), aMax = Math.max(...alts);
  const t = addTrack(world, track, (i) => rampColor((alts[i] - aMin) / Math.max(1, aMax - aMin)));
  const cam = makeCamera(world, t.pts);
  t.setSize(Math.max(0.05, cam.radius * 0.012));

  const loop = runLoop(world, container, [t.lineMat], (now, dt, el) => {
    const k = Math.max(0, Math.min(1, (el - INTRO_SECONDS) / DRAW_SECONDS));
    const n = t.show(Math.floor(k * (t.pts.length - 1)));
    t.pulse(now);
    cam.update(dt, el, k > 0 && k < 1 ? t.pts[n] : null, INTRO_SECONDS);
    onProgress && onProgress(k, track[n]);
  });
  onReady && onReady({ aMin, aMax });
  return {
    restart() { loop.restart(); cam.reset(); },
    pause: loop.pause, resume: loop.resume,
    dispose() { loop.stop(); world.dispose(); },
  };
}

// several pilots on the same day, replayed on a shared clock (UTC seconds)
export const GROUP_COLORS = ["#c6ff3d", "#ff3d6e", "#3dd6ff", "#ffb13d", "#b57bff"];
export async function createGroupReplay(container, pilots, { onProgress, onReady } = {}) {
  const world = await buildWorld(container, pilots.map((p) => p.track));
  const items = pilots.map((p, idx) => {
    const color = new THREE.Color(GROUP_COLORS[idx % GROUP_COLORS.length]);
    const tr = addTrack(world, p.track, () => color, { curtainOpacity: 0.1, haloColor: color, linewidth: 2.6 });
    const times = p.track.map((q) => p.track_t0 + q[0]);
    return { p, tr, times };
  });
  const tMin = Math.min(...items.map((it) => it.times[0]));
  const tMax = Math.max(...items.map((it) => it.times[it.times.length - 1]));
  const cam = makeCamera(world, items.flatMap((it) => it.tr.pts));
  items.forEach((it) => it.tr.setSize(Math.max(0.05, cam.radius * 0.01)));
  const idxAt = (times, T) => { // last index with time <= T
    let lo = 0, hi = times.length - 1;
    if (T <= times[0]) return 0;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (times[mid] <= T) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const DRAW = 24; // longer than a single flight: there is more to watch
  const loop = runLoop(world, container, items.map((it) => it.tr.lineMat), (now, dt, el) => {
    const k = Math.max(0, Math.min(1, (el - INTRO_SECONDS) / DRAW));
    const T = tMin + k * (tMax - tMin);
    const states = items.map((it) => {
      const n = it.tr.show(idxAt(it.times, T));
      it.tr.pulse(now);
      return { pilot: it.p.pilot, point: it.p.track[n], landed: T > it.times[it.times.length - 1], waiting: T < it.times[0] };
    });
    // look at the middle of whoever is airborne
    const air = items.filter((it, i) => !states[i].landed && !states[i].waiting).map((it) => it.tr.glider.position);
    const focus = k > 0 && k < 1 && air.length ? air.reduce((a, b) => a.clone().add(b)).multiplyScalar(1 / air.length) : null;
    cam.update(dt, el, focus, INTRO_SECONDS);
    onProgress && onProgress(k, T, states);
  });
  onReady && onReady({ colors: items.map((_, i) => GROUP_COLORS[i % GROUP_COLORS.length]), tMin, tMax });
  return {
    restart() { loop.restart(); cam.reset(); },
    pause: loop.pause, resume: loop.resume,
    dispose() { loop.stop(); world.dispose(); },
  };
}

// still image of a flight in 3D (whole track drawn), for the share card
export async function renderSnapshot(flight, width, height) {
  const box = document.createElement("div");
  Object.assign(box.style, { position: "fixed", left: "-10000px", top: "0", width: `${width}px`, height: `${height}px` });
  document.body.appendChild(box);
  try {
    const track = flight.track;
    const world = await buildWorld(box, [track], { exag: 2.1, lowSun: true });
    world.scene.fog = null;
    world.scene.background = new THREE.Color("#241a55");
    const alts = track.map((p) => p[3]);
    const aMin = Math.min(...alts), aMax = Math.max(...alts);
    const t = addTrack(world, track, (i) => rampColor((alts[i] - aMin) / Math.max(1, aMax - aMin)), { curtainOpacity: 0.25, linewidth: 6 });
    const cam = makeCamera(world, t.pts);
    t.setSize(Math.max(0.05, cam.radius * 0.014));
    t.show(t.pts.length - 1);
    const { renderer, camera, scene, controls } = world;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    t.lineMat.resolution.set(width, height);
    // tighter, higher framing than the animated view so the relief fills the picture
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = (cam.radius / Math.min(tv, tv * camera.aspect)) * 0.78;
    const elev = 0.5, az = Math.PI * 0.3;
    const c = cam.center.clone();
    camera.position.set(c.x + Math.cos(az) * Math.cos(elev) * dist, c.y + Math.sin(elev) * dist, c.z + Math.sin(az) * Math.cos(elev) * dist);
    c.y -= cam.radius * 0.25; // aim a little below the track so the ground fills the frame
    camera.lookAt(c);
    renderer.render(scene, camera);
    const out = document.createElement("canvas");
    out.width = width; out.height = height;
    out.getContext("2d").drawImage(renderer.domElement, 0, 0); // same task as render: no preserveDrawingBuffer needed
    world.dispose();
    return out;
  } finally {
    box.remove();
  }
}
