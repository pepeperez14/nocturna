/* Nocturna · interfaz */
(() => {
'use strict';
const X = window.Astro;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const MIN = 60000, DAY = 86400000;

/* ---------- utilidades ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('noct.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('noct.' + k, JSON.stringify(v)); } catch {} }
};
const pad = n => String(n).padStart(2, '0');
const fT = d => d ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : '—';
const fD = d => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fDs = d => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const fDT = d => fDs(d) + ' · ' + fT(d);
const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const card = az => CARD[Math.round(X.norm360(az) / 22.5) % 16];
const fAz = az => az.toFixed(1).replace('.', ',') + '° ' + card(az);
const fAlt = a => (a >= 0 ? '+' : '') + a.toFixed(1).replace('.', ',') + '°';
const fN = (n, d = 1) => n.toFixed(d).replace('.', ',');
const fDist = m => m < 1000 ? Math.round(m) + ' m' : fN(m / 1000, m < 10000 ? 2 : 1) + ' km';
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms || 2600);
}
function moonSvg(illum, waxing, size) {
  size = size || 28; const r = 9, x = r * (1 - 2 * illum), sweep = illum > 0.5 ? 1 : 0;
  const lit = `M0,${-r} A${r},${r} 0 0 1 0,${r} A${Math.abs(x).toFixed(2)},${r} 0 0 ${sweep} 0,${-r}Z`;
  return `<svg width="${size}" height="${size}" viewBox="-11 -11 22 22" aria-hidden="true"><circle r="${r}" fill="var(--panel-2)" stroke="var(--line)" stroke-width="1"/><path d="${lit}" fill="var(--moon)" transform="${waxing ? '' : 'scale(-1,1)'}"/></svg>`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- estado ---------- */
const S = {
  cam: LS.get('cam', { lat: 42.8467, lon: -2.6716, elev: 525, name: 'Vitoria-Gasteiz' }),
  obj: LS.get('obj', null),
  t: Date.now(),
  layer: LS.get('layer', 0),
  hz: LS.get('hz', null),
  night: LS.get('night', false),
  step: 10,
  camera: LS.get('camera', { sensor: 'ff', mp: 24, f: 14, n: 2.8, w: 36, h: 24 }),
  plans: LS.get('plans', []),
  manualH: { A: false, B: false }
};
const saveLoc = () => { LS.set('cam', S.cam); LS.set('obj', S.obj); };
const OB = () => X.observer(S.cam.lat, S.cam.lon, S.cam.elev || 0);
const hzValid = () => S.hz && X.inverse(S.cam.lat, S.cam.lon, S.hz.lat, S.hz.lon).dist < 150;
document.documentElement.dataset.night = S.night ? '1' : '0';

/* ---------- pestañas ---------- */
let curTab = 'map';
function showTab(name) {
  curTab = name;
  $$('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
  $$('.view').forEach(v => v.hidden = v.dataset.view !== name);
  if (name === 'map') setTimeout(() => { map.invalidateSize(); drawAll(); }, 30);
  if (name === 'align') renderAlignHeader();
  if (name === 'ev') renderEvents();
  if (name === 'more') renderCalc();
  if (name === 'ar') AR.enter(); else AR.leave();
}
$$('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---------- mapa ---------- */
const IGN = l => `https://www.ign.es/wmts/${l}&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}`;
const LAYERS = [
  { name: 'Mapa IGN', l: () => L.tileLayer(IGN('ign-base?layer=IGNBaseTodo'), { maxZoom: 19, attribution: '© IGN España' }) },
  { name: 'Ortofoto PNOA', l: () => L.tileLayer(IGN('pnoa-ma?layer=OI.OrthoimageCoverage'), { maxZoom: 19, attribution: 'PNOA © IGN' }) },
  { name: 'Topográfico', l: () => L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, subdomains: 'abc', attribution: '© OpenTopoMap, © OpenStreetMap' }) },
  { name: 'Satélite mundial', l: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' }) },
  { name: 'OpenStreetMap', l: () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }) }
];
const map = L.map('map', { zoomControl: false, attributionControl: true, tap: true }).setView([S.cam.lat, S.cam.lon], 13);
let tileLayer = LAYERS[S.layer % LAYERS.length].l().addTo(map);
$('#btn-layer').onclick = () => {
  S.layer = (S.layer + 1) % LAYERS.length; LS.set('layer', S.layer);
  map.removeLayer(tileLayer); tileLayer = LAYERS[S.layer].l().addTo(map); toast(LAYERS[S.layer].name);
};
const pinIcon = (cls, ch) => L.divIcon({ className: '', html: `<div class="pin ${cls}"><b>${ch}</b></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
const camM = L.marker([S.cam.lat, S.cam.lon], { draggable: true, icon: pinIcon('cam', 'C'), zIndexOffset: 1000 }).addTo(map);
let objM = null;
const lines = L.layerGroup().addTo(map);
camM.on('drag', () => { const p = camM.getLatLng(); S.cam.lat = p.lat; S.cam.lon = p.lng; drawLines(); });
camM.on('dragend', () => { const p = camM.getLatLng(); setCam(p.lat, p.lng); });
function setCam(lat, lon, name) {
  S.cam = { lat, lon, elev: S.cam.elev, name: name || 'Punto en el mapa' };
  camM.setLatLng([lat, lon]); S.manualH.A = false; saveLoc();
  fetchElev([[lat, lon]]).then(e => { if (e && e[0] != null) { S.cam.elev = e[0]; saveLoc(); drawAll(); } });
  invalidateCaches(); drawAll();
}
function setObj(lat, lon) {
  S.obj = { lat, lon, elev: S.obj ? S.obj.elev : null };
  if (!objM) {
    objM = L.marker([lat, lon], { draggable: true, icon: pinIcon('obj', 'O') }).addTo(map);
    objM.on('drag', () => { const p = objM.getLatLng(); S.obj.lat = p.lat; S.obj.lon = p.lng; drawLines(); drawAB(); });
    objM.on('dragend', () => { const p = objM.getLatLng(); setObj(p.lat, p.lng); });
    objM.on('click', () => { if (confirmRemoveObj()) clearObj(); });
  } else objM.setLatLng([lat, lon]);
  S.manualH.B = false; saveLoc();
  fetchElev([[lat, lon]]).then(e => { if (e && e[0] != null && S.obj) { S.obj.elev = e[0]; saveLoc(); drawAB(); } });
  drawAll();
}
let removeArmed = 0;
function confirmRemoveObj() {
  if (Date.now() - removeArmed < 2500) return true;
  removeArmed = Date.now(); toast('Toca otra vez el objetivo para quitarlo'); return false;
}
function clearObj() { if (objM) map.removeLayer(objM); objM = null; S.obj = null; saveLoc(); drawAll(); }
if (S.obj) setObj(S.obj.lat, S.obj.lon);

let placingObj = false;
$('#btn-obj').onclick = () => {
  placingObj = !placingObj;
  $('#btn-obj').style.borderColor = placingObj ? 'var(--target)' : '';
  toast(placingObj ? 'Toca el mapa donde está el objetivo' : 'Cancelado');
};
map.on('click', e => {
  if (placingObj) { placingObj = false; $('#btn-obj').style.borderColor = ''; setObj(e.latlng.lat, e.latlng.lng); }
});
map.on('contextmenu', e => { setCam(e.latlng.lat, e.latlng.lng); toast('Cámara movida aquí'); });
map.on('moveend zoomend', () => drawLines());

$('#btn-gps').onclick = () => {
  if (!navigator.geolocation) return toast('Este navegador no da la ubicación');
  toast('Buscando tu posición…');
  navigator.geolocation.getCurrentPosition(p => {
    setCam(p.coords.latitude, p.coords.longitude, 'Mi ubicación');
    map.setView([p.coords.latitude, p.coords.longitude], 15);
  }, err => toast('Sin ubicación: ' + (err.code === 1 ? 'permiso denegado' : 'no disponible')), { enableHighAccuracy: true, timeout: 15000 });
};

/* Búsqueda de lugares y coordenadas */
let qTimer;
$('#q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(doSearch, 450); });
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(qTimer); doSearch(); } });
async function doSearch() {
  const q = $('#q').value.trim(), ul = $('#qres');
  if (q.length < 3) { ul.hidden = true; return; }
  const m = q.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  let items = [];
  if (m) items = [{ name: 'Coordenadas ' + q, lat: +m[1].replace(',', '.'), lon: +m[2].replace(',', '.') }];
  else {
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=es&q=' + encodeURIComponent(q));
      items = (await r.json()).map(x => ({ name: x.display_name, lat: +x.lat, lon: +x.lon }));
    } catch { items = []; }
  }
  ul.innerHTML = items.length ? items.map((x, i) => `<li><button data-i="${i}">${esc(x.name)}</button></li>`).join('') : '<li class="small muted" style="padding:10px">Sin resultados. Prueba con otro nombre o con «42.85, -2.67».</li>';
  ul.hidden = false;
  ul.querySelectorAll('button').forEach(b => b.onclick = () => {
    const x = items[+b.dataset.i]; ul.hidden = true; $('#q').value = ''; $('#q').blur();
    map.setView([x.lat, x.lon], 14); setCam(x.lat, x.lon, x.name.split(',')[0]);
  });
}
map.on('click', () => { $('#qres').hidden = true; });

/* ---------- elevaciones (Open-Meteo, Copernicus 90 m) ---------- */
async function fetchElev(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i += 100) {
    const ch = pts.slice(i, i + 100);
    const url = 'https://api.open-meteo.com/v1/elevation?latitude=' + ch.map(p => p[0].toFixed(5)).join(',') + '&longitude=' + ch.map(p => p[1].toFixed(5)).join(',');
    let ok = false;
    for (let k = 0; k < 3 && !ok; k++) {
      try { const r = await fetch(url); if (!r.ok) throw 0; const j = await r.json(); out.push(...j.elevation); ok = true; }
      catch { await new Promise(r => setTimeout(r, 800 * (k + 1))); }
    }
    if (!ok) return null;
  }
  return out;
}

/* ---------- reloj ---------- */
function setT(t, keepView) { S.t = t; drawAll(); }
$('#d-prev').onclick = () => setT(S.t - DAY);
$('#d-next').onclick = () => setT(S.t + DAY);
$('#t-now').onclick = () => setT(Date.now());
$('#t-minus').onclick = () => setT(S.t - S.step * MIN);
$('#t-plus').onclick = () => setT(S.t + S.step * MIN);
$$('#tstep button').forEach(b => b.onclick = () => { S.step = +b.dataset.m; $$('#tstep button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
// Tocar la hora abre un selector de fecha y hora
$('#when').onclick = () => {
  const inp = document.createElement('input'); inp.type = 'datetime-local';
  const d = new Date(S.t); inp.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  inp.style.cssText = 'position:fixed;opacity:0;top:40%;left:40%';
  document.body.appendChild(inp);
  inp.onchange = () => { if (inp.value) setT(new Date(inp.value).getTime()); inp.remove(); };
  inp.onblur = () => setTimeout(() => inp.remove(), 300);
  inp.focus(); if (inp.showPicker) try { inp.showPicker(); } catch {}
};
$('#grab').onclick = () => { $('#sheet').classList.toggle('collapsed'); drawAll(); };

/* Línea de tiempo del día */
const tlCache = {};
function daySamples(ds) {
  const key = ds.getTime() + '|' + S.cam.lat.toFixed(3) + '|' + S.cam.lon.toFixed(3);
  if (tlCache.key === key) return tlCache.v;
  const ob = OB(), v = [];
  for (let m = 0; m <= 1440; m += 5) {
    const d = new Date(ds.getTime() + m * MIN);
    v.push({ sun: X.pos('Sun', d, ob).alt, moon: X.pos('Moon', d, ob).alt, gc: X.pos('GC', d, ob).alt });
  }
  tlCache.key = key; tlCache.v = v; return v;
}
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function lightColor(alt) {
  const k = X.sunLight(alt);
  return { day: cssv('--day'), golden: cssv('--golden'), blue: cssv('--blue'), twilight: cssv('--twi'), night: cssv('--night') }[k];
}
function drawTimeline() {
  const c = $('#tl'), r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  if (!r.width) return;
  c.width = r.width * dpr; c.height = r.height * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const W = r.width, H = r.height, ds = dayStart(S.t), v = daySamples(ds), n = v.length - 1;
  for (let i = 0; i < n; i++) { g.fillStyle = lightColor(v[i].sun); g.fillRect(i / n * W, 0, W / n + 1, H); }
  const band = (key, y, col) => {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) if (v[i][key] > 0) g.fillRect(i / n * W, y, W / n + 0.6, 4);
  };
  band('moon', H - 14, cssv('--moon')); band('gc', H - 7, cssv('--gc'));
  const x = (S.t - ds.getTime()) / DAY * W;
  g.fillStyle = cssv('--text'); g.fillRect(x - 1, 0, 2, H);
  g.beginPath(); g.moveTo(x - 6, 0); g.lineTo(x + 6, 0); g.lineTo(x, 7); g.fill();
}
(() => {
  const el = $('#timeline'); let down = false;
  const set = e => { const r = el.getBoundingClientRect(); const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); const m = Math.round(f * 1440 / S.step) * S.step; S.t = dayStart(S.t).getTime() + Math.min(1439, m) * MIN; drawAll(true); };
  el.addEventListener('pointerdown', e => { down = true; el.setPointerCapture(e.pointerId); set(e); });
  el.addEventListener('pointermove', e => { if (down) set(e); });
  el.addEventListener('pointerup', () => { down = false; drawAll(); });
})();

/* ---------- eventos del día (con caché) ---------- */
let evCache = { key: '' };
function invalidateCaches() { evCache.key = ''; tlCache.key = ''; }
function getDay() {
  const ds = dayStart(S.t);
  const key = ds.getTime() + '|' + S.cam.lat.toFixed(4) + '|' + S.cam.lon.toFixed(4) + '|' + (hzValid() ? 'h' : '');
  if (evCache.key === key) return evCache;
  const ob = OB();
  const ev = X.dayEvents(ds, ob);
  let real = null;
  if (hzValid()) real = { sun: X.realRiseSet('Sun', ds, ob, S.hz.prof), moon: X.realRiseSet('Moon', ds, ob, S.hz.prof) };
  const paths = {
    Sun: X.path('Sun', ds, ob, 24, 10), Moon: X.path('Moon', ds, ob, 24, 10), GC: X.path('GC', ds, ob, 24, 15)
  };
  evCache = { key, ds, ev, real, paths };
  return evCache;
}

/* ---------- dibujo principal ---------- */
function drawAll(fast) {
  const d = new Date(S.t), ds = dayStart(S.t);
  $('#w-time').textContent = fT(d);
  const ob = OB();
  const sun = X.pos('Sun', d, ob), moon = X.pos('Moon', d, ob), gc = X.pos('GC', d, ob), mi = X.moonInfo(d, ob);
  S.now = { sun, moon, gc, mi };
  $('#w-date').textContent = fD(d) + ' · ' + X.LIGHT_LABEL[X.sunLight(sun.alt)];
  $('#b-sun').textContent = fAlt(sun.alt); $('#b-sun2').textContent = fAz(sun.az);
  $('#b-moon').innerHTML = fAlt(moon.alt); $('#b-moon2').textContent = fAz(moon.az) + ' · ' + Math.round(mi.illum * 100) + ' %';
  $('#b-gc').textContent = fAlt(gc.alt); $('#b-gc2').textContent = fAz(gc.az);
  drawTimeline();
  drawLines();
  if (fast) return;
  if (!$('#sheet').classList.contains('collapsed')) { renderDay(); drawPano(); }
  drawAB();
}

function drawLines() {
  lines.clearLayers();
  if (!S.now) return;
  const b = map.getBounds(), diag = map.distance(b.getNorthWest(), b.getSouthEast());
  const L1 = Math.max(400, diag * 0.7);
  const from = [S.cam.lat, S.cam.lon];
  const ray = (az, col, opt) => {
    const to = X.destination(S.cam.lat, S.cam.lon, az, (opt && opt.len) || L1);
    L.polyline([from, to], Object.assign({ color: col, weight: 3, opacity: .95, interactive: false }, opt || {})).addTo(lines);
  };
  const day = getDay(), ev = day.ev;
  const C = { sun: cssv('--sun'), moon: cssv('--moon'), gc: cssv('--gc'), tgt: cssv('--target') };
  if (ev.sunriseAz != null) ray(ev.sunriseAz, C.sun, { weight: 2, dashArray: '8 7', opacity: .8 });
  if (ev.sunsetAz != null) ray(ev.sunsetAz, C.sun, { weight: 2, dashArray: '3 6', opacity: .8 });
  if (ev.moonriseAz != null) ray(ev.moonriseAz, C.moon, { weight: 2, dashArray: '8 7', opacity: .8 });
  if (ev.moonsetAz != null) ray(ev.moonsetAz, C.moon, { weight: 2, dashArray: '3 6', opacity: .8 });
  const n = S.now;
  if (n.sun.alt > -1) ray(n.sun.az, C.sun, { weight: 5 });
  if (n.moon.alt > -1) ray(n.moon.az, C.moon, { weight: 5 });
  if (n.gc.alt > -1) ray(n.gc.az, C.gc, { weight: 4 });
  if (S.obj) L.polyline([from, [S.obj.lat, S.obj.lon]], { color: C.tgt, weight: 2.5, interactive: false }).addTo(lines);
}

function abGeom() {
  if (!S.obj) return null;
  const inv = X.inverse(S.cam.lat, S.cam.lon, S.obj.lat, S.obj.lon);
  const hA = (S.alH && S.alH.A != null ? S.alH.A : (S.cam.elev || 0)) + (+$('#al-tA').value || 0);
  const groundB = S.alH && S.alH.B != null ? S.alH.B : (S.obj.elev != null ? S.obj.elev : (S.cam.elev || 0));
  const hB = groundB + (+$('#al-tB').value || 0);
  return { dist: inv.dist, az: inv.az, el: X.elevationAngle(hA, hB, inv.dist), hA, hB, noGround: S.obj.elev == null && !(S.alH && S.alH.B != null) };
}
function drawAB() {
  const g = abGeom(); $('#ab-box').hidden = !g;
  if (!g) return;
  $('#ab-d').textContent = fDist(g.dist); $('#ab-az').textContent = fN(g.az, 1) + '°'; $('#ab-el').textContent = fAlt(g.el);
  // Tamaño aparente del objetivo frente a la Luna
  const tB = +$('#al-tB').value || 0, mi = S.now ? S.now.mi : null;
  if (g.noGround) $('#ab-moon').textContent = 'Sin altura del terreno en el objetivo (sin conexión): se ha supuesto la misma que en la cámara. Corrígela en Alinear.';
  else if (tB > 0 && mi) {
    const ang = Math.atan(tB / g.dist) * X.R2D;
    $('#ab-moon').textContent = `Con ${fN(tB, 0)} m de alto, el objetivo mide ${fN(ang, 2)}°; la Luna ahora ${fN(mi.diamDeg, 2)}° (${fN(ang / mi.diamDeg, 1)} lunas).`;
  } else $('#ab-moon').textContent = 'Indica la altura del objetivo en Alinear para comparar su tamaño con el de la Luna.';
}

function renderDay() {
  const { ev, real } = getDay();
  const C = { s: 'var(--sun)', m: 'var(--moon)', g: 'var(--gc)', b: 'var(--act)', n: 'var(--line)' };
  const list = [
    [ev.astroDawn, 'Termina la noche astronómica', C.n],
    [ev.nauticalDawn, 'Amanecer náutico', C.n],
    [ev.civilDawn, 'Empieza la hora azul', C.b, ev.blueMorningEnd ? 'hasta ' + fT(ev.blueMorningEnd) : ''],
    [ev.sunrise, 'Sale el Sol', C.s, ev.sunriseAz != null ? fN(ev.sunriseAz, 1) + '°' : ''],
    [ev.goldenMorningEnd, 'Termina la hora dorada', C.s],
    [ev.noon, 'Mediodía solar', C.s, fAlt(ev.noonAlt)],
    [ev.goldenEveningStart, 'Empieza la hora dorada', C.s],
    [ev.sunset, 'Se pone el Sol', C.s, ev.sunsetAz != null ? fN(ev.sunsetAz, 1) + '°' : ''],
    [ev.blueEveningStart, 'Empieza la hora azul', C.b, ev.civilDusk ? 'hasta ' + fT(ev.civilDusk) : ''],
    [ev.nauticalDusk, 'Anochecer náutico', C.n],
    [ev.astroDusk, 'Empieza la noche astronómica', C.n],
    [ev.moonrise, 'Sale la Luna', C.m, ev.moonriseAz != null ? fN(ev.moonriseAz, 1) + '°' : ''],
    [ev.moonset, 'Se pone la Luna', C.m, ev.moonsetAz != null ? fN(ev.moonsetAz, 1) + '°' : ''],
    [ev.gcRise, 'Sale el núcleo galáctico', C.g, ev.gcRiseAz != null ? fN(ev.gcRiseAz, 1) + '°' : ''],
    [ev.gcTransit, 'Culmina el núcleo', C.g, fAlt(ev.gcTransitAlt)],
    [ev.gcSet, 'Se pone el núcleo', C.g, ev.gcSetAz != null ? fN(ev.gcSetAz, 1) + '°' : '']
  ];
  if (real) {
    const add = (o, txt, col) => { if (o) list.push([o.date, txt, col, fN(o.az, 1) + '° · ' + fAlt(o.alt)]); };
    add(real.sun.rise, 'El Sol asoma tras el relieve', C.s); add(real.sun.set, 'El Sol se oculta tras el relieve', C.s);
    add(real.moon.rise, 'La Luna asoma tras el relieve', C.m); add(real.moon.set, 'La Luna se oculta tras el relieve', C.m);
  }
  const rows = list.filter(r => r[0]).sort((x, y) => x[0] - y[0]);
  $('#events').innerHTML = rows.map(r => `<div class="e${r[0] < S.t ? ' past' : ''}"><b>${fT(r[0])}</b><i style="background:${r[2]}"></i><div>${r[1]}</div><span>${r[3] || ''}</span></div>`).join('')
    + (ev.astroDusk || ev.astroDawn ? '' : '<p class="small muted">Hoy no hay noche astronómica completa a esta latitud.</p>');
  const mi = S.now.mi;
  $('#facts').innerHTML = `<div><small>Fase</small>${mi.name}</div><div><small>Iluminación</small>${Math.round(mi.illum * 100)} %</div><div><small>Distancia de la Luna</small>${Math.round(mi.distKm).toLocaleString('es-ES')} km</div><div><small>Diámetro aparente</small>${fN(mi.diamDeg * 60, 1)}′</div>`;
  $('#loc-line').textContent = `Cámara: ${S.cam.lat.toFixed(5)}, ${S.cam.lon.toFixed(5)} · ${Math.round(S.cam.elev || 0)} m. Mantén pulsado el mapa para mover la cámara.`;
  $('#hz-state').textContent = hzValid() ? 'Perfil calculado para este punto' : '';
}

/* ---------- panorama ---------- */
const PX_DEG = 4, ALT_MIN = -8, ALT_MAX = 62;
function drawPano() {
  const c = $('#pano'), dpr = devicePixelRatio || 1, W = 360 * PX_DEG, H = 200;
  c.style.width = W + 'px'; c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const y = alt => H - (alt - ALT_MIN) / (ALT_MAX - ALT_MIN) * H, x = az => X.norm360(az) * PX_DEG;
  const d = new Date(S.t), { paths } = getDay();
  g.fillStyle = lightColor(S.now.sun.alt); g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(5,9,20,.62)'; g.fillRect(0, 0, W, H);
  // rejilla
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; g.fillStyle = cssv('--muted'); g.font = '12px ' + cssv('--font');
  for (let a = 0; a < 360; a += 15) { g.beginPath(); g.moveTo(x(a) + .5, 0); g.lineTo(x(a) + .5, H); g.stroke(); if (a % 45 === 0) g.fillText(CARD[a / 22.5] + ' ' + a + '°', x(a) + 3, 13); }
  for (let a = 0; a <= 60; a += 10) { g.beginPath(); g.moveTo(0, y(a) + .5); g.lineTo(W, y(a) + .5); g.stroke(); }
  // Vía Láctea (arco a la hora seleccionada)
  const arc = X.milkyWayArc(d, OB(), 3);
  g.strokeStyle = cssv('--gc'); g.globalAlpha = .28; g.lineWidth = 22; g.lineCap = 'round';
  polyline(arc); g.globalAlpha = 1; g.lineWidth = 1;
  // trayectorias
  const tr = (p, col, w) => { g.strokeStyle = col; g.lineWidth = w; polyline(p); };
  tr(paths.GC, cssv('--gc'), 1.5); tr(paths.Moon, cssv('--moon'), 2); tr(paths.Sun, cssv('--sun'), 2);
  // marcas horarias
  g.font = '11px ' + cssv('--font');
  for (const [k, col] of [['Sun', '--sun'], ['Moon', '--moon']]) {
    g.fillStyle = cssv(col);
    paths[k].forEach(p => { if (p.t.getMinutes() === 0 && p.alt > ALT_MIN && p.alt < ALT_MAX) { g.beginPath(); g.arc(x(p.az), y(p.alt), 2.5, 0, 7); g.fill(); g.fillText(p.t.getHours() + 'h', x(p.az) + 4, y(p.alt) - 4); } });
  }
  // relieve u horizonte plano
  g.fillStyle = '#05080f';
  g.beginPath(); g.moveTo(0, H);
  for (let a = 0; a <= 360; a += 1) g.lineTo(x(a) || (a === 360 ? W : 0), y(hzValid() ? X.horizonAlt(S.hz.prof, a) : 0));
  g.lineTo(W, H); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(0, y(0)); g.lineTo(W, y(0)); g.stroke();
  // objetivo
  const ab = abGeom();
  if (ab) { g.strokeStyle = cssv('--target'); g.lineWidth = 2; const cx = x(ab.az), cy = y(ab.el); g.beginPath(); g.moveTo(cx - 10, cy); g.lineTo(cx + 10, cy); g.moveTo(cx, cy - 10); g.lineTo(cx, cy + 10); g.stroke(); g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.stroke(); }
  // posiciones actuales
  const dot = (p, col, r) => { g.fillStyle = col; g.beginPath(); g.arc(x(p.az), y(p.alt), r, 0, 7); g.fill(); };
  dot(S.now.gc, cssv('--gc'), 5); dot(S.now.moon, cssv('--moon'), 7); dot(S.now.sun, cssv('--sun'), 8);
  // centrar la vista en lo relevante
  const wrap = $('#pano-wrap'), focus = ab ? ab.az : (S.now.moon.alt > 0 ? S.now.moon.az : S.now.sun.az);
  if (!drawPano.touched) wrap.scrollLeft = x(focus) - wrap.clientWidth / 2;
  function polyline(p) {
    g.beginPath(); let prev = null;
    for (const q of p) {
      const px = x(q.az), py = y(q.alt);
      if (prev && Math.abs(px - prev) < W / 2) g.lineTo(px, py); else g.moveTo(px, py);
      prev = px;
    }
    g.stroke();
  }
}
$('#pano-wrap').addEventListener('touchstart', () => drawPano.touched = true, { passive: true });

/* ---------- horizonte con relieve ---------- */
$('#btn-horizon').onclick = async () => {
  const btn = $('#btn-horizon'); btn.disabled = true;
  const dists = [150, 300, 500, 800, 1200, 1800, 2500, 3500, 5000, 7000, 9000, 12000, 15000, 19000, 24000, 30000, 38000, 47000, 60000];
  const STEP = 2, pts = X.horizonSamplePoints(S.cam.lat, S.cam.lon, STEP, dists);
  const all = [[S.cam.lat, S.cam.lon], ...pts.map(p => [p.lat, p.lon])];
  const elevs = [];
  for (let i = 0; i < all.length; i += 100) {
    $('#hz-state').textContent = `Descargando relieve ${Math.round(i / all.length * 100)} %`;
    const e = await fetchElev(all.slice(i, i + 100));
    if (!e) { $('#hz-state').textContent = 'No se pudo descargar el relieve. Comprueba la conexión.'; btn.disabled = false; return; }
    elevs.push(...e);
  }
  const h0 = elevs[0] + 1.6;
  S.cam.elev = elevs[0]; saveLoc();
  const prof = X.buildHorizon(pts, elevs.slice(1), h0, STEP);
  S.hz = { lat: S.cam.lat, lon: S.cam.lon, prof, h0 }; LS.set('hz', S.hz);
  btn.disabled = false; invalidateCaches(); drawAll();
  const mx = prof.reduce((a, b) => b.alt > a.alt ? b : a);
  toast(`Horizonte listo. Máximo ${fN(mx.alt, 1)}° hacia ${card(mx.az)}`);
};

/* ---------- guardar planes ---------- */
$('#btn-save').onclick = () => {
  const d = new Date(S.t);
  const p = { id: Date.now(), t: S.t, cam: S.cam, obj: S.obj, name: (S.cam.name || 'Plan') + ' · ' + fDT(d), tB: +$('#al-tB').value || 0 };
  S.plans.unshift(p); LS.set('plans', S.plans); toast('Plan guardado en Cámara › Planes');
};
function renderPlans() {
  const el = $('#plans');
  if (!S.plans.length) { el.innerHTML = '<p class="small muted">Aún no hay planes. En el planificador, pulsa el marcador para guardar la escena actual.</p>'; return; }
  el.innerHTML = S.plans.map((p, i) => `<div class="res" style="grid-template-columns:1fr auto auto"><div><div class="d">${esc(p.name)}</div><div class="m">${p.obj ? 'Con objetivo a ' + fDist(X.inverse(p.cam.lat, p.cam.lon, p.obj.lat, p.obj.lon).dist) : 'Sin objetivo'}</div></div><button class="btn small" data-o="${i}">Abrir</button><button class="btn small" data-x="${i}">Borrar</button></div>`).join('');
  el.querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
    const p = S.plans[+b.dataset.o];
    S.cam = p.cam; camM.setLatLng([p.cam.lat, p.cam.lon]);
    if (p.obj) setObj(p.obj.lat, p.obj.lon); else clearObj();
    $('#al-tB').value = p.tB || 0;
    map.setView([p.cam.lat, p.cam.lon], 13); invalidateCaches(); S.t = p.t; saveLoc(); showTab('map'); openSheet();
  });
  el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
    if (b.dataset.armed) { S.plans.splice(+b.dataset.x, 1); LS.set('plans', S.plans); renderPlans(); }
    else { b.dataset.armed = 1; b.textContent = '¿Seguro?'; }
  });
}
function openSheet() { $('#sheet').classList.remove('collapsed'); drawAll(); }
function goTo(t) { S.t = t; showTab('map'); openSheet(); }

/* ---------- ALINEAR ---------- */
S.alH = { A: null, B: null };
function renderAlignHeader() {
  $('#al-cam').textContent = `${S.cam.lat.toFixed(5)}, ${S.cam.lon.toFixed(5)}`;
  $('#al-obj').textContent = S.obj ? `${S.obj.lat.toFixed(5)}, ${S.obj.lon.toFixed(5)}` : 'Ponlo en el mapa con el botón de diana';
  if (!S.manualH.A) $('#al-hA').value = Math.round(S.cam.elev || 0);
  if (!S.manualH.B) $('#al-hB').value = S.obj && S.obj.elev != null ? Math.round(S.obj.elev) : '';
  S.alH.A = S.manualH.A ? +$('#al-hA').value : null; S.alH.B = S.manualH.B ? +$('#al-hB').value : null;
  if (!$('#al-from').value) { const d = new Date(); $('#al-from').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  const g = abGeom();
  $('#al-d').textContent = g ? fDist(g.dist) : '—'; $('#al-az').textContent = g ? fN(g.az, 2) + '°' : '—'; $('#al-el').textContent = g ? fAlt(g.el) : '—';
  $('#al-go').disabled = !g && $('#al-altmode').value === 'obj';
}
$('#al-hA').oninput = () => { S.manualH.A = true; renderAlignHeader(); };
$('#al-hB').oninput = () => { S.manualH.B = true; renderAlignHeader(); };
['#al-tA', '#al-tB'].forEach(s => $(s).oninput = renderAlignHeader);
$('#al-altmode').onchange = () => { $('#al-manbox').hidden = $('#al-altmode').value !== 'man'; renderAlignHeader(); };
let alBody = 'Moon';
$$('#al-body button').forEach(b => b.onclick = () => {
  alBody = b.dataset.b; $$('#al-body button').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#al-moonf').hidden = alBody !== 'Moon';
  const tol = alBody === 'GC' ? 2 : 0.5; $('#al-taz').value = tol; $('#al-talt').value = tol;
});
$$('#al-light .chip').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
$$('#al-phase .chip').forEach(b => b.onclick = () => $$('#al-phase .chip').forEach(x => x.setAttribute('aria-pressed', x === b)));
let alAbort = null;
$('#al-stop').onclick = () => alAbort && alAbort.abort();
$('#al-go').onclick = async () => {
  const g = abGeom();
  const manual = $('#al-altmode').value === 'man';
  if (!g) return toast('Pon un objetivo en el mapa');
  const targetAlt = manual ? +$('#al-man').value : g.el;
  const light = $$('#al-light .chip').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.l);
  const ph = $$('#al-phase .chip').find(b => b.getAttribute('aria-pressed') === 'true').dataset.p;
  const start = new Date($('#al-from').value + 'T00:00'), end = new Date(start); end.setMonth(end.getMonth() + +$('#al-span').value);
  alAbort = new AbortController();
  $('#al-go').disabled = true; $('#al-stop').hidden = false; $('#al-prog').hidden = false; $('#al-res').innerHTML = '';
  const ob = X.observer(S.cam.lat, S.cam.lon, g.hA);
  const t0 = performance.now();
  const res = await X.searchAlignment({
    body: alBody, targetAz: g.az, targetAlt, tolAz: +$('#al-taz').value || 0.5, tolAlt: +$('#al-talt').value || 0.5,
    start, end, ob, light,
    illumMin: alBody === 'Moon' && ph === 'full' ? 0.85 : null, illumMax: alBody === 'Moon' && ph === 'cres' ? 0.25 : null,
    signal: alAbort.signal,
    onProgress: (f, n) => { $('#al-prog i').style.width = (f * 100) + '%'; $('#al-msg').textContent = `Buscando… ${n} coincidencias`; }
  });
  $('#al-go').disabled = false; $('#al-stop').hidden = true; $('#al-prog').hidden = true;
  const bodyEs = { Moon: 'la Luna', Sun: 'el Sol', GC: 'el núcleo galáctico' }[alBody];
  $('#al-msg').textContent = res.length
    ? `${res.length} momentos en que ${bodyEs} queda a ${fN(g.az, 1)}° y ${fAlt(targetAlt)} (${fN((performance.now() - t0) / 1000, 1)} s). Toca uno para verlo.`
    : `No hay alineaciones de ${bodyEs} con esos márgenes. Amplía el periodo o el margen, o mueve la cámara unos metros.`;
  $('#al-res').innerHTML = res.map((r, i) => {
    const icon = r.moon ? moonSvg(r.moon.illum, r.moon.waxing, 34) : `<svg width="34" height="34" viewBox="-11 -11 22 22"><circle r="7" fill="${alBody === 'Sun' ? 'var(--sun)' : 'var(--gc)'}"/></svg>`;
    return `<button class="res" data-i="${i}">${icon}<div><div class="d">${fDs(r.date)} · ${fT(r.date)}</div><div class="m"><span class="light ${r.light}">${X.LIGHT_LABEL[r.light]}</span> ${r.moon ? 'Luna ' + Math.round(r.moon.illum * 100) + ' % · ' : ''}Sol ${fAlt(r.sunAlt)}</div></div><div class="x">Δ ${fN(r.dAz, 2)}° / ${fN(r.dAlt, 2)}°<br>${r.date.getFullYear()}</div></button>`;
  }).join('');
  $$('#al-res .res').forEach(b => b.onclick = () => goTo(res[+b.dataset.i].date.getTime()));
};

/* ---------- VÍA LÁCTEA ---------- */
$('#mw-go').onclick = async () => {
  $('#mw-go').disabled = true; $('#mw-prog').hidden = false; $('#mw-res').innerHTML = ''; $('#mw-sum').innerHTML = '';
  const start = dayStart(Date.now());
  const nights = await X.milkyWayNights({
    ob: OB(), start, days: +$('#mw-days').value, minAlt: +$('#mw-alt').value, moonMaxIllum: +$('#mw-moon').value,
    onProgress: f => { $('#mw-prog i').style.width = f * 100 + '%'; }
  });
  $('#mw-go').disabled = false; $('#mw-prog').hidden = true;
  const good = nights.filter(n => n.window && n.minutes >= 30);
  const maxCore = Math.max(...nights.map(n => n.window ? n.window.maxAlt : -90));
  if (!good.length) {
    $('#mw-sum').innerHTML = `<p class="note">No hay noches útiles en el periodo con estos filtros. Desde aquí el núcleo culmina a ${fAlt(90 - Math.abs(S.cam.lat - X.GC_DEC))}. Prueba con un periodo que incluya de marzo a septiembre o baja la altura mínima.</p>`;
    return;
  }
  $('#mw-sum').innerHTML = `<p class="note">${good.length} noches con al menos 30 min útiles. Primera: ${fDs(good[0].window.start)}. Altura máxima del núcleo: ${fAlt(maxCore)}.</p>`;
  let month = '', html = '';
  good.forEach((n, i) => {
    const w = n.window, mName = w.start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    if (mName !== month) { month = mName; html += `<div class="month">${mName[0].toUpperCase() + mName.slice(1)}</div>`; }
    const pct = Math.min(100, n.minutes / 360 * 100);
    html += `<button class="res" data-i="${i}">${moonSvg(n.moon.illum, n.moon.waxing, 34)}<div><div class="d">${fDs(w.start)} · ${fT(w.start)}–${fT(w.end)}</div><div class="m">Núcleo hasta ${fAlt(w.maxAlt)} a ${fN(w.bestAz, 0)}° ${card(w.bestAz)} · ${w.moonUp ? 'Luna fina presente' : 'sin Luna'}</div><div class="bar"><i style="width:${pct}%"></i></div></div><div class="x">${Math.floor(n.minutes / 60)} h ${pad(Math.round(n.minutes % 60))}</div></button>`;
  });
  $('#mw-res').innerHTML = html;
  $$('#mw-res .res').forEach(b => b.onclick = () => goTo(good[+b.dataset.i].window.bestT.getTime()));
};

/* ---------- EVENTOS ---------- */
let evKey = '';
function renderEvents() {
  const key = S.cam.lat.toFixed(2) + S.cam.lon.toFixed(2) + new Date().toDateString();
  if (evKey === key) return; evKey = key;
  const ob = OB(), now = new Date();
  $('#ev-loc').textContent = `Calculados para ${S.cam.name || 'la cámara'} (${S.cam.lat.toFixed(3)}, ${S.cam.lon.toFixed(3)}). Toca uno para verlo en el planificador.`;
  const Q = ['Luna nueva', 'Cuarto creciente', 'Luna llena', 'Cuarto menguante'];
  const qs = X.moonQuarters(now, 4);
  const item = (date, title, sub, right, icon) => `<button class="res" data-t="${date.getTime()}">${icon || ''}<div><div class="d">${title}</div><div class="m">${sub}</div></div><div class="x">${right || ''}</div></button>`;
  $('#ev-phases').innerHTML = qs.map(q => {
    const ill = q.quarter === 0 ? 0 : q.quarter === 2 ? 1 : 0.5;
    let sub = fD(q.date) + ' · ' + fT(q.date);
    let right = '';
    if (q.quarter === 2) right = q.super ? '<span class="moon">Superluna</span><br>' + Math.round(q.distKm / 1000) + ' mil km' : q.micro ? 'Microluna' : '';
    return item(q.date, Q[q.quarter], sub, right, moonSvg(ill, q.quarter < 2, 34));
  }).join('');
  const cj = X.moonConjunctions(now, 120, ob, 4);
  const IC = {
    conj: '<svg width="34" height="34" viewBox="0 0 24 24"><circle cx="9" cy="12" r="5.5" fill="var(--moon)"/><circle cx="18" cy="9" r="2" fill="var(--sun)"/></svg>',
    met: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--act)" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l10 10M9 3l8 8M3 10l6 6"/><circle cx="17" cy="17" r="2.2" fill="var(--act)"/></svg>',
    lun: '<svg width="34" height="34" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#b4533a"/><circle cx="12" cy="12" r="8" fill="none" stroke="var(--moon)" stroke-width="1"/></svg>',
    sol: '<svg width="34" height="34" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="var(--sun)"/><circle cx="15" cy="10" r="7" fill="var(--sky)"/></svg>'
  };
  $('#ev-conj').innerHTML = cj.length ? cj.map(c => item(c.date, `Luna y ${X.PLANET_ES[c.planet]} a ${fN(c.sep, 1)}°`, fDT(c.date) + (c.moonAlt > 0 && c.sunAlt < -6 ? ' · de noche y sobre el horizonte' : c.moonAlt > 0 ? ' · Luna de día' : ' · bajo el horizonte a esa hora') + ' · Luna ' + Math.round(c.illum * 100) + ' %', 'mag ' + fN(c.mag, 1), IC.conj)).join('') : '<p class="small muted">Ninguna por debajo de 4° en los próximos 4 meses.</p>';
  const met = X.meteorShowers(now, ob);
  $('#ev-met').innerHTML = met.map(m => item(m.best ? m.best.date : m.peak, m.name, `Máximo ${fDT(m.peak)}${m.best ? ' · radiante a ' + fAlt(m.best.alt) + ' a las ' + fT(m.best.date) : ''} · Luna ${Math.round(m.moon.illum * 100)} %`, m.rate != null ? '~' + m.rate + '/h' : 'Radiante bajo', IC.met)).join('');
  const le = X.lunarEclipses(now, 5, ob), se = X.solarEclipses(now, 4, ob);
  const KIND = { penumbral: 'penumbral', partial: 'parcial', total: 'total', annular: 'anular' };
  const all = [
    ...le.map(e => ({ date: e.peak, html: item(e.peak, 'Eclipse lunar ' + KIND[e.kind], fDT(e.peak) + ' · Luna a ' + fAlt(e.moonAltAtPeak) + (e.totalMin ? ' · totalidad ' + Math.round(e.totalMin) + ' min' : ''), e.visible ? '<span class="moon">Visible</span>' : 'No visible', IC.lun) })),
    ...se.map(e => ({ date: e.peak, html: item(e.peak, 'Eclipse solar ' + KIND[e.kind] + ' (' + Math.round(e.obscuration * 100) + ' % cubierto)', fDT(e.peak) + ' · Sol a ' + fAlt(e.peakAlt) + ' hacia ' + card(e.az), e.peakAlt > 0 ? '<span class="sun">Visible</span>' : 'Bajo horizonte', IC.sol) }))
  ].sort((a, b) => a.date - b.date);
  $('#ev-ecl').innerHTML = all.map(a => a.html).join('') + '<p class="small muted">Nunca mires ni fotografíes el Sol sin filtro solar homologado, salvo durante la totalidad.</p>';
  $$('#v-ev .res[data-t]').forEach(b => b.onclick = () => goTo(+b.dataset.t));
}

/* ISS */
$('#iss-go').onclick = async () => {
  const msg = $('#iss-msg'); msg.textContent = 'Descargando órbita…';
  let tle = LS.get('tle', null);
  if (!tle || Date.now() - tle.at > 2 * DAY) {
    try {
      const r = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE');
      const lines = (await r.text()).trim().split(/\r?\n/).map(s => s.trim());
      if (lines.length >= 3 && lines[1].startsWith('1 ')) { tle = { l1: lines[1], l2: lines[2], at: Date.now() }; LS.set('tle', tle); }
    } catch {}
  }
  if (!tle) { msg.textContent = 'No se pudo descargar. Pega el TLE en Cámara › Ajustes.'; return; }
  const age = (Date.now() - tle.at) / DAY;
  const passes = issPasses(tle, 10);
  msg.textContent = passes.length ? `${passes.length} pasos visibles en 10 días (órbita de hace ${fN(age, 1)} días)` : 'Ningún paso visible en los próximos 10 días.';
  $('#ev-iss').innerHTML = passes.map(p => `<button class="res" data-t="${p.max.getTime()}"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--act)" stroke-width="1.6"><path d="M3 12h18M8 8h8v8H8z"/></svg><div><div class="d">${fDs(p.start)} · ${fT(p.start)}–${fT(p.end)}</div><div class="m">De ${card(p.azStart)} a ${card(p.azEnd)} · máxima ${fN(p.maxEl, 0)}° a las ${fT(p.max)}</div></div><div class="x">${p.maxEl > 50 ? '<span class="moon">Muy alto</span>' : ''}</div></button>`).join('');
  $$('#ev-iss .res').forEach(b => b.onclick = () => goTo(+b.dataset.t));
};
function issPasses(tle, days) {
  const sat = satellite.twoline2satrec(tle.l1, tle.l2);
  const gd = { latitude: S.cam.lat * X.D2R, longitude: S.cam.lon * X.D2R, height: (S.cam.elev || 0) / 1000 };
  const ob = OB(), out = []; let cur = null;
  const t0 = Date.now();
  for (let t = t0; t < t0 + days * DAY; t += 20000) {
    const d = new Date(t), pv = satellite.propagate(sat, d);
    if (!pv.position) continue;
    const gmst = satellite.gstime(d), ecf = satellite.eciToEcf(pv.position, gmst);
    const la = satellite.ecfToLookAngles(gd, ecf), el = la.elevation * X.R2D, az = la.azimuth * X.R2D;
    let vis = false;
    if (el > 10) {
      const sunAlt = X.pos('Sun', d, ob).alt;
      if (sunAlt < -6) {
        const sv = X.A.GeoVector(X.A.Body.Sun, X.A.MakeTime(d), false), sl = Math.hypot(sv.x, sv.y, sv.z);
        const s = [sv.x / sl, sv.y / sl, sv.z / sl], r = pv.position, proj = r.x * s[0] + r.y * s[1] + r.z * s[2];
        const perp = Math.hypot(r.x - proj * s[0], r.y - proj * s[1], r.z - proj * s[2]);
        vis = !(proj < 0 && perp < 6371);
      }
    }
    if (vis) {
      if (!cur) cur = { start: d, azStart: az, maxEl: el, max: d };
      cur.end = d; cur.azEnd = az; if (el > cur.maxEl) { cur.maxEl = el; cur.max = d; }
    } else if (cur) { if ((cur.end - cur.start) >= 60000) out.push(cur); cur = null; }
  }
  return out;
}

/* ---------- CALCULADORAS ---------- */
const SENSORS = {
  ff: ['Formato completo 36×24', 36, 24], apsc: ['APS-C (Sony, Nikon, Fuji) 23,5×15,6', 23.5, 15.6], apsc_c: ['APS-C Canon 22,3×14,9', 22.3, 14.9],
  m43: ['Micro 4/3 17,3×13', 17.3, 13], one: ['1 pulgada 13,2×8,8', 13.2, 8.8], ip: ['iPhone principal 9,8×7,3', 9.8, 7.3], custom: ['Personalizado', null, null]
};
$('#c-sensor').innerHTML = Object.entries(SENSORS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('');
function readCam() {
  const c = S.camera; c.sensor = $('#c-sensor').value; c.mp = +$('#c-mp').value || 24; c.f = +$('#c-f').value || 14; c.n = +$('#c-n').value || 2.8;
  if (c.sensor === 'custom') { c.w = +$('#c-w').value || 36; c.h = +$('#c-h').value || 24; } else { c.w = SENSORS[c.sensor][1]; c.h = SENSORS[c.sensor][2]; }
  LS.set('camera', c); return c;
}
function renderCalc() {
  const c = S.camera;
  $('#c-sensor').value = c.sensor; $('#c-mp').value = c.mp; $('#c-f').value = c.f; $('#c-n').value = c.n; $('#c-w').value = c.w; $('#c-h').value = c.h;
  $('#c-custom').hidden = c.sensor !== 'custom';
  calcOut(); renderPlans();
  $('#s-night').textContent = S.night ? 'Desactivar' : 'Activar';
}
function calcOut() {
  const c = readCam(), K = X.calc;
  $('#c-custom').hidden = c.sensor !== 'custom';
  const pitch = K.pixelPitch(c.w, c.mp, c.w / c.h), crop = K.crop(c.w, c.h), coc = K.coc(c.w, c.h), dec = +$('#c-dec').value;
  $('#c-info').textContent = `Píxel de ${fN(pitch, 2)} µm · factor de recorte ${fN(crop, 2)} · círculo de confusión ${fN(coc, 3)} mm · equivale a ${Math.round(c.f * crop)} mm en formato completo.`;
  const npf = K.npf(c.f, c.n, pitch, dec), npf2 = K.npfStrict(c.f, c.n, pitch, dec), r5 = K.rule500(c.f, crop);
  const maxT = npf;
  const iso = Math.round(3200 * Math.pow(c.n / 2.8, 2) * 20 / Math.max(1, maxT) / 100) * 100;
  $('#c-stars').innerHTML = kv([
    ['Regla NPF', fN(npf, 1) + ' s'], ['NPF estricta (pantalla 100 %)', fN(npf2, 1) + ' s'], ['Regla del 500 (pantalla pequeña)', fN(r5, 1) + ' s'],
    ['ISO orientativo con NPF', 'ISO ' + Math.max(800, Math.min(12800, iso))]
  ]);
  const s = (+$('#c-s').value || 10) * 1000, d = K.dof(c.f, c.n, coc, s);
  const H = d.H / 1000;
  $('#c-dof').innerHTML = kv([
    ['Hiperfocal', fN(H, 2) + ' m'], ['Nítido desde (enfocando en la hiperfocal)', fN(H / 2, 2) + ' m'],
    ['Al enfocar a ' + fN(s / 1000, 1) + ' m: cerca', fN(d.near / 1000, 2) + ' m'], ['Lejos', d.far === Infinity ? 'infinito' : fN(d.far / 1000, 2) + ' m'],
    ['Profundidad total', d.far === Infinity ? 'infinita' : fN(d.total / 1000, 2) + ' m']
  ]);
  const fov = K.fov(c.f, c.w, c.h), moonDeg = S.now ? S.now.mi.diamDeg : 0.52;
  const mo = K.angularOnSensor(moonDeg, c.f, c.h), sh = +$('#c-sh').value || 30, ratio = +$('#c-ratio').value;
  const dist = K.distanceForMoonRatio(sh, ratio, moonDeg);
  const vfAtD = 2 * dist * Math.tan(fov.v / 2 * X.D2R);
  const fFill = c.h / (2 * Math.tan(moonDeg / 2 * X.D2R)) * 0.5; // Luna = 50 % de la altura
  $('#c-fov').innerHTML = kv([
    ['Campo horizontal × vertical', fN(fov.h, 1) + '° × ' + fN(fov.v, 1) + '°'], ['Diagonal', fN(fov.d, 1) + '°'],
    ['Luna en el fotograma', fN(mo.frac * 100, 1) + ' % del alto (' + fN(mo.mm, 2) + ' mm)'],
    ['Focal para Luna a media altura', Math.round(fFill) + ' mm'],
    ['Distancia para la proporción elegida', fDist(dist)], ['Alto del encuadre a esa distancia', fDist(vfAtD)]
  ]);
  const tt = +$('#c-tt').value || 90, te = +$('#c-te').value || 30, tg = +$('#c-tg').value || 1;
  const n = Math.floor(tt * 60 / (te + tg)), tl = K.timelapse(+$('#c-vs').value || 10, +$('#c-fps').value || 25, +$('#c-iv').value || 5);
  $('#c-trail').innerHTML = kv([
    ['Giro de las estrellas', fN(K.starTrailArc(tt), 1) + '°'], ['Tomas para rastros', n + ' tomas'],
    ['Fotogramas para el vídeo', tl.frames], ['Tiempo disparando', Math.floor(tl.shootSec / 3600) + ' h ' + pad(Math.round(tl.shootSec % 3600 / 60)) + ' min']
  ]);
  function kv(rows) { return rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join(''); }
}
['#c-sensor', '#c-mp', '#c-f', '#c-n', '#c-w', '#c-h', '#c-dec', '#c-s', '#c-sh', '#c-ratio', '#c-tt', '#c-te', '#c-tg', '#c-vs', '#c-fps', '#c-iv'].forEach(s => $(s).addEventListener('input', calcOut));
$('#s-night').onclick = () => { S.night = !S.night; LS.set('night', S.night); document.documentElement.dataset.night = S.night ? '1' : '0'; $('#s-night').textContent = S.night ? 'Desactivar' : 'Activar'; drawAll(); };
$('#s-hz').onclick = () => { S.hz = null; LS.set('hz', null); invalidateCaches(); toast('Perfil de horizonte borrado'); };
$('#s-tle').onclick = () => { const t = $('#tle-in'); t.hidden = !t.hidden; };
$('#tle-in').onchange = () => {
  const l = $('#tle-in').value.trim().split(/\r?\n/).map(s => s.trim()).filter(s => /^[12] /.test(s));
  if (l.length === 2) { LS.set('tle', { l1: l[0], l2: l[1], at: Date.now() }); toast('TLE guardado'); } else toast('Faltan las líneas 1 y 2 del TLE');
};

/* ---------- REALIDAD AUMENTADA ---------- */
const AR = (() => {
  let active = false, running = false, stream = null, raf = 0;
  let Rm = null, absolute = false, heading = null, offset = null, user = LS.get('arOff', 0), altOff = 0, fov = LS.get('arFov', 67);
  const cvs = $('#ar-canvas'), vid = $('#ar-video');
  $('#ar-fov').value = fov; $('#ar-fovv').textContent = fov + '°';
  $('#ar-fov').oninput = e => { fov = +e.target.value; $('#ar-fovv').textContent = fov + '°'; LS.set('arFov', fov); };
  $('#ar-l').onclick = () => { user -= 1; LS.set('arOff', user); };
  $('#ar-r').onclick = () => { user += 1; LS.set('arOff', user); };
  let fixTarget = 'Moon';
  $('#ar-fix').onclick = () => {
    const ob = OB(), d = new Date(S.t);
    const m = X.pos('Moon', d, ob), s = X.pos('Sun', d, ob);
    const b = m.alt > 0 ? m : s.alt > 0 ? s : null;
    if (!b || !Rm) return toast('Necesitas la Luna o el Sol a la vista, a la hora seleccionada');
    const cam = camDir(); if (!cam) return;
    // corrige acimut y altura para que el astro quede en el centro
    user += X.wrap180(cam.az - b.az); altOff = b.alt - cam.alt; LS.set('arOff', user);
    toast(`Fijado en ${b === m ? 'la Luna' : 'el Sol'}: corrección ${fN(X.wrap180(user), 1)}°`);
  };
  $('#ar-cam').onclick = () => { if (stream) stopCam(); else startCam(); };
  $('#ar-go').onclick = start;

  function onOri(e, fromAbs) {
    if (e.alpha == null) return;
    if (absolute && fromAbs !== true) return; // en Android manda el evento absoluto
    const a = e.alpha * X.D2R, b = e.beta * X.D2R, g = e.gamma * X.D2R;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    // R = Rz(a)·Rx(b)·Ry(g): dispositivo → (Este, Norte, Arriba)
    const R = [
      ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg,
      sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg,
      -cb * sg, sb, cb * cg
    ];
    Rm = Rm ? Rm.map((v, i) => v + (R[i] - v) * 0.25) : R;
    if (e.webkitCompassHeading != null && !absolute) {
      heading = e.webkitCompassHeading;
      // Referencia: cámara si el móvil está de pie, borde superior si está tumbado
      const ref = Math.abs(e.beta) > 50 ? azOf(R, [0, 0, -1]) : azOf(R, [0, 1, 0]);
      const off = X.wrap180(ref - heading);
      offset = offset == null ? off : offset + X.wrap180(off - offset) * 0.05;
    }
  }
  function onAbs(e) { if (e.alpha != null) { absolute = true; offset = 0; onOri(e, true); } }
  function azOf(R, v) { const x = R[0] * v[0] + R[1] * v[1] + R[2] * v[2], y = R[3] * v[0] + R[4] * v[1] + R[5] * v[2]; return X.norm360(Math.atan2(x, y) * X.R2D); }
  function totalOff() { return (offset || 0) + user; }
  function camDir() {
    if (!Rm) return null;
    const x = -Rm[2], y = -Rm[5], z = -Rm[8];
    return { az: X.norm360(Math.atan2(x, y) * X.R2D - totalOff()), alt: Math.asin(Math.max(-1, Math.min(1, z))) * X.R2D };
  }
  // proyecta (az, alt) a pantalla
  function proj(az, alt, W, H, f) {
    const A = (az + totalOff()) * X.D2R, h = (alt - altOff) * X.D2R;
    const w = [Math.sin(A) * Math.cos(h), Math.cos(A) * Math.cos(h), Math.sin(h)];
    const R = Rm;
    let dx = R[0] * w[0] + R[3] * w[1] + R[6] * w[2], dy = R[1] * w[0] + R[4] * w[1] + R[7] * w[2], dz = R[2] * w[0] + R[5] * w[1] + R[8] * w[2];
    if (dz >= -0.05) return null;
    const ang = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * X.D2R;
    const sx = dx * Math.cos(ang) - dy * Math.sin(ang), sy = dx * Math.sin(ang) + dy * Math.cos(ang);
    return [W / 2 + f * sx / -dz, H / 2 - f * sy / -dz];
  }
  async function start() {
    $('#ar-err').textContent = '';
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const p = await DeviceOrientationEvent.requestPermission();
        if (p !== 'granted') { $('#ar-err').textContent = 'Sin permiso de movimiento. Ajustes › Safari › Movimiento y orientación.'; return; }
      }
    } catch (e) { $('#ar-err').textContent = 'No se pudo pedir el permiso de movimiento: ' + e.message; return; }
    window.addEventListener('deviceorientationabsolute', onAbs, true);
    window.addEventListener('deviceorientation', onOri, true);
    running = true; $('#ar-start').hidden = true; $('#ar-bot').hidden = false;
    await startCam();
    loop();
  }
  async function startCam() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
      vid.srcObject = stream; await vid.play().catch(() => {});
    } catch { stream = null; toast('Sin cámara: se muestra solo la superposición'); }
  }
  function stopCam() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; vid.srcObject = null; }
  function loop() {
    cancelAnimationFrame(raf);
    if (!active || !running) return;
    draw(); raf = requestAnimationFrame(loop);
  }
  let pathKey = '', P = null;
  function draw() {
    const dpr = devicePixelRatio || 1, W = cvs.clientWidth, H = cvs.clientHeight;
    if (cvs.width !== W * dpr) { cvs.width = W * dpr; cvs.height = H * dpr; }
    const g = cvs.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!stream) { g.fillStyle = cssv('--night'); g.fillRect(0, 0, W, H); }
    if (!Rm) { $('#ar-read').textContent = 'Esperando sensores…'; return; }
    // focal en píxeles: el lado largo de la imagen cubre "fov" grados
    let longPx = Math.max(W, H);
    if (stream && vid.videoWidth) { const sc = Math.max(W / vid.videoWidth, H / vid.videoHeight); longPx = Math.max(vid.videoWidth, vid.videoHeight) * sc; }
    const f = (longPx / 2) / Math.tan(fov / 2 * X.D2R);
    const ob = OB(), d = new Date(S.t), key = dayStart(S.t).getTime() + '|' + S.cam.lat.toFixed(3) + S.cam.lon.toFixed(3);
    if (key !== pathKey) { pathKey = key; P = getDay().paths; }
    const line = (pts, col, w, dash) => {
      g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); let pen = false;
      for (const p of pts) { const s = proj(p.az, p.alt, W, H, f); if (!s) { pen = false; continue; } pen ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]); pen = true; }
      g.stroke(); g.setLineDash([]);
    };
    // horizonte y relieve
    const hz = []; for (let a = 0; a <= 360; a += 2) hz.push({ az: a, alt: 0 });
    line(hz, 'rgba(255,255,255,.6)', 1.5, [6, 6]);
    if (hzValid()) { const rel = S.hz.prof.map(p => ({ az: p.az, alt: p.alt })); rel.push({ az: 360, alt: S.hz.prof[0].alt }); line(rel, 'rgba(120,255,180,.8)', 2); }
    // puntos cardinales
    g.font = '600 16px ' + cssv('--font'); g.textAlign = 'center';
    for (let a = 0; a < 360; a += 15) {
      const s = proj(a, 0, W, H, f); if (!s) continue;
      g.fillStyle = '#fff'; g.fillRect(s[0] - 1, s[1] - (a % 45 ? 5 : 10), 2, a % 45 ? 10 : 20);
      if (a % 45 === 0) g.fillText(CARD[a / 22.5], s[0], s[1] - 16); else g.fillText(a + '°', s[0], s[1] + 22);
    }
    // Vía Láctea a la hora seleccionada
    const arc = X.milkyWayArc(d, ob, 3);
    g.globalAlpha = .35; line(arc, cssv('--gc'), 26); g.globalAlpha = 1;
    // trayectorias con horas
    line(P.Sun, cssv('--sun'), 3); line(P.Moon, cssv('--moon'), 3); line(P.GC, cssv('--gc'), 2, [4, 6]);
    g.font = '13px ' + cssv('--font');
    for (const [k, c] of [['Sun', '--sun'], ['Moon', '--moon']]) for (const p of P[k]) if (p.t.getMinutes() === 0 && p.alt > -3) {
      const s = proj(p.az, p.alt, W, H, f); if (!s) continue; g.fillStyle = cssv(c); g.beginPath(); g.arc(s[0], s[1], 3.5, 0, 7); g.fill(); g.fillText(p.t.getHours() + 'h', s[0], s[1] - 8);
    }
    // astros a la hora seleccionada
    const ring = (b, col, label, r) => { const s = proj(b.az, b.alt, W, H, f); if (!s) return; g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath(); g.arc(s[0], s[1], r, 0, 7); g.stroke(); g.fillStyle = col; g.fillText(label, s[0], s[1] + r + 15); };
    ring(X.pos('Sun', d, ob), cssv('--sun'), 'Sol ' + fT(d), 16);
    ring(X.pos('Moon', d, ob), cssv('--moon'), 'Luna ' + fT(d), 14);
    ring(X.pos('GC', d, ob), cssv('--gc'), 'Núcleo', 10);
    // dirección del objetivo
    const ab = abGeom();
    if (ab) { const s = proj(ab.az, ab.el, W, H, f); if (s) { g.strokeStyle = cssv('--target'); g.lineWidth = 2; g.beginPath(); g.moveTo(s[0] - 18, s[1]); g.lineTo(s[0] + 18, s[1]); g.moveTo(s[0], s[1] - 18); g.lineTo(s[0], s[1] + 18); g.stroke(); g.fillStyle = cssv('--target'); g.fillText('Objetivo', s[0], s[1] - 24); } }
    // retícula central
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1; g.beginPath(); g.arc(W / 2, H / 2, 6, 0, 7); g.stroke();
    const cd = camDir();
    $('#ar-read').innerHTML = `${fN(cd.az, 1)}° ${card(cd.az)} · ${fAlt(cd.alt)}<br><span class="small">${absolute ? 'Brújula absoluta' : heading != null ? 'Brújula iOS' : 'Sin brújula'} · corr. ${fN(X.wrap180(user), 1)}°</span>`;
    $('#ar-time').innerHTML = `${fT(d)}<br><span class="small">${fDs(d)}</span>`;
  }
  return {
    enter() { active = true; if (running) { if (!stream) startCam(); loop(); } },
    leave() { active = false; cancelAnimationFrame(raf); stopCam(); }
  };
})();

/* ---------- arranque ---------- */
drawAll();
if (S.cam.elev == null) setCam(S.cam.lat, S.cam.lon, S.cam.name);
window.addEventListener('resize', () => drawAll(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden && Math.abs(Date.now() - S.t) < 5 * MIN) setT(Date.now()); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__noct = { S, X, drawAll, showTab };
})();
