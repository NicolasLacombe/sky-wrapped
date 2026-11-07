// Sky Wrapped: story player + slides.
const PILOTS = ["Red0ut", "Elie-C", "Sguibidix", "RenanA", "MaximeB"];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const SLIDE_MS = 6500;

// straight-line distances from Grenoble, for "that's like..." comparisons
const FROM_GRENOBLE = [
  [95, "Lyon"], [120, "Genève"], [145, "Turin"], [245, "Marseille"], [260, "Milan"],
  [480, "Paris"], [500, "Barcelone"], [900, "Londres"], [940, "Berlin"], [960, "Madrid"], [1600, "Lisbonne"], [1900, "Athènes"],
];
const PEAKS = [[1000, "1 000 m"], [2062, "la Dent de Crolles"], [2977, "le Grand Pic de Belledonne"], [3982, "la Barre des Écrins"], [4808, "le Mont-Blanc"]];
const KINDS = { "Site flight": "Vol depuis un site", "Hike flight": "Marche & vol", "Tandem flight": "Biplace", "Seaside flight": "Bord de mer", "Motor flight": "Paramoteur", "Winch flight": "Treuil" };

const $ = (sel, el = document) => el.querySelector(sel);
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmt = (n, d = 0) => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });
const hm = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
const dateLong = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }).replace(/^1 /, "1er ");
const dateYear = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }).replace(/^1 /, "1er ");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(url); return r.json(); }

// ---------------- count-up ----------------
function countUp(el, to, decimals = 0, ms = 1400) {
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    el.textContent = fmt(to * (1 - Math.pow(1 - k, 3)), decimals);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  cancelAnimationFrame(el._raf);
  step(start);
}

// shrink a big counter until its final value fits the slide width
function fitBig(n) {
  const big = n.closest(".big");
  if (!big) return;
  big.style.fontSize = "";
  n.textContent = fmt(+n.dataset.count, +(n.dataset.dec || 0));
  let fs = parseFloat(getComputedStyle(big).fontSize);
  while (big.scrollWidth > big.clientWidth + 1 && fs > 36) {
    fs -= 4;
    big.style.fontSize = `${fs}px`;
  }
}

// ---------------- slides ----------------
function slidesFor(data, crew) {
  const s = data.summary;
  const me = s.pilot;
  const flights = data.flights;
  const tracked = flights.filter((f) => f.track);
  const out = [];

  out.push({
    theme: "t-ink",
    html: `
      <p class="kicker in d1">${esc(me)} · ${s.year}</p>
      <h2 class="in d2" style="font-size:clamp(44px,13vw,64px)">Ton année<br>dans le ciel</h2>
      <p class="in d3">${s.flights} vols. ${fmt(s.hours, 0)} heures au-dessus du sol.<br>On rembobine ?</p>
      <p class="note in d4">Touche l'écran pour continuer →</p>`,
  });

  out.push({
    theme: "t-sun",
    html: `
      <p class="kicker in d1">Cette année, tu as décollé</p>
      <div class="big in d2"><span data-count="${s.flights}">0</span></div>
      <p class="unit in d2">fois</p>
      <p class="in d3" style="margin-top:18px">en <b>${s.days_flying} jours de vol</b>. ${
        s.first ? `Premier déco le ${dateLong(s.first.start)} à ${esc(s.first.site)}.` : ""}</p>
      ${s.prev.flights ? `<p class="note in d4">${s.flights >= s.prev.flights ? "Plus" : "Moins"} qu'en ${s.year - 1} (${s.prev.flights} vols).</p>` : ""}`,
  });

  const tgv = s.hours / 3;
  out.push({
    theme: "t-sky",
    html: `
      <p class="kicker in d1">Temps en l'air</p>
      <div class="big in d2"><span data-count="${s.hours}" data-dec="${s.hours < 100 ? 1 : 0}">0</span></div>
      <p class="unit in d2">heures</p>
      <p class="in d3" style="margin-top:18px">Soit <b>${fmt(s.hours * 60)} minutes</b> sous une voile,
      ou ${tgv >= 1 ? `<b>${fmt(tgv, 0)} trajets</b> Grenoble → Paris en TGV` : "presque un Grenoble → Paris en TGV"}.</p>
      ${s.longest ? `<p class="note in d4">Le plus long : ${hm(s.longest.duration_min)} le ${dateLong(s.longest.start)}.</p>` : ""}`,
  });

  const city = [...FROM_GRENOBLE].reverse().find(([d]) => d <= s.km);
  out.push({
    theme: "t-violet",
    html: `
      <p class="kicker in d1">Distance parcourue</p>
      <div class="big in d2"><span data-count="${s.km}">0</span></div>
      <p class="unit in d2">kilomètres</p>
      <p class="in d3" style="margin-top:18px">${city
        ? `De quoi relier Grenoble à <b>${city[1]}</b>${s.km >= city[0] * 1.8 ? ` (${fmt(s.km / city[0], 1)} fois)` : ""}, à vol d'oiseau.`
        : "Un bon début."}</p>
      ${s.farthest ? `<p class="note in d4">Record : ${fmt(s.farthest.distance_km)} km depuis ${esc(s.farthest.site)}.</p>` : ""}`,
  });

  const peakM = s.months_hours.indexOf(Math.max(...s.months_hours));
  const maxH = Math.max(...s.months_hours, 0.1);
  out.push({
    theme: "t-lime",
    html: `
      <p class="kicker in d1">Ta saison</p>
      <h2 class="in d1">${MONTH_NAMES[peakM]},<br>ton mois</h2>
      <div class="months in d2">${s.months_hours.map((v, i) => `
        <div class="col"><div class="val">${v ? fmt(v, v < 10 ? 1 : 0) : ""}</div>
        <div class="bar${i === peakM ? " peak" : ""}" data-h="${(v / maxH) * 100}"></div><div class="lbl">${MONTHS[i]}</div></div>`).join("")}
      </div>
      <p class="note in d3">${fmt(s.months_hours[peakM], 1)} h sur ${s.months_flights[peakM]} vol${s.months_flights[peakM] > 1 ? "s" : ""}. Heures de vol par mois.</p>`,
    enter(el) { el.querySelectorAll(".months .bar").forEach((b, i) => setTimeout(() => (b.style.height = b.dataset.h + "%"), 300 + i * 60)); },
    leave(el) { el.querySelectorAll(".months .bar").forEach((b) => (b.style.height = 0)); },
  });

  if (s.sites.length) {
    const top = s.sites.slice(0, 5);
    out.push({
      theme: "t-sun",
      html: `
        <p class="kicker in d1">Ton déco fétiche</p>
        <h2 class="in d2">${esc(top[0][0])}</h2>
        <p class="in d2">${top[0][1]} vol${top[0][1] > 1 ? "s" : ""} depuis là-bas. ${s.sites.length} sites au total.</p>
        <div class="sites in d3">${top.map(([name, n], i) => `
          <div class="row"><span class="rank">${i + 1}</span><span style="flex:0 0 42%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</span>
          <span class="track"><i data-w="${(n / top[0][1]) * 100}"></i></span><span>${n}</span></div>`).join("")}
        </div>
        ${s.new_sites.length ? `<p class="note in d4">Nouveaux cette année : ${s.new_sites.slice(0, 4).map(esc).join(", ")}${s.new_sites.length > 4 ? ` +${s.new_sites.length - 4}` : ""}.</p>` : ""}`,
      enter(el) { el.querySelectorAll(".sites i").forEach((b, i) => setTimeout(() => (b.style.width = b.dataset.w + "%"), 500 + i * 120)); },
      leave(el) { el.querySelectorAll(".sites i").forEach((b) => (b.style.width = 0)); },
    });
  }

  if (s.highest) {
    const alt = s.highest.max_alt_m;
    const top = 5000;
    const beaten = [...PEAKS].reverse().find(([m]) => m <= alt);
    out.push({
      theme: "t-thermal",
      html: `
        <p class="kicker in d1">Ton plafond</p>
        <div class="big in d2" style="font-size:clamp(70px,24vw,120px)"><span data-count="${alt}">0</span></div>
        <p class="unit in d2">mètres</p>
        <p class="in d3" style="margin-top:18px;max-width:72%">Point culminant de l'année, depuis ${esc(s.highest.site)} le ${dateLong(s.highest.start)}.
        ${beaten ? (beaten[0] > 1000 ? `Plus haut que ${beaten[1]} (${fmt(beaten[0])} m).` : "") : ""}</p>
        <div class="gauge in d1">
          ${PEAKS.map(([m, n]) => `<div class="mark" style="bottom:${(m / top) * 100}%">${fmt(m)}</div>`).join("")}
          <div class="me" data-b="${(alt / top) * 100}"></div>
        </div>`,
      enter(el) { const m = $(".gauge .me", el); setTimeout(() => (m.style.bottom = `calc(${m.dataset.b}% - 8px)`), 300); },
      leave(el) { $(".gauge .me", el).style.bottom = 0; },
    });
  }

  if (s.tracks.count) {
    const everest = s.tracks.height_gain_m / 8849;
    out.push({
      theme: "t-mint",
      html: `
        <p class="kicker in d1">Le gain</p>
        <div class="big in d2" style="font-size:clamp(70px,24vw,120px)"><span data-count="${s.tracks.height_gain_m / 1000}" data-dec="1">0</span></div>
        <p class="unit in d2">km de montée</p>
        <p class="in d3" style="margin-top:18px">Thermique après thermique, ça fait <b>${fmt(everest, 1)} × l'Everest</b>, sur ${s.tracks.count} vols tracés.</p>
        <p class="note in d4">Meilleur thermique : <b>+${fmt(s.tracks.best_climb_ms, 1)} m/s</b> en moyenne sur 20 s.</p>`,
    });
  }

  // featured 3D replay: the longest flight with a track
  const featured = featuredFlight(tracked);
  if (featured) {
    const isLongest = s.longest && featured.syride_flight_id === s.longest.syride_flight_id;
    out.push(replaySlide(featured, isLongest ? "Ton plus long vol" : "Un vol mémorable"));
  }

  if (s.wings.length) {
    const [wing, n] = s.wings[0];
    out.push({
      theme: "t-ink",
      html: `
        <p class="kicker in d1">${s.wings.length === 1 ? "Une seule voile toute l'année" : "Ta voile préférée"}</p>
        <h2 class="in d2" style="font-size:clamp(36px,11vw,54px)">${esc(wing)}</h2>
        <p class="in d3">${n} vol${n > 1 ? "s" : ""} sur ${s.flights}.${s.wings.length > 1 ? ` Tu as aussi volé avec : ${s.wings.slice(1, 4).map(([w]) => esc(w)).join(", ")}.` : ""}</p>
        <div class="in d4" style="margin-top:16px">${s.kinds.map(([k, c]) => `<span class="pill" style="background:rgba(255,255,255,.12)">${esc(KINDS[k] || k)} · ${c}</span>`).join("")}</div>`,
    });
  }

  if (crew && crew.pilots.length > 1) out.push(crewSlide(crew, me));

  if (tracked.length > 1) out.push(gallerySlide(tracked));

  out.push(shareSlide(s, featured || tracked[0] || null));
  return out;
}

const featuredFlight = (tracked) => [...tracked].sort((a, b) => b.duration_min - a.duration_min)[0];

// direct 3D page (/<slug>/3d/, optional #<syride flight id>): just the replay, with share + link to the Wrapped
async function openDirect3D(pilot) {
  document.body.classList.add("direct3d");
  const data = await getJSON(`data/${encodeURIComponent(pilot)}.json`);
  const tracked = data.flights.filter((f) => f.track);
  const want = location.hash.slice(1);
  const flight = tracked.find((f) => String(f.syride_flight_id) === want) || featuredFlight(tracked);
  const wrapped = `${window.SLUG}/`;
  if (!flight) {
    story.open([{ theme: "t-ink", duration: null, interactive: true, html: `
      <p class="kicker in d1">${esc(pilot)} · 3D</p>
      <h2 class="in d2">La trace 3D arrive bientôt</h2>
      <p class="in d3">Le fichier de ce vol n'est pas encore récupéré.</p>
      <div class="end-actions in d4"><a class="replay-btn" href="${wrapped}">Voir le Wrapped</a></div>` }]);
    $("#close").onclick = () => (location.href = wrapped);
    return;
  }
  const slide = replaySlide(flight, `Le vol de ${pilot}`);
  story.open([slide]);
  const el = slide.node;
  $(".c-prev", el).textContent = "Wrapped";
  $(".c-prev", el).onclick = (e) => { e.stopPropagation(); location.href = wrapped; };
  $(".c-next", el).textContent = "Partager";
  $(".c-next", el).onclick = async (e) => {
    e.stopPropagation();
    const url = location.href.split("#")[0] + (flight === featuredFlight(tracked) ? "" : `#${flight.syride_flight_id}`);
    const title = `${pilot} · ${flight.site} en 3D`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); e.target.textContent = "Lien copié"; }
    } catch (_) {}
  };
  $("#close").onclick = () => (location.href = wrapped);
}

function crewSlide(crew, me, kicker = "La bande") {
  const metrics = [
    ["hours", "Heures", (v) => `${fmt(v, 1)} h`],
    ["km", "Km", (v) => `${fmt(v)} km`],
    ["flights", "Vols", (v) => fmt(v)],
    ["highest_m", "Plafond", (v) => `${fmt(v)} m`],
  ];
  const el = h(`<div>
      <p class="kicker in d1">${esc(kicker)}</p>
      <h2 class="in d1">Où tu te situes</h2>
      <div class="crew-tabs in d2">${metrics.map(([k, l], i) => `<button data-k="${k}" class="${i ? "" : "on"}">${l}</button>`).join("")}</div>
      <div class="crew in d2"></div>
      <p class="note in d3 crew-note"></p></div>`);
  const render = (key) => {
    const [, , f] = metrics.find(([k]) => k === key);
    const sorted = [...crew.pilots].sort((a, b) => b[key] - a[key]);
    const max = Math.max(...sorted.map((p) => p[key]), 1);
    $(".crew", el).innerHTML = sorted.map((p) => `
      <div><div class="who"><span>${esc(p.pilot)}${p.pilot === me ? '<span class="me-tag">TOI</span>' : ""}</span><span>${f(p[key])}</span></div>
      <div class="lane${p.pilot === me ? " me" : ""}"><i data-w="${(p[key] / max) * 100}"></i></div></div>`).join("");
    requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll(".crew i").forEach((b) => (b.style.width = b.dataset.w + "%"))));
    const rank = sorted.findIndex((p) => p.pilot === me) + 1;
    $(".crew-note", el).textContent = rank === 1 ? "Tu mènes la bande sur ce coup-là." : `Tu es n°${rank} sur ${sorted.length} ici.`;
    el.querySelectorAll(".crew-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.k === key));
  };
  el.querySelectorAll(".crew-tabs button").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); render(b.dataset.k); story.hold(); }));
  return { theme: "t-violet", node: el, enter: () => render("hours") };
}

function gallerySlide(tracked) {
  const el = h(`<div>
      <p class="kicker in d1">Revois chaque vol</p>
      <h2 class="in d1">${tracked.length} traces en 3D</h2>
      <div class="gallery in d2">${[...tracked].reverse().map((f, i) => `
        <button data-i="${tracked.length - 1 - i}"><span><div class="g-site">${esc(f.site || "Site inconnu")}</div>
        <div class="g-meta">${dateLong(f.start)} · ${hm(f.duration_min)} · ${fmt(f.distance_km || 0)} km · ${fmt(f.max_alt_m)} m</div></span>
        <span class="g-go">▶</span></button>`).join("")}</div></div>`);
  el.querySelectorAll(".gallery button").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    story.openReplay(replaySlide(tracked[+b.dataset.i], "Revoir"));
  }));
  el.querySelector(".gallery").addEventListener("scroll", () => story.hold(), { passive: true });
  return { theme: "t-sky", node: el, duration: 15000 };
}


// ---------------- share card (last slide of the yearly wrap) ----------------
// A 1080x1920 story image drawn on a canvas: post it to Instagram / WhatsApp, or just screenshot the slide.
async function drawShareCard(s, flight) {
  const W = 1080, H = 1920;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  try { await Promise.all(["900 80px Unbounded", "800 40px Unbounded", "500 30px Unbounded", "600 30px Inter", "800 30px Inter"].map((f) => document.fonts.load(f))); } catch (_) {}
  const D = (w, size) => `${w} ${size}px Unbounded, system-ui, sans-serif`;
  const I = (w, size) => `${w} ${size}px Inter, system-ui, sans-serif`;

  // background: same sunset as the home page
  const bg = g.createRadialGradient(W / 2, H * 1.1, 0, W / 2, H * 1.1, H * 1.05);
  [[0, "#ff7a2f"], [0.28, "#ff3d6e"], [0.6, "#3a1c71"], [1, "#0b0b1a"]].forEach(([o, col]) => bg.addColorStop(o, col));
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // stars
  let seed = s.flights * 97 + Math.round(s.km);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = "rgba(255,255,255,.55)";
  for (let k = 0; k < 90; k++) { g.beginPath(); g.arc(rnd() * W, rnd() * H * 0.55, rnd() * 2.2 + 0.6, 0, 7); g.fill(); }

  const X = 80;
  g.fillStyle = "#fff8ee";
  g.font = D(500, 30); g.globalAlpha = 0.8;
  g.fillText(`SKY WRAPPED · ${s.year}`.split("").join(String.fromCharCode(8202)), X, 150);
  g.globalAlpha = 1;
  // pilot name, shrunk to fit
  let fs = 132; g.font = D(900, fs);
  while (g.measureText(s.pilot).width > W - 2 * X && fs > 60) { fs -= 6; g.font = D(900, fs); }
  g.fillText(s.pilot, X - 4, 150 + fs + 20);
  let y = 150 + fs + 20;

  // the featured flight in 3D (falls back to a flat silhouette if WebGL fails)
  let shot = null;
  if (flight && flight.track) {
    try {
      const mod = await import(`./flight3d.js${new URL(import.meta.url).search}`);
      shot = await mod.renderSnapshot(flight, 920, 520);
    } catch (err) { console.error(err); }
  }
  if (flight && flight.track && shot) {
    const top = y + 50, boxW = W - 2 * X, boxH = 520;
    g.save();
    g.beginPath(); g.roundRect(X, top, boxW, boxH, 36); g.clip();
    g.drawImage(shot, X, top, boxW, boxH);
    const fade = g.createLinearGradient(0, top + boxH - 120, 0, top + boxH);
    fade.addColorStop(0, "rgba(11,11,26,0)"); fade.addColorStop(1, "rgba(11,11,26,.7)");
    g.fillStyle = fade; g.fillRect(X, top + boxH - 120, boxW, 120);
    g.restore();
    g.strokeStyle = "rgba(255,248,238,.25)"; g.lineWidth = 2;
    g.beginPath(); g.roundRect(X, top, boxW, boxH, 36); g.stroke();
    g.fillStyle = "#fff8ee"; g.font = I(800, 32);
    g.fillText(`${flight.site} · ${fmt(flight.distance_km || flight.track_stats.track_km)} km · ${hm(flight.duration_min)}`, X + 30, top + boxH - 30);
    y = top + boxH + 10;
  } else if (flight && flight.track) {
    const tr = flight.track;
    const lat0 = tr.reduce((a, p) => a + p[1], 0) / tr.length, k = Math.cos((lat0 * Math.PI) / 180);
    const xs = tr.map((p) => p[2] * k), ys = tr.map((p) => -p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const boxW = W - 2 * X, boxH = 330, top = y + 60;
    const sc = Math.min(boxW / Math.max(1e-6, maxX - minX), boxH / Math.max(1e-6, maxY - minY));
    const ox = X + (boxW - (maxX - minX) * sc) / 2, oy = top + (boxH - (maxY - minY) * sc) / 2;
    const alts = tr.map((p) => p[3]), aMin = Math.min(...alts), aMax = Math.max(...alts);
    const ramp = ["#3d7bff", "#2fe6b0", "#c6ff3d", "#ffb13d", "#ff3d6e"];
    g.lineCap = "round"; g.lineJoin = "round";
    g.shadowColor = "rgba(198,255,61,.45)"; g.shadowBlur = 18;
    for (let i = 1; i < tr.length; i++) {
      const t = (alts[i] - aMin) / Math.max(1, aMax - aMin);
      g.strokeStyle = ramp[Math.min(4, Math.floor(t * 4.999))];
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(ox + (xs[i - 1] - minX) * sc, oy + (ys[i - 1] - minY) * sc);
      g.lineTo(ox + (xs[i] - minX) * sc, oy + (ys[i] - minY) * sc);
      g.stroke();
    }
    g.shadowBlur = 0;
    g.fillStyle = "#fff8ee";
    g.beginPath(); g.arc(ox + (xs[0] - minX) * sc, oy + (ys[0] - minY) * sc, 11, 0, 7); g.fill();
    g.font = I(600, 30); g.globalAlpha = 0.85;
    g.fillText(`${flight.site} · ${dateLong(flight.start)} · ${hm(flight.duration_min)} · ${fmt(flight.distance_km || flight.track_stats.track_km)} km`, X, top + boxH + 52);
    g.globalAlpha = 1;
    y = top + boxH + 70;
  } else {
    // no track: hours per month instead
    const top = y + 60, boxH = 300, mh = s.months_hours, mx = Math.max(...mh, 0.1);
    const bw = (W - 2 * X) / 12;
    mh.forEach((v, i) => {
      const bh = Math.max(6, (v / mx) * (boxH - 50));
      g.fillStyle = v === mx ? "#c6ff3d" : "rgba(255,248,238,.35)";
      g.beginPath(); g.roundRect(X + i * bw + 8, top + boxH - 50 - bh, bw - 16, bh, 10); g.fill();
      g.fillStyle = "#fff8ee"; g.globalAlpha = 0.7; g.font = I(600, 26);
      g.fillText(MONTHS[i], X + i * bw + bw / 2 - 9, top + boxH - 10);
      g.globalAlpha = 1;
    });
    g.font = I(600, 30); g.globalAlpha = 0.85;
    g.fillText(`${MONTH_NAMES[mh.indexOf(mx)]}, ton mois : ${fmt(mx, 1)} h`, X, top + boxH + 52);
    g.globalAlpha = 1;
    y = top + boxH + 70;
  }

  // 2x2 big stats
  const stats = [
    [fmt(s.flights), "vols"], [fmt(s.hours, s.hours < 100 ? 1 : 0), "heures"],
    [fmt(s.km), "km"], [s.highest ? fmt(s.highest.max_alt_m) : "–", "m plafond"],
  ];
  const cw = (W - 2 * X - 40) / 2, ch = 200;
  stats.forEach(([v, l], i) => {
    const cx = X + (i % 2) * (cw + 40), cy = y + 40 + Math.floor(i / 2) * (ch + 34);
    g.fillStyle = "rgba(11,11,26,.45)";
    g.beginPath(); g.roundRect(cx, cy, cw, ch, 36); g.fill();
    g.fillStyle = i === 0 ? "#c6ff3d" : "#fff8ee";
    let f = 104; g.font = D(900, f);
    while (g.measureText(v).width > cw - 64 && f > 50) { f -= 4; g.font = D(900, f); }
    g.fillText(v, cx + 32, cy + 28 + f);
    g.fillStyle = "#fff8ee"; g.globalAlpha = 0.75; g.font = D(500, 28);
    g.fillText(l.toUpperCase(), cx + 32, cy + ch - 34);
    g.globalAlpha = 1;
  });
  y += 40 + 2 * ch + 34 + 70;

  // highlights
  const lines = [];
  if (s.sites[0]) lines.push(["Déco fétiche", s.sites[0][0]]);
  if (s.farthest) lines.push(["Record", `${fmt(s.farthest.distance_km)} km · ${s.farthest.site}`]);
  if (s.longest) lines.push(["Plus long", `${hm(s.longest.duration_min)} · ${dateLong(s.longest.start)}`]);
  if (s.wings[0]) lines.push(["Voile", s.wings[0][0]]);
  lines.push(["Jours de vol", `${s.days_flying} jours · ${s.sites.length} sites`]);
  for (const [k, v] of lines) {
    g.font = I(600, 30); g.fillStyle = "#fff8ee"; g.globalAlpha = 0.7;
    g.fillText(k.toUpperCase(), X, y);
    g.globalAlpha = 1; g.font = I(800, 40);
    let txt = v; while (g.measureText(txt).width > W - 2 * X - 330 && txt.length > 4) txt = txt.slice(0, -2) + "…";
    g.fillText(txt, X + 330, y);
    y += 62;
  }

  // footer
  g.font = D(800, 34); g.fillStyle = "#fff8ee";
  g.fillText("Sky Wrapped", X, H - 110);
  g.font = I(800, 34); g.fillStyle = "#c6ff3d";
  g.fillText(`nicolaslacombe.github.io/sky-wrapped/${PAGES[s.pilot] || ""}`, X, H - 62);
  return c;
}

function shareSlide(s, flight) {
  const el = h(`<div class="share-wrap">
    <p class="kicker in d1">Ta carte ${s.year}</p>
    <div class="share-card in d2"><div class="loading-card">Préparation…</div></div>
    <div class="share-links in d3">
      <a href="${PAGES[s.pilot] || ""}/" class="sl-main">🔗 nicolaslacombe.github.io/sky-wrapped/${PAGES[s.pilot] || ""}</a>
      ${flight ? `<a href="${PAGES[s.pilot] || ""}/3d/">Le vol en 3D →</a>` : ""}
      <a href="${PAGES[s.pilot] || ""}/carte/">Lien direct de la carte →</a>
    </div>
    <div class="end-actions in d3">
      <button class="share-img">Partager</button>
      <button class="alt save-img">Enregistrer</button>
    </div>
    <div class="end-actions in d4" style="margin-top:8px">
      <button class="alt replay-btn">Revoir</button>
      <button class="alt switch-btn">${window.PILOT ? "Accueil" : "Autre pilote"}</button>
    </div>
  </div>`);
  let blob = null;
  const ready = drawShareCard(s, flight).then((c) => new Promise((res) => c.toBlob((b) => {
    blob = b;
    const img = new Image();
    img.src = URL.createObjectURL(b);
    img.alt = `Sky Wrapped ${s.year} de ${s.pilot}`;
    const box = $(".share-card", el);
    box.innerHTML = "";
    box.appendChild(img);
    res(b);
  }, "image/png")));
  const fname = `sky-wrapped-${s.year}-${PAGES[s.pilot] || s.pilot}.png`;
  const save = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
  };
  $(".share-img", el).addEventListener("click", async (e) => {
    e.stopPropagation();
    await ready;
    const file = new File([blob], fname, { type: "image/png" });
    const url = new URL(`${PAGES[s.pilot] || ""}/`, document.baseURI).href;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: `Sky Wrapped ${s.year}`, text: url });
      else if (navigator.share) await navigator.share({ title: `Sky Wrapped ${s.year}`, url });
      else save();
    } catch (_) {}
  });
  $(".save-img", el).addEventListener("click", async (e) => { e.stopPropagation(); await ready; save(); });
  $(".replay-btn", el).addEventListener("click", (e) => { e.stopPropagation(); story.go(0); });
  $(".switch-btn", el).addEventListener("click", (e) => { e.stopPropagation(); story.close(); });
  return { theme: "t-ink", node: el, duration: null };
}

function endSlide(s) {
  const el = h(`<div>
    <div class="card in d1">
      <div class="c-head"><span class="c-name">${esc(s.pilot)}</span><span class="c-year">${s.year} · Sky Wrapped</span></div>
      <div class="c-grid">
        <div><b>${s.flights}</b><span>vols</span></div>
        <div><b>${fmt(s.hours, 1)}</b><span>heures</span></div>
        <div><b>${fmt(s.km)}</b><span>km</span></div>
        <div><b>${s.highest ? fmt(s.highest.max_alt_m) : "–"}</b><span>m plafond</span></div>
      </div>
      <div class="c-top">
        ${s.sites[0] ? `Déco fétiche <b>${esc(s.sites[0][0])}</b><br>` : ""}
        ${s.longest ? `Plus long <b>${hm(s.longest.duration_min)}</b> · Record <b>${fmt(s.farthest.distance_km)} km</b><br>` : ""}
        ${s.wings[0] ? `Voile <b>${esc(s.wings[0][0])}</b>` : ""}
      </div>
    </div>
    <p class="note in d2" style="margin-top:16px">Depuis le début : ${fmt(s.all_time.flights)} vols · ${fmt(s.all_time.hours)} h · ${fmt(s.all_time.km)} km depuis ${new Date(s.all_time.since).getFullYear()}.</p>
    <div class="end-actions in d3"><button class="replay-btn">Revoir</button><button class="alt switch-btn">${window.PILOT ? "Accueil" : "Autre pilote"}</button></div>
  </div>`);
  $(".replay-btn", el).addEventListener("click", (e) => { e.stopPropagation(); story.go(0); });
  $(".switch-btn", el).addEventListener("click", (e) => { e.stopPropagation(); story.close(); });
  return { theme: "t-lime", node: el, duration: null };
}

function replaySlide(flight, kicker) {
  const ts = flight.track_stats;
  const el = h(`<div>
    <div class="loading">Chargement du relief…</div>
    <div class="hud">
      <p class="kicker">${esc(kicker)}</p>
      <h2>${esc(flight.site || "Vol")}</h2>
      <p style="font-size:14px;opacity:.85">${dateLong(flight.start)} · ${hm(flight.duration_min)} · ${fmt(flight.distance_km || ts.track_km)} km${flight.wing ? ` · ${esc(flight.wing)}` : ""}</p>
    </div>
    <div class="legend" data-hi="" data-lo=""></div>
    <div class="stats">
      <div><b class="s-time">0:00</b><span>temps</span></div>
      <div><b class="s-alt">–</b><span>alt m</span></div>
      <div><b class="s-vario">–</b><span>m/s</span></div>
      <div><b class="s-climb">+${fmt(ts.max_climb_ms, 1)}</b><span>max</span></div>
    </div>
    <div class="controls">
      <button class="c-prev">‹ Retour</button>
      <button class="c-again">↻ Revoir</button>
      <button class="c-next primary">Suite ›</button>
    </div>
    <p style="position:absolute;z-index:5;left:0;right:0;bottom:calc(67px + env(safe-area-inset-bottom));text-align:center;font-size:8px;opacity:.5;pointer-events:none" class="attrib"></p>
  </div>`);
  let replay = null;
  const track = flight.track;
  const vario = (i) => {
    const a = track[Math.max(0, i - 1)], b = track[Math.min(track.length - 1, i + 1)];
    return b[0] > a[0] ? (b[3] - a[3]) / (b[0] - a[0]) : 0;
  };
  return {
    theme: "replay",
    node: el,
    duration: null,
    interactive: true,
    async enter(slideEl) {
      $(".c-prev", el).onclick = (e) => { e.stopPropagation(); story.prev(); };
      $(".c-next", el).onclick = (e) => { e.stopPropagation(); story.next(); };
      $(".c-again", el).onclick = (e) => { e.stopPropagation(); replay && replay.restart(); };
      const mod = await import(`./flight3d.js${new URL(import.meta.url).search}`);
      $(".attrib", el).textContent = mod.ATTRIBUTION;
      if (!slideEl.classList.contains("active")) return;
      try {
        replay = await mod.createReplay(slideEl, flight, {
          onReady: ({ aMin, aMax }) => {
            $(".loading", el).remove();
            const lg = $(".legend", el);
            lg.dataset.hi = `${fmt(aMax)} m`;
            lg.dataset.lo = `${fmt(aMin)} m`;
          },
          onProgress: (k, p) => {
            const i = Math.round(k * (track.length - 1));
            const sec = p[0];
            $(".s-time", el).textContent = `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;
            $(".s-alt", el).textContent = fmt(p[3]);
            const v = vario(i);
            $(".s-vario", el).textContent = `${v >= 0 ? "+" : ""}${fmt(v, 1)}`;
          },
        });
        if (!slideEl.classList.contains("active")) { replay.dispose(); replay = null; }
      } catch (err) {
        console.error(err);
        const l = $(".loading", el);
        if (l) l.textContent = "Impossible de charger la vue 3D";
      }
    },
    leave() { replay && replay.dispose(); replay = null; },
  };
}


// ---------------- all-time wrap (/<slug>/total/) ----------------
const EARTH_KM = 40075;
function slidesForAll(a, crewAll) {
  const me = a.pilot;
  const since = new Date(a.since);
  const nYears = a.years.length;
  const out = [];
  out.push({
    theme: "t-ink",
    html: `
      <p class="kicker in d1">${esc(me)} · depuis ${since.getFullYear()}</p>
      <h2 class="in d2" style="font-size:clamp(40px,12vw,60px)">Toutes tes années de vol</h2>
      <p class="in d3">${nYears} saison${nYears > 1 ? "s" : ""}, ${fmt(a.flights)} vols, ${fmt(a.hours, 0)} heures.<br>On rembobine tout ?</p>
      <p class="note in d4">Premier vol le ${since.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ")}${a.first && a.first.site ? ` à ${esc(a.first.site)}` : ""}.</p>`,
  });
  out.push({
    theme: "t-sun",
    html: `
      <p class="kicker in d1">Depuis le début, tu as décollé</p>
      <div class="big in d2"><span data-count="${a.flights}">0</span></div>
      <p class="unit in d2">fois</p>
      <p class="in d3" style="margin-top:18px">sur <b>${fmt(a.days)} jours de vol</b> différents.</p>`,
  });
  const daysNonStop = a.hours / 24;
  out.push({
    theme: "t-sky",
    html: `
      <p class="kicker in d1">Temps en l'air</p>
      <div class="big in d2"><span data-count="${a.hours}">0</span></div>
      <p class="unit in d2">heures</p>
      <p class="in d3" style="margin-top:18px">Mis bout à bout, ça fait <b>${fmt(daysNonStop, daysNonStop < 10 ? 1 : 0)} jours</b> non-stop sous une voile.</p>
      ${a.longest ? `<p class="note in d4">Le plus long : ${hm(a.longest.duration_min)} depuis ${esc(a.longest.site)}, le ${dateYear(a.longest.start)}.</p>` : ""}`,
  });
  const city = [...FROM_GRENOBLE].reverse().find(([d]) => d <= a.km);
  const earth = a.km / EARTH_KM;
  out.push({
    theme: "t-violet",
    html: `
      <p class="kicker in d1">Distance parcourue</p>
      <div class="big in d2"><span data-count="${a.km}">0</span></div>
      <p class="unit in d2">kilomètres</p>
      <p class="in d3" style="margin-top:18px">${earth >= 0.05
        ? `Soit <b>${fmt(earth * 100, 0)} %</b> du tour de la Terre.`
        : city ? `De quoi relier Grenoble à <b>${city[1]}</b>, à vol d'oiseau.` : "Un bon début."}</p>`,
  });

  // one bar per year
  const best = a.years.find((y) => y.year === a.best_year);
  const maxH = Math.max(...a.years.map((y) => y.hours), 0.1);
  out.push({
    theme: "t-lime",
    html: `
      <p class="kicker in d1">Année par année</p>
      <h2 class="in d1">${a.best_year},<br>ta meilleure année</h2>
      <div class="months years in d2">${a.years.map((y) => `
        <div class="col"><div class="val">${fmt(y.hours, 0)} h</div>
        <div class="bar${y.year === a.best_year ? " peak" : ""}" data-h="${(y.hours / maxH) * 100}"></div><div class="lbl">${String(y.year).slice(2)}</div></div>`).join("")}
      </div>
      <p class="note in d3">${fmt(best.hours, 1)} h, ${best.flights} vols et ${fmt(best.km)} km en ${best.year}. Heures de vol par an.</p>`,
    enter(el) { el.querySelectorAll(".months .bar").forEach((b, i) => setTimeout(() => (b.style.height = b.dataset.h + "%"), 300 + i * 90)); },
    leave(el) { el.querySelectorAll(".months .bar").forEach((b) => (b.style.height = 0)); },
  });

  // recap card per year (scrollable)
  const yel = h(`<div>
    <p class="kicker in d1">Le récap</p>
    <h2 class="in d1">Chaque saison</h2>
    <div class="gallery years-list in d2">${[...a.years].reverse().map((y) => `
      <div class="year-card">
        <div class="y-head"><span class="y-year">${y.year}</span><span>${y.flights} vols · ${fmt(y.hours, 0)} h · ${fmt(y.km)} km</span></div>
        <div class="y-meta">
          ${y.top_site ? `Déco fétiche <b>${esc(y.top_site[0])}</b> (${y.top_site[1]})<br>` : ""}
          ${y.farthest ? `Plus gros vol <b>${fmt(y.farthest.distance_km)} km</b> depuis ${esc(y.farthest.site)}<br>` : ""}
          Plus long <b>${hm(y.longest_min)}</b>${y.highest_m ? ` · plafond <b>${fmt(y.highest_m)} m</b>` : ""}<br>
          ${y.wing ? `Voile <b>${esc(y.wing)}</b>` : ""}${y.new_sites ? ` · ${y.new_sites} nouveau${y.new_sites > 1 ? "x" : ""} site${y.new_sites > 1 ? "s" : ""}` : ""}
        </div>
      </div>`).join("")}</div></div>`);
  yel.querySelector(".gallery").addEventListener("scroll", () => story.hold(), { passive: true });
  out.push({ theme: "t-ink", node: yel, duration: 16000 });

  if (a.sites.length) {
    const top = a.sites.slice(0, 5);
    out.push({
      theme: "t-sun",
      html: `
        <p class="kicker in d1">Tes décos</p>
        <div class="big in d2" style="font-size:clamp(70px,24vw,120px)"><span data-count="${a.sites_count}">0</span></div>
        <p class="unit in d2">sites différents</p>
        <div class="sites in d3">${top.map(([name, n], i) => `
          <div class="row"><span class="rank">${i + 1}</span><span style="flex:0 0 42%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</span>
          <span class="track"><i data-w="${(n / top[0][1]) * 100}"></i></span><span>${n}</span></div>`).join("")}
        </div>`,
      enter(el) { el.querySelectorAll(".sites i").forEach((b, i) => setTimeout(() => (b.style.width = b.dataset.w + "%"), 700 + i * 120)); },
      leave(el) { el.querySelectorAll(".sites i").forEach((b) => (b.style.width = 0)); },
    });
  }

  if (a.wings.length) {
    out.push({
      theme: "t-mint",
      html: `
        <p class="kicker in d1">Tes voiles</p>
        <h2 class="in d1">${a.wings.length} voile${a.wings.length > 1 ? "s" : ""}</h2>
        <div class="wings in d2">${a.wings.map(([w, y0, y1, n]) => `
          <div class="row"><span class="w-years">${y0 === y1 ? y0 : `${y0}–${String(y1).slice(2)}`}</span><span class="w-name">${esc(w)}</span><span>${n} vol${n > 1 ? "s" : ""}</span></div>`).join("")}</div>`,
    });
  }

  const rec = (label, f, val) => f ? `<div class="rec"><span>${label}</span><b>${val}</b><em>${esc(f.site || "")} · ${dateYear(f.start)}</em></div>` : "";
  out.push({
    theme: "t-thermal",
    html: `
      <p class="kicker in d1">Tes records</p>
      <h2 class="in d1">Le meilleur de toi</h2>
      <div class="records in d2">
        ${rec("Plus loin", a.farthest, `${fmt(a.farthest.distance_km)} km`)}
        ${rec("Plus long", a.longest, hm(a.longest.duration_min))}
        ${rec("Plus haut", a.highest, `${fmt(a.highest.max_alt_m)} m`)}
      </div>`,
  });

  const big = a.farthest.has_track ? a.farthest : a.best_tracked;
  if (big && big.track) out.push(replaySlide(big, big === a.farthest ? "Ton plus gros vol" : "Ton plus gros vol tracé"));

  if (crewAll && crewAll.pilots.length > 1) out.push(crewSlide(crewAll, me, "Depuis le début"));
  out.push(endSlideAll(a));
  return out;
}

function endSlideAll(a) {
  const el = h(`<div>
    <div class="card in d1">
      <div class="c-head"><span class="c-name">${esc(a.pilot)}</span><span class="c-year">${new Date(a.since).getFullYear()}–${a.years[a.years.length - 1].year} · Sky Wrapped</span></div>
      <div class="c-grid">
        <div><b>${fmt(a.flights)}</b><span>vols</span></div>
        <div><b>${fmt(a.hours, 0)}</b><span>heures</span></div>
        <div><b>${fmt(a.km)}</b><span>km</span></div>
        <div><b>${a.sites_count}</b><span>sites</span></div>
      </div>
      <div class="c-top">
        Record <b>${fmt(a.farthest.distance_km)} km</b> · Plus long <b>${hm(a.longest.duration_min)}</b><br>
        Plafond <b>${fmt(a.highest.max_alt_m)} m</b> · Meilleure année <b>${a.best_year}</b>
      </div>
    </div>
    <div class="end-actions in d3"><button class="replay-btn">Revoir</button><a href="${window.SLUG}/">Wrapped 2026</a></div>
  </div>`);
  $(".replay-btn", el).addEventListener("click", (e) => { e.stopPropagation(); story.go(0); });
  return { theme: "t-lime", node: el, duration: null };
}

// ---------------- group day (/bisanne/) ----------------
const timeFR = (epoch) => new Date(epoch * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const dateFull = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ");

function slidesForDay(d) {
  const P = d.pilots;
  const names = P.map((p) => p.pilot);
  const listNames = names.slice(0, -1).join(", ") + " et " + names[names.length - 1];
  const totKm = P.reduce((s, p) => s + (p.distance_km || 0), 0);
  const totMin = P.reduce((s, p) => s + p.duration_min, 0);
  const first = [...P].sort((a, b) => a.track_t0 - b.track_t0)[0];
  const lastLand = [...P].sort((a, b) => (b.track_t0 + b.track.at(-1)[0]) - (a.track_t0 + a.track.at(-1)[0]))[0];
  const highest = [...P].sort((a, b) => b.track_stats.max_alt_gps_m - a.track_stats.max_alt_gps_m)[0];
  const climber = [...P].sort((a, b) => b.track_stats.max_climb_ms - a.track_stats.max_climb_ms)[0];
  const out = [];
  out.push({
    theme: "t-ink",
    html: `
      <p class="kicker in d1">${dateFull(d.date)} · ${esc(d.site)}</p>
      <h2 class="in d2" style="font-size:clamp(40px,12vw,60px)">La journée à ${P.length}</h2>
      <p class="in d3">${esc(listNames)}, même déco, même ciel.<br><b>${fmt(totKm)} km</b> à ${P.length}.</p>
      <p class="note in d4">Touche l'écran pour continuer →</p>`,
  });
  out.push(groupReplaySlide(d));
  out.push({
    theme: "t-violet",
    html: `
      <p class="kicker in d1">Le classement du jour</p>
      <h2 class="in d1">Qui est allé le plus loin</h2>
      <div class="day-table in d2">${P.map((p, i) => `
        <div class="dt-row"><span class="dt-dot" style="background:${dayColor(i)}"></span><span class="dt-name">${esc(p.pilot)}</span>
        <span class="dt-km">${fmt(p.distance_km || p.track_stats.track_km)} km</span></div>
        <div class="dt-meta">${hm(p.duration_min)} en l'air · plafond ${fmt(p.track_stats.max_alt_gps_m)} m · +${fmt(p.track_stats.max_climb_ms, 1)} m/s · ${esc(p.wing || "")}</div>`).join("")}
      </div>
      <p class="note in d3">Distances XContest.</p>`,
  });
  // timeline: who was in the air when
  const D = (p) => p.day || { takeoff: p.track_t0, landing: p.track_t0 + p.track.at(-1)[0] };
  const t0 = Math.floor(Math.min(...P.map((p) => D(p).takeoff)) / 3600) * 3600;
  const t1 = Math.ceil(Math.max(...P.map((p) => D(p).landing)) / 3600) * 3600;
  const pct = (t) => ((t - t0) / (t1 - t0)) * 100;
  const hours = []; for (let t = t0; t <= t1; t += 3600) hours.push(t);
  out.push({
    theme: "t-ink",
    html: `
      <p class="kicker in d1">La journée</p>
      <h2 class="in d1">De ${timeFR(Math.min(...P.map((p) => D(p).takeoff)))} à ${timeFR(Math.max(...P.map((p) => D(p).landing)))}</h2>
      <div class="timeline in d2">
        <div class="tl-hours">${hours.map((t) => `<span style="left:${pct(t)}%">${timeFR(t).slice(0, 2)}h</span>`).join("")}</div>
        ${P.map((p, i) => `
        <div class="tl-row"><div class="tl-name">${esc(p.pilot)}</div>
          <div class="tl-lane"><i style="left:${pct(D(p).takeoff)}%;--w:${pct(D(p).landing) - pct(D(p).takeoff)}%;background:${dayColor(i)}"></i>
          ${p.day ? `<b class="tl-top" style="left:${pct(p.day.top_time)}%" title="plafond"></b>` : ""}</div>
          <div class="tl-times"><span>déco ${timeFR(D(p).takeoff)}</span><span>posé ${timeFR(D(p).landing)}</span></div></div>`).join("")}
      </div>
      <p class="note in d3">▲ le moment où chacun a touché son plafond.</p>`,
    enter(el) { el.querySelectorAll(".tl-lane i").forEach((b, i) => setTimeout(() => (b.style.width = getComputedStyle(b).getPropertyValue("--w")), 400 + i * 150)); },
    leave(el) { el.querySelectorAll(".tl-lane i").forEach((b) => (b.style.width = 0)); },
  });

  // one card per pilot
  const cards = h(`<div>
    <p class="kicker in d1">Fiche par pilote</p>
    <h2 class="in d1">Le vol de chacun</h2>
    <div class="gallery years-list in d2">${P.map((p, i) => {
      const x = p.day, ts = p.track_stats;
      const home = x && x.landing_from_takeoff_km < 1;
      return `<div class="year-card" style="border-left:4px solid ${dayColor(i)}">
        <div class="y-head"><span class="y-year" style="color:${dayColor(i)}">${esc(p.pilot)}</span><span>${fmt(p.distance_km || ts.track_km)} km · ${hm(p.duration_min)}</span></div>
        <div class="pc-grid">
          ${x ? `<div><b>${timeFR(x.takeoff)}</b><span>déco</span></div><div><b>${timeFR(x.landing)}</b><span>posé</span></div>` : ""}
          <div><b>${fmt(ts.max_alt_gps_m)} m</b><span>plafond${x ? ` à ${timeFR(x.top_time)}` : ""}</span></div>
          <div><b>+${fmt(ts.max_climb_ms, 1)}</b><span>m/s max</span></div>
          <div><b>${fmt(ts.height_gain_m / 1000, 1)} km</b><span>de montée</span></div>
          <div><b>${fmt(ts.track_km)} km</b><span>de trace</span></div>
          ${x ? `<div><b>${fmt(x.avg_kmh)} km/h</b><span>moyenne</span></div>
          <div><b>${home ? "au déco" : `${fmt(x.landing_from_takeoff_km, 1)} km`}</b><span>${home ? "reposé" : "posé du déco"}</span></div>` : ""}
        </div>
        ${p.wing ? `<div class="y-meta">Voile <b>${esc(p.wing)}</b></div>` : ""}
      </div>`;
    }).join("")}</div></div>`);
  cards.querySelector(".gallery").addEventListener("scroll", () => story.hold(), { passive: true });
  out.push({ theme: "t-sky", node: cards, duration: 18000 });

  const totGain = P.reduce((s, p) => s + p.track_stats.height_gain_m, 0);
  const homer = P.find((p) => p.day && p.day.landing_from_takeoff_km < 1);
  const fastest = [...P].filter((p) => p.day).sort((a, b) => b.day.avg_kmh - a.day.avg_kmh)[0];
  out.push({
    theme: "t-sun",
    html: `
      <p class="kicker in d1">À ${P.length}, ce jour-là</p>
      <div class="big in d2"><span data-count="${totMin / 60}" data-dec="1">0</span></div>
      <p class="unit in d2">heures de vol cumulées</p>
      <div class="facts in d3">
        <p>🪂 Premier en l'air : <b>${esc(first.pilot)}</b> à ${timeFR(D(first).takeoff)}</p>
        <p>🛬 Dernier posé : <b>${esc(lastLand.pilot)}</b> à ${timeFR(D(lastLand).landing)}</p>
        <p>⛰️ Le plus haut : <b>${esc(highest.pilot)}</b>, ${fmt(highest.track_stats.max_alt_gps_m)} m</p>
        <p>🔥 Meilleur thermique : <b>${esc(climber.pilot)}</b>, +${fmt(climber.track_stats.max_climb_ms, 1)} m/s</p>
        ${fastest ? `<p>💨 Le plus rapide : <b>${esc(fastest.pilot)}</b>, ${fmt(fastest.day.avg_kmh)} km/h de moyenne</p>` : ""}
        ${homer ? `<p>🏠 <b>${esc(homer.pilot)}</b> a reposé au déco après ${hm(homer.duration_min)}</p>` : ""}
        <p>🏔️ ${fmt(totGain / 1000, 0)} km de montée à ${P.length}, soit ${fmt(totGain / 8849, 1)} × l'Everest</p>
      </div>`,
  });
  const el = h(`<div>
    <p class="kicker in d1">${esc(d.site)} · ${dateFull(d.date)}</p>
    <h2 class="in d1">Une journée à garder</h2>
    <div class="end-actions in d2" style="flex-direction:column">
      <button class="share-btn">Partager cette journée</button>
      <button class="alt replay-btn">Revoir</button>
    </div>
    <p class="note in d3">Les Wrapped de chacun :</p>
    <div class="day-links in d3">${P.map((p) => PAGES[p.pilot] ? `<a href="${PAGES[p.pilot]}/">${esc(p.pilot)}</a>` : "").join("")}</div>
  </div>`);
  $(".replay-btn", el).addEventListener("click", (e) => { e.stopPropagation(); story.go(0); });
  $(".share-btn", el).addEventListener("click", (e) => { e.stopPropagation(); shareLink(e.target, `${d.site}, ${dateFull(d.date)}`); });
  out.push({ theme: "t-lime", node: el, duration: null });
  return out;
}

const PAGES = { "Red0ut": "nico", "Elie-C": "elie", "Sguibidix": "clem", "RenanA": "renan", "MaximeB": "maxime" };
const DAY_COLORS = ["#c6ff3d", "#ff3d6e", "#3dd6ff", "#ffb13d", "#b57bff"];
const dayColor = (i) => DAY_COLORS[i % DAY_COLORS.length];

async function shareLink(btn, title) {
  const url = location.href.split("#")[0];
  try {
    if (navigator.share) await navigator.share({ title, url });
    else { await navigator.clipboard.writeText(url); btn.textContent = "Lien copié"; }
  } catch (_) {}
}

function groupReplaySlide(d) {
  const P = d.pilots;
  const el = h(`<div>
    <div class="loading">Chargement du relief…</div>
    <div class="hud">
      <p class="kicker">${dateFull(d.date)}</p>
      <h2>${esc(d.site)} à ${P.length}</h2>
      <p style="font-size:14px;opacity:.85">Toutes les traces, à la même heure.</p>
    </div>
    <div class="who-list">${P.map((p, i) => `
      <div class="who-row" data-i="${i}"><span class="dt-dot" style="background:${dayColor(i)}"></span><span class="w-n">${esc(p.pilot)}</span><span class="w-a">–</span></div>`).join("")}
    </div>
    <div class="stats" style="grid-template-columns:1fr">
      <div><b class="s-clock">–</b><span>heure</span></div>
    </div>
    <div class="controls">
      <button class="c-prev">‹ Retour</button>
      <button class="c-again">↻ Revoir</button>
      <button class="c-next primary">Suite ›</button>
    </div>
    <p style="position:absolute;z-index:5;left:0;right:0;bottom:calc(67px + env(safe-area-inset-bottom));text-align:center;font-size:8px;opacity:.5;pointer-events:none" class="attrib"></p>
  </div>`);
  let replay = null;
  return {
    theme: "replay", node: el, duration: null, interactive: true,
    async enter(slideEl) {
      $(".c-prev", el).onclick = (e) => { e.stopPropagation(); story.prev(); };
      $(".c-next", el).onclick = (e) => { e.stopPropagation(); story.next(); };
      $(".c-again", el).onclick = (e) => { e.stopPropagation(); replay && replay.restart(); };
      const mod = await import(`./flight3d.js${new URL(import.meta.url).search}`);
      $(".attrib", el).textContent = mod.ATTRIBUTION;
      if (!slideEl.classList.contains("active")) return;
      const rows = [...el.querySelectorAll(".who-row")];
      try {
        replay = await mod.createGroupReplay(slideEl, P, {
          onReady: () => { $(".loading", el)?.remove(); },
          onProgress: (k, T, states) => {
            $(".s-clock", el).textContent = timeFR(T);
            states.forEach((s, i) => {
              rows[i].classList.toggle("off", s.waiting || s.landed);
              $(".w-a", rows[i]).textContent = s.waiting ? "au déco" : s.landed ? "posé" : `${fmt(s.point[3])} m`;
            });
          },
        });
        if (!slideEl.classList.contains("active")) { replay.dispose(); replay = null; }
      } catch (err) {
        console.error(err);
        const l = $(".loading", el);
        if (l) l.textContent = "Impossible de charger la vue 3D";
      }
    },
    leave() { replay && replay.dispose(); replay = null; },
  };
}

// ---------------- story player ----------------
const story = {
  slides: [], i: 0, timer: 0, startedAt: 0, elapsed: 0, paused: false, extra: null,

  open(slides) {
    this.slides = slides;
    const wrap = $("#slides");
    wrap.innerHTML = "";
    $("#progress").innerHTML = slides.map(() => '<div class="bar"><i></i></div>').join("");
    slides.forEach((s) => {
      const el = document.createElement("div");
      el.className = `slide ${s.theme === "replay" ? "replay" : s.theme}`;
      if (s.node) el.appendChild(s.node); else el.innerHTML = s.html;
      // decorative blobs on colour slides
      if (s.theme !== "replay") for (let k = 0; k < 2; k++) {
        const b = document.createElement("div");
        b.className = "blob";
        const size = 160 + Math.random() * 220;
        Object.assign(b.style, { width: `${size}px`, height: `${size}px`, left: `${Math.random() * 90 - 20}%`, top: `${Math.random() * 90 - 10}%`, background: "rgba(255,255,255,.25)" });
        el.prepend(b);
      }
      s.el = el;
      wrap.appendChild(el);
    });
    $("#picker").classList.add("hidden");
    $("#story").classList.remove("hidden");
    this.go(0);
  },

  go(i) {
    if (this.extra) this.closeReplay();
    const prev = this.slides[this.i];
    if (prev && prev.el.classList.contains("active")) { prev.el.classList.remove("active"); prev.leave && prev.leave(prev.el); }
    this.i = Math.max(0, Math.min(this.slides.length - 1, i));
    const s = this.slides[this.i];
    // restart CSS entrance animations
    s.el.querySelectorAll(".in").forEach((n) => { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
    s.el.classList.add("active");
    s.el.querySelectorAll("[data-count]").forEach((n) => { fitBig(n); countUp(n, +n.dataset.count, +(n.dataset.dec || 0)); });
    s.enter && s.enter(s.el);
    $("#story").classList.toggle("interactive", !!s.interactive);
    $("#story").classList.toggle("light", ["t-lime", "t-sun", "t-mint", "t-paper"].includes(s.theme));
    [...$("#progress").children].forEach((b, k) => { b.firstChild.style.width = k < this.i ? "100%" : "0%"; });
    this.elapsed = 0;
    this.startedAt = performance.now();
    this.paused = false;
    this.tick();
  },

  duration() { const s = this.slides[this.i]; return s.duration === undefined ? SLIDE_MS : s.duration; },

  tick() {
    cancelAnimationFrame(this.timer);
    const loop = (now) => {
      const d = this.duration();
      const bar = $("#progress").children[this.i].firstChild;
      if (!d) { bar.style.width = "100%"; return; }
      const t = this.elapsed + (this.paused ? 0 : now - this.startedAt);
      bar.style.width = `${Math.min(100, (t / d) * 100)}%`;
      if (t >= d) return this.next();
      this.timer = requestAnimationFrame(loop);
    };
    this.timer = requestAnimationFrame(loop);
  },

  pause() { if (!this.paused) { this.elapsed += performance.now() - this.startedAt; this.paused = true; } },
  resume() { if (this.paused) { this.startedAt = performance.now(); this.paused = false; } },
  hold() { this.elapsed = 0; this.startedAt = performance.now(); }, // user is interacting: restart the slide timer

  next() { if (this.i < this.slides.length - 1) this.go(this.i + 1); },
  prev() { this.go(this.i - 1); },

  openReplay(slide) {
    this.pause();
    const el = document.createElement("div");
    el.className = "slide replay active";
    el.style.zIndex = 30;
    el.appendChild(slide.node);
    $("#slides").appendChild(el);
    $("#story").classList.add("interactive");
    $(".c-prev", el).textContent = "‹ Vols";
    $(".c-next", el).textContent = "Fermer";
    this.extra = { slide, el };
    slide.enter(el).then(() => {
      $(".c-prev", el).onclick = $(".c-next", el).onclick = (e) => { e.stopPropagation(); this.closeReplay(); };
    });
  },
  closeReplay() {
    if (!this.extra) return;
    const { slide, el } = this.extra;
    el.classList.remove("active");
    slide.leave();
    el.remove();
    this.extra = null;
    $("#story").classList.toggle("interactive", !!this.slides[this.i].interactive);
    this.hold();
    this.resume();
  },

  close() {
    cancelAnimationFrame(this.timer);
    if (this.extra) this.closeReplay();
    const s = this.slides[this.i];
    if (s) { s.el.classList.remove("active"); s.leave && s.leave(s.el); }
    $("#story").classList.add("hidden");
    $("#picker").classList.remove("hidden");
  },
};
window.story = story;

// ---------------- input ----------------
let pressT = 0, longPress = false;
for (const [id, fn] of [["tap-prev", () => story.prev()], ["tap-next", () => story.next()]]) {
  const el = document.getElementById(id);
  el.addEventListener("pointerdown", () => { longPress = false; pressT = setTimeout(() => { longPress = true; story.pause(); }, 260); });
  el.addEventListener("pointerup", () => { clearTimeout(pressT); if (longPress) story.resume(); else fn(); });
  el.addEventListener("pointerleave", () => { clearTimeout(pressT); if (longPress) story.resume(); });
}
$("#close").addEventListener("click", () => story.close());
document.addEventListener("keydown", (e) => {
  if ($("#story").classList.contains("hidden")) return;
  if (e.key === "ArrowRight" || e.key === " ") story.next();
  else if (e.key === "ArrowLeft") story.prev();
  else if (e.key === "Escape") story.extra ? story.closeReplay() : story.close();
});
document.addEventListener("visibilitychange", () => (document.hidden ? story.pause() : story.resume()));

// ---------------- all-time home (/total/) ----------------
async function bootTotalHome() {
  document.body.classList.add("totalhome");
  const sky = $(".picker-sky");
  for (let k = 0; k < 50; k++) {
    const st = document.createElement("span");
    Object.assign(st.style, { left: `${Math.random() * 100}%`, top: `${Math.random() * 60}%`, animationDelay: `${Math.random() * 3}s` });
    sky.appendChild(st);
  }
  const crewAll = await getJSON("data/crew_all.json");
  const tot = crewAll.pilots.reduce((a, p) => ({ flights: a.flights + p.flights, hours: a.hours + p.hours, km: a.km + p.km }), { flights: 0, hours: 0, km: 0 });
  $(".eyebrow").textContent = `Syride · depuis ${Math.min(...crewAll.pilots.map((p) => +p.since.slice(0, 4)))}`;
  $(".picker-title").innerHTML = "Sky<br>Wrapped";
  $(".picker-sub").innerHTML = `Toutes nos années de vol.<br>${fmt(tot.flights)} vols · ${fmt(tot.hours, 0)} h · ${fmt(tot.km)} km à cinq.`;
  const list = $("#pilot-list");
  for (const p of [...crewAll.pilots].sort((a, b) => b.hours - a.hours)) {
    list.appendChild(h(`<a class="pilot-btn" href="${PAGES[p.pilot]}/total/"><span><div class="name">${esc(p.pilot)}</div>
      <div class="meta">depuis ${p.since.slice(0, 4)} · ${fmt(p.flights)} vols · ${fmt(p.hours, 0)} h · ${fmt(p.km)} km</div></span><span class="go">→</span></a>`));
  }
  list.appendChild(h(`<a class="pilot-btn day-btn" href="bisanne/"><span><div class="name">Bisanne, 17 juin 2023</div>
    <div class="meta">La journée à quatre, en 3D</div></span><span class="go">→</span></a>`));
  list.appendChild(h(`<a class="pilot-btn" href="./"><span><div class="name">Wrapped 2026</div>
    <div class="meta">Juste cette année</div></span><span class="go">→</span></a>`));
}

// ---------------- boot ----------------
async function boot() {
  if (window.MODE === "3d" && window.PILOT) return openDirect3D(window.PILOT);
  if (window.MODE === "all" && window.PILOT) {
    document.body.classList.add("direct3d");
    const [a, crewAll] = await Promise.all([getJSON(`data/${encodeURIComponent(window.PILOT)}_all.json`), getJSON("data/crew_all.json")]);
    story.open(slidesForAll(a, crewAll));
    $("#close").onclick = () => (location.href = `${window.SLUG}/`);
    return;
  }
  if (window.MODE === "totalhome") return bootTotalHome();
  if (window.MODE === "card" && window.PILOT) {
    // /<slug>/carte/: straight to the share card
    document.body.classList.add("direct3d");
    const data = await getJSON(`data/${encodeURIComponent(window.PILOT)}.json`);
    const tracked = data.flights.filter((f) => f.track);
    const slide = shareSlide(data.summary, featuredFlight(tracked) || null);
    story.open([slide]);
    const back = () => (location.href = `${window.SLUG}/`);
    $("#close").onclick = back;
    $(".switch-btn", slide.node).textContent = "Voir le Wrapped";
    $(".switch-btn", slide.node).onclick = (e) => { e.stopPropagation(); back(); };
    $(".replay-btn", slide.node).remove();
    return;
  }
  if (window.MODE === "day") {
    document.body.classList.add("direct3d");
    story.open(slidesForDay(await getJSON(`data/day_${window.DAY}.json`)));
    $("#close").onclick = () => story.go(0);
    return;
  }
  const sky = $(".picker-sky");
  for (let k = 0; k < 50; k++) {
    const st = document.createElement("span");
    Object.assign(st.style, { left: `${Math.random() * 100}%`, top: `${Math.random() * 60}%`, animationDelay: `${Math.random() * 3}s` });
    sky.appendChild(st);
  }
  const crew = await getJSON("data/crew.json");
  const list = $("#pilot-list");
  // personal pages (/nico/, /elie/, ...) set window.PILOT: show only that pilot's start button
  const mine = window.PILOT && PILOTS.includes(window.PILOT) ? window.PILOT : null;
  if (mine) $(".picker-sub").innerHTML = `Une année de vol, rembobinée.<br>On y va, ${esc(mine)} ?`;
  for (const p of crew.pilots) {
    if (mine && p.pilot !== mine) continue;
    const b = h(`<button class="pilot-btn"><span><div class="name">${mine ? "C'est parti" : esc(p.pilot)}</div>
      <div class="meta">${p.flights} vols · ${fmt(p.hours, 0)} h · ${fmt(p.km)} km</div></span><span class="go">→</span></button>`);
    b.addEventListener("click", async () => {
      const data = await getJSON(`data/${encodeURIComponent(p.pilot)}.json`);
      story.open(slidesFor(data, crew));
      if (!mine) history.replaceState(null, "", `#${encodeURIComponent(p.pilot)}`);
    });
    list.appendChild(b);
  }
  if (mine) {
    list.appendChild(h(`<a class="pilot-btn" href="${window.SLUG}/total/"><span><div class="name">Depuis le début</div>
      <div class="meta">Toutes tes années de vol</div></span><span class="go">→</span></a>`));
    return;
  }
  list.appendChild(h(`<a class="pilot-btn day-btn" href="bisanne/"><span><div class="name">Bisanne, 17 juin 2023</div>
    <div class="meta">La journée à quatre, en 3D</div></span><span class="go">→</span></a>`));
  const want = decodeURIComponent(location.hash.slice(1));
  if (PILOTS.includes(want)) {
    const data = await getJSON(`data/${encodeURIComponent(want)}.json`);
    story.open(slidesFor(data, crew));
  }
}
boot();
