/* Nocturna · motor astronómico (sin DOM). Funciona en navegador (global Astronomy) y en Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('astronomy-engine'));
  else root.Astro = factory(root.Astronomy);
})(typeof self !== 'undefined' ? self : this, function (A) {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const EARTH_R = 6371008.8;
  const REFRACTION_K = 0.13; // coeficiente de refracción terrestre estándar

  // Centro galáctico (Sgr A*), J2000
  const GC_RA = 17 + 45 / 60 + 40.04 / 3600, GC_DEC = -(29 + 0 / 60 + 28.1 / 3600);
  A.DefineStar(A.Body.Star1, GC_RA, GC_DEC, 26000);
  const GC = A.Body.Star1;

  const BODY = { Sun: A.Body.Sun, Moon: A.Body.Moon, GC: GC, Venus: A.Body.Venus, Mars: A.Body.Mars, Jupiter: A.Body.Jupiter, Saturn: A.Body.Saturn, Mercury: A.Body.Mercury };

  const norm360 = a => ((a % 360) + 360) % 360;
  const wrap180 = a => { a = norm360(a); return a > 180 ? a - 360 : a; };

  function observer(lat, lon, h) { return new A.Observer(lat, lon, h || 0); }

  /* Posición topocéntrica aparente (con refracción). */
  function pos(body, date, ob) {
    const b = BODY[body] || body;
    const eq = A.Equator(b, date, ob, true, true);
    const hor = A.Horizon(date, ob, eq.ra, eq.dec, 'normal');
    return { az: hor.azimuth, alt: hor.altitude, ra: eq.ra, dec: eq.dec, dist: eq.dist };
  }

  function sepDeg(az1, alt1, az2, alt2) {
    const c = Math.sin(alt1 * D2R) * Math.sin(alt2 * D2R) + Math.cos(alt1 * D2R) * Math.cos(alt2 * D2R) * Math.cos((az1 - az2) * D2R);
    return Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
  }

  /* ---------- Luna ---------- */
  const PHASE_NAMES = [
    [0, 'Luna nueva'], [22.5, 'Creciente'], [67.5, 'Cuarto creciente'], [112.5, 'Gibosa creciente'],
    [157.5, 'Luna llena'], [202.5, 'Gibosa menguante'], [247.5, 'Cuarto menguante'], [292.5, 'Menguante'], [337.5, 'Luna nueva']
  ];
  function moonInfo(date, ob) {
    const ill = A.Illumination(A.Body.Moon, date);
    const phase = A.MoonPhase(date); // 0 nueva, 90 CC, 180 llena, 270 CM
    let name = 'Luna nueva';
    for (const [a, n] of PHASE_NAMES) if (phase >= a) name = n;
    const distKm = ob ? pos('Moon', date, ob).dist * 149597870.7 : ill.geo_dist * 149597870.7;
    const diam = 2 * Math.atan(1737.4 / distKm) * R2D;
    return { illum: ill.phase_fraction, phase, name, distKm, diamDeg: diam, waxing: phase < 180 };
  }

  /* ---------- Eventos del día ---------- */
  // dayStart: Date en la medianoche local del día que interesa.
  function within(t, s, e) { return t && t.date >= s && t.date < e ? t.date : null; }
  function dayEvents(dayStart, ob) {
    const s = dayStart, e = new Date(s.getTime() + DAY);
    const sr = (b, dir) => within(A.SearchRiseSet(BODY[b], ob, dir, s, 1.05), s, e);
    const alt = (b, dir, a) => within(A.SearchAltitude(BODY[b], ob, dir, s, 1.05, a), s, e);
    const noon = A.SearchHourAngle(A.Body.Sun, ob, 0, s, +1);
    const ev = {
      sunrise: sr('Sun', +1), sunset: sr('Sun', -1),
      noon: within(noon.time, s, e), noonAlt: noon.hor.altitude,
      civilDawn: alt('Sun', +1, -6), civilDusk: alt('Sun', -1, -6),
      nauticalDawn: alt('Sun', +1, -12), nauticalDusk: alt('Sun', -1, -12),
      astroDawn: alt('Sun', +1, -18), astroDusk: alt('Sun', -1, -18),
      goldenMorningEnd: alt('Sun', +1, 6), goldenEveningStart: alt('Sun', -1, 6),
      blueMorningEnd: alt('Sun', +1, -4), blueEveningStart: alt('Sun', -1, -4),
      moonrise: sr('Moon', +1), moonset: sr('Moon', -1),
      gcRise: sr('GC', +1), gcSet: sr('GC', -1)
    };
    const gcT = A.SearchHourAngle(GC, ob, 0, s, +1);
    ev.gcTransit = within(gcT.time, s, e); ev.gcTransitAlt = gcT.hor.altitude;
    if (ev.sunrise) ev.sunriseAz = pos('Sun', ev.sunrise, ob).az;
    if (ev.sunset) ev.sunsetAz = pos('Sun', ev.sunset, ob).az;
    if (ev.moonrise) ev.moonriseAz = pos('Moon', ev.moonrise, ob).az;
    if (ev.moonset) ev.moonsetAz = pos('Moon', ev.moonset, ob).az;
    if (ev.gcRise) ev.gcRiseAz = pos('GC', ev.gcRise, ob).az;
    if (ev.gcSet) ev.gcSetAz = pos('GC', ev.gcSet, ob).az;
    return ev;
  }

  function path(body, start, ob, hours, stepMin) {
    const out = [];
    const n = Math.round(hours * 60 / stepMin);
    for (let i = 0; i <= n; i++) {
      const t = new Date(start.getTime() + i * stepMin * MIN);
      const p = pos(body, t, ob);
      out.push({ t, az: p.az, alt: p.alt });
    }
    return out;
  }

  /* Arco de la Vía Láctea: puntos del plano galáctico (b=0) en coordenadas horizontales. */
  function milkyWayArc(date, ob, stepDeg) {
    stepDeg = stepDeg || 5;
    const rot = A.CombineRotation(A.Rotation_GAL_EQJ(), A.Rotation_EQJ_HOR(date, ob));
    const time = A.MakeTime(date);
    const pts = [];
    for (let l = -180; l <= 180; l += stepDeg) {
      const v = A.RotateVector(rot, new A.Vector(Math.cos(l * D2R), Math.sin(l * D2R), 0, time));
      const s = A.HorizonFromVector(v, 'normal');
      pts.push({ l, az: norm360(s.lon), alt: s.lat });
    }
    return pts;
  }

  function sunLight(alt) {
    if (alt >= 6) return 'day';
    if (alt >= -4) return 'golden';
    if (alt >= -6) return 'blue';
    if (alt >= -18) return 'twilight';
    return 'night';
  }
  const LIGHT_LABEL = { day: 'De día', golden: 'Hora dorada', blue: 'Hora azul', twilight: 'Crepúsculo', night: 'Noche cerrada' };

  /* ---------- Geodesia (Vincenty sobre WGS84) ---------- */
  function inverse(lat1, lon1, lat2, lon2) {
    const a = 6378137, f = 1 / 298.257223563, b = a * (1 - f);
    const L = (lon2 - lon1) * D2R;
    const U1 = Math.atan((1 - f) * Math.tan(lat1 * D2R)), U2 = Math.atan((1 - f) * Math.tan(lat2 * D2R));
    const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
    let lam = L, lamP, it = 0, sinS, cosS, sig, sinA, cos2A, cos2Sm;
    do {
      const sl = Math.sin(lam), cl = Math.cos(lam);
      sinS = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2);
      if (sinS === 0) return { dist: 0, az: 0 };
      cosS = sU1 * sU2 + cU1 * cU2 * cl;
      sig = Math.atan2(sinS, cosS);
      sinA = cU1 * cU2 * sl / sinS;
      cos2A = 1 - sinA * sinA;
      cos2Sm = cos2A ? cosS - 2 * sU1 * sU2 / cos2A : 0;
      const C = f / 16 * cos2A * (4 + f * (4 - 3 * cos2A));
      lamP = lam;
      lam = L + (1 - C) * f * sinA * (sig + C * sinS * (cos2Sm + C * cosS * (-1 + 2 * cos2Sm * cos2Sm)));
    } while (Math.abs(lam - lamP) > 1e-12 && ++it < 200);
    const u2 = cos2A * (a * a - b * b) / (b * b);
    const Aa = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
    const Bb = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
    const dS = Bb * sinS * (cos2Sm + Bb / 4 * (cosS * (-1 + 2 * cos2Sm * cos2Sm) - Bb / 6 * cos2Sm * (-3 + 4 * sinS * sinS) * (-3 + 4 * cos2Sm * cos2Sm)));
    const dist = b * Aa * (sig - dS);
    const sl = Math.sin(lam), cl = Math.cos(lam);
    const az = norm360(Math.atan2(cU2 * sl, cU1 * sU2 - sU1 * cU2 * cl) * R2D);
    return { dist, az };
  }
  // Punto destino a partir de rumbo y distancia (esfera; suficiente para dibujar líneas)
  function destination(lat, lon, azDeg, distM) {
    const d = distM / EARTH_R, br = azDeg * D2R, p1 = lat * D2R, l1 = lon * D2R;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
    const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 * R2D, ((l2 * R2D + 540) % 360) - 180];
  }
  /* Ángulo de elevación aparente desde A (altura hA m) hacia B (altura hB m) separados distM. */
  function elevationAngle(hA, hB, distM) {
    if (distM <= 0) return 0;
    const drop = distM * distM * (1 - REFRACTION_K) / (2 * EARTH_R);
    return Math.atan((hB - hA - drop) / distM) * R2D;
  }

  /* ---------- Búsqueda inversa de alineaciones ----------
     opts: {body, targetAz, targetAlt, tolAz, tolAlt, start, end, ob, illumMin, illumMax, light:[...], onProgress}
     Devuelve resultados ordenados por fecha. Es asíncrona para no bloquear la interfaz. */
  async function searchAlignment(opts) {
    const { body, targetAz, targetAlt, ob } = opts;
    const tolAz = opts.tolAz, tolAlt = opts.tolAlt;
    const step = (opts.stepMin || (body === 'GC' ? 15 : 8)) * MIN;
    const t0 = opts.start.getTime(), t1 = opts.end.getTime();
    const sep = t => { const p = pos(body, new Date(t), ob); return { s: sepDeg(p.az, p.alt, targetAz, targetAlt), p }; };
    const results = [];
    let prev2 = null, prev1 = null;
    let lastYield = performance.now();
    const total = t1 - t0;
    for (let t = t0; t <= t1; t += step) {
      const cur = { t, ...sep(t) };
      if (prev2 && prev1 && prev1.s <= prev2.s && prev1.s <= cur.s && prev1.s < 6) {
        // refinar mínimo con sección áurea en [t-2step, t]
        let a = prev2.t, b = cur.t;
        const g = (Math.sqrt(5) - 1) / 2;
        let c = b - g * (b - a), d = a + g * (b - a), fc = sep(c).s, fd = sep(d).s;
        for (let k = 0; k < 28; k++) {
          if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = sep(c).s; }
          else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = sep(d).s; }
        }
        const tm = (a + b) / 2, best = sep(tm);
        const dAz = wrap180(best.p.az - targetAz) * Math.cos(targetAlt * D2R);
        const dAlt = best.p.alt - targetAlt;
        if (Math.abs(dAz) <= tolAz && Math.abs(dAlt) <= tolAlt) {
          const date = new Date(tm);
          const sun = pos('Sun', date, ob);
          const light = sunLight(sun.alt);
          let moon = null;
          if (body === 'Moon') moon = moonInfo(date, ob);
          const okIllum = !moon || ((opts.illumMin == null || moon.illum >= opts.illumMin) && (opts.illumMax == null || moon.illum <= opts.illumMax));
          const okLight = !opts.light || !opts.light.length || opts.light.includes(light);
          if (okIllum && okLight) results.push({ date, az: best.p.az, alt: best.p.alt, dAz, dAlt, sep: best.s, sunAlt: sun.alt, light, moon, dist: best.p.dist });
        }
      }
      prev2 = prev1; prev1 = cur;
      if (performance.now() - lastYield > 40) {
        if (opts.onProgress) opts.onProgress((t - t0) / total, results.length);
        if (opts.signal && opts.signal.aborted) break;
        await new Promise(r => setTimeout(r, 0));
        lastYield = performance.now();
      }
    }
    if (opts.onProgress) opts.onProgress(1, results.length);
    return results;
  }

  /* ---------- Vía Láctea: noches buenas ----------
     Para cada noche: minutos con Sol < -18°, núcleo > minAlt y Luna bajo el horizonte (o iluminación < moonMaxIllum). */
  async function milkyWayNights(opts) {
    const { ob, days } = opts, minAlt = opts.minAlt ?? 10, moonMax = opts.moonMaxIllum ?? 0.15;
    const step = 10 * MIN;
    const out = [];
    let lastYield = performance.now();
    for (let d = 0; d < days; d++) {
      const noon = new Date(opts.start.getTime() + d * DAY + 12 * HOUR); // mediodía local aprox.
      let best = null, cur = null, darkMin = 0, coreMin = 0;
      for (let t = noon.getTime(); t < noon.getTime() + DAY; t += step) {
        const date = new Date(t);
        const sun = pos('Sun', date, ob);
        if (sun.alt > -18) { if (cur) { best = pick(best, cur); cur = null; } continue; }
        darkMin += 10;
        const gc = pos('GC', date, ob);
        if (gc.alt < minAlt) { if (cur) { best = pick(best, cur); cur = null; } continue; }
        coreMin += 10;
        const moonP = pos('Moon', date, ob);
        const mi = A.Illumination(A.Body.Moon, date).phase_fraction;
        const moonOk = moonP.alt < -0.5 || mi <= moonMax;
        if (!moonOk) { if (cur) { best = pick(best, cur); cur = null; } continue; }
        if (!cur) cur = { start: date, end: date, maxAlt: gc.alt, bestT: date, bestAz: gc.az, illum: mi, moonUp: moonP.alt > -0.5 };
        cur.end = new Date(t + step);
        if (gc.alt > cur.maxAlt) { cur.maxAlt = gc.alt; cur.bestT = date; cur.bestAz = gc.az; }
        if (moonP.alt > -0.5) cur.moonUp = true;
      }
      if (cur) best = pick(best, cur);
      const mi = moonInfo(new Date(noon.getTime() + 12 * HOUR));
      out.push({ night: noon, window: best, minutes: best ? (best.end - best.start) / MIN : 0, darkMin, coreMin, moon: mi });
      if (performance.now() - lastYield > 40) {
        if (opts.onProgress) opts.onProgress(d / days);
        await new Promise(r => setTimeout(r, 0));
        lastYield = performance.now();
      }
    }
    return out;
    function pick(a, b) { return !a || (b.end - b.start) > (a.end - a.start) ? b : a; }
  }

  /* ---------- Eventos ---------- */
  function moonQuarters(start, months) {
    const out = [];
    let q = A.SearchMoonQuarter(start);
    const end = start.getTime() + months * 30.6 * DAY;
    while (q.time.date.getTime() < end) {
      const item = { quarter: q.quarter, date: q.time.date };
      if (q.quarter === 2 || q.quarter === 0) {
        const geo = A.GeoMoon(q.time); const km = Math.hypot(geo.x, geo.y, geo.z) * 149597870.7;
        item.distKm = km;
        item.super = q.quarter === 2 && km < 362000;
        item.micro = q.quarter === 2 && km > 405000;
      }
      out.push(item);
      q = A.NextMoonQuarter(q);
    }
    return out;
  }

  function lunarEclipses(start, count, ob) {
    const out = [];
    let e = A.SearchLunarEclipse(start);
    for (let i = 0; i < count; i++) {
      const peak = e.peak.date;
      const p = pos('Moon', peak, ob);
      const begin = new Date(peak.getTime() - e.sd_penum * MIN), end = new Date(peak.getTime() + e.sd_penum * MIN);
      const pb = pos('Moon', begin, ob), pe = pos('Moon', end, ob);
      out.push({
        kind: e.kind, peak, obscuration: e.obscuration, moonAltAtPeak: p.alt, moonAzAtPeak: p.az,
        partialMin: e.sd_partial * 2, totalMin: e.sd_total * 2, begin, end,
        visible: p.alt > 0 || pb.alt > 0 || pe.alt > 0
      });
      e = A.NextLunarEclipse(e.peak);
    }
    return out;
  }

  function solarEclipses(start, count, ob) {
    const out = [];
    let e = A.SearchLocalSolarEclipse(start, ob);
    for (let i = 0; i < count; i++) {
      out.push({ kind: e.kind, obscuration: e.obscuration, peak: e.peak.time.date, peakAlt: e.peak.altitude,
        begin: e.partial_begin.time.date, beginAlt: e.partial_begin.altitude,
        end: e.partial_end.time.date, endAlt: e.partial_end.altitude,
        totalBegin: e.total_begin ? e.total_begin.time.date : null, totalEnd: e.total_end ? e.total_end.time.date : null,
        az: pos('Sun', e.peak.time.date, ob).az });
      e = A.NextLocalSolarEclipse(e.peak.time, ob);
    }
    return out;
  }

  // Máximos según longitud solar (IMO). ZHR orientativa. Radiante J2000 en el máximo.
  const SHOWERS = [
    { name: 'Cuadrántidas', lambda: 283.15, zhr: 110, ra: 15.33, dec: 49.5, v: 41 },
    { name: 'Líridas', lambda: 32.32, zhr: 18, ra: 18.07, dec: 34, v: 49 },
    { name: 'Eta Acuáridas', lambda: 45.5, zhr: 50, ra: 22.53, dec: -1, v: 66 },
    { name: 'Delta Acuáridas S.', lambda: 127, zhr: 25, ra: 22.67, dec: -16, v: 41 },
    { name: 'Perseidas', lambda: 140.0, zhr: 100, ra: 3.2, dec: 58, v: 59 },
    { name: 'Dracónidas', lambda: 195.4, zhr: 10, ra: 17.47, dec: 54, v: 20 },
    { name: 'Oriónidas', lambda: 208, zhr: 20, ra: 6.4, dec: 16, v: 66 },
    { name: 'Leónidas', lambda: 235.27, zhr: 15, ra: 10.27, dec: 22, v: 71 },
    { name: 'Gemínidas', lambda: 262.2, zhr: 150, ra: 7.47, dec: 33, v: 35 },
    { name: 'Úrsidas', lambda: 270.7, zhr: 10, ra: 14.47, dec: 75, v: 33 }
  ];
  function meteorShowers(start, ob, daysAhead) {
    const out = [];
    for (const s of SHOWERS) {
      const t = A.SearchSunLongitude(s.lambda, start, daysAhead || 366);
      if (!t) continue;
      const peak = t.date;
      // Mejor hora local: radiante más alto con Sol < -12° en ±12 h del máximo
      A.DefineStar(A.Body.Star2, s.ra, s.dec, 1000);
      let best = null;
      for (let k = -12 * 6; k <= 12 * 6; k++) {
        const d = new Date(peak.getTime() + k * 10 * MIN);
        const sun = pos('Sun', d, ob);
        if (sun.alt > -12) continue;
        const r = pos(A.Body.Star2, d, ob);
        if (!best || r.alt > best.alt) best = { date: d, alt: r.alt, az: r.az };
      }
      const mi = moonInfo(best ? best.date : peak, ob);
      const moonAlt = best ? pos('Moon', best.date, ob).alt : null;
      // Tasa horaria observable estimada (radiante y Luna)
      let rate = null;
      if (best && best.alt > 0) rate = Math.round(s.zhr * Math.sin(best.alt * D2R) * (moonAlt > 0 ? Math.max(0.15, 1 - 0.8 * mi.illum) : 1) * 0.6);
      out.push({ ...s, peak, best, moon: mi, moonAlt, rate });
    }
    return out.sort((a, b) => a.peak - b.peak);
  }

  /* Conjunciones Luna–planeta (separación < maxSep grados) */
  function moonConjunctions(start, days, ob, maxSep) {
    maxSep = maxSep || 4;
    const planets = ['Venus', 'Jupiter', 'Saturn', 'Mars', 'Mercury'];
    const out = [];
    const sepAt = (p, d) => { const t = A.MakeTime(d); return A.AngleBetween(A.GeoVector(A.Body.Moon, t, true), A.GeoVector(BODY[p], t, true)); };
    for (const p of planets) {
      let prev2 = null, prev1 = null;
      for (let h = 0; h <= days * 24; h += 3) {
        const d = new Date(start.getTime() + h * HOUR);
        const s = sepAt(p, d);
        if (prev1 && prev2 && prev1.s < prev2.s && prev1.s <= s && prev1.s < maxSep) {
          let a = prev2.d.getTime(), b = d.getTime();
          for (let k = 0; k < 30; k++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (sepAt(p, new Date(m1)) < sepAt(p, new Date(m2))) b = m2; else a = m1; }
          const tm = new Date((a + b) / 2);
          const mag = A.Illumination(BODY[p], tm).mag;
          const sun = pos('Sun', tm, ob), mp = pos('Moon', tm, ob);
          out.push({ planet: p, date: tm, sep: sepAt(p, tm), mag, moonAlt: mp.alt, moonAz: mp.az, sunAlt: sun.alt, illum: A.Illumination(A.Body.Moon, tm).phase_fraction });
        }
        prev2 = prev1; prev1 = { d, s };
      }
    }
    return out.sort((a, b) => a.date - b.date);
  }
  const PLANET_ES = { Venus: 'Venus', Jupiter: 'Júpiter', Saturn: 'Saturno', Mars: 'Marte', Mercury: 'Mercurio' };

  /* ---------- Horizonte con relieve ----------
     profile: array de {az, alt} cada stepAz grados. */
  function horizonAlt(profile, az) {
    if (!profile || !profile.length) return 0;
    const step = 360 / profile.length;
    const x = norm360(az) / step, i = Math.floor(x) % profile.length, j = (i + 1) % profile.length, f = x - Math.floor(x);
    return profile[i].alt * (1 - f) + profile[j].alt * f;
  }
  /* Primera salida/última puesta sobre el horizonte real (borde superior del disco opcional). */
  function realRiseSet(body, dayStart, ob, profile, stepMin) {
    stepMin = stepMin || 2;
    const out = { rise: null, set: null };
    let prevUp = null;
    for (let m = 0; m <= 1440; m += stepMin) {
      const d = new Date(dayStart.getTime() + m * MIN);
      const p = pos(body, d, ob);
      const up = p.alt > horizonAlt(profile, p.az);
      if (prevUp !== null && up !== prevUp) {
        // bisección
        let a = d.getTime() - stepMin * MIN, b = d.getTime();
        for (let k = 0; k < 12; k++) {
          const c = (a + b) / 2, pc = pos(body, new Date(c), ob);
          const uc = pc.alt > horizonAlt(profile, pc.az);
          if (uc === prevUp) a = c; else b = c;
        }
        const t = new Date((a + b) / 2), pt = pos(body, t, ob);
        if (up && !out.rise) out.rise = { date: t, az: pt.az, alt: pt.alt };
        if (!up) out.set = { date: t, az: pt.az, alt: pt.alt };
      }
      prevUp = up;
    }
    return out;
  }
  /* Puntos de muestreo para construir el perfil (se consultan alturas fuera de este módulo). */
  function horizonSamplePoints(lat, lon, stepAz, distances) {
    const pts = [];
    for (let az = 0; az < 360; az += stepAz) for (const d of distances) { const [la, lo] = destination(lat, lon, az, d); pts.push({ az, d, lat: la, lon: lo }); }
    return pts;
  }
  function buildHorizon(points, elevs, h0, stepAz) {
    const n = Math.round(360 / stepAz), prof = [];
    for (let i = 0; i < n; i++) prof.push({ az: i * stepAz, alt: -0.6, dist: null });
    points.forEach((p, k) => {
      const e = elevs[k]; if (e == null || isNaN(e)) return;
      const a = elevationAngle(h0, e, p.d), idx = Math.round(p.az / stepAz) % n;
      if (a > prof[idx].alt) { prof[idx].alt = a; prof[idx].dist = p.d; }
    });
    return prof;
  }

  /* ---------- Calculadoras fotográficas ---------- */
  const calc = {
    pixelPitch(sensorW, mp, aspect) { aspect = aspect || 1.5; const px = Math.sqrt(mp * 1e6 * aspect); return sensorW / px * 1000; }, // µm
    crop(sensorW, sensorH) { return 43.2666 / Math.hypot(sensorW, sensorH); },
    coc(sensorW, sensorH) { return Math.hypot(sensorW, sensorH) / 1442; },
    // Regla NPF (Frédéric Michaud) simplificada, con declinación
    npf(f, N, pitch, decDeg) { return (35 * N + 30 * pitch) / f / Math.cos((decDeg || 0) * D2R); },
    npfStrict(f, N, pitch, decDeg) { return (16.856 * N + 0.0997 * f + 13.713 * pitch) / (f * Math.cos((decDeg || 0) * D2R)); },
    rule500(f, crop) { return 500 / (f * crop); },
    fov(f, sensorW, sensorH) {
      const a = x => 2 * Math.atan(x / (2 * f)) * R2D;
      return { h: a(sensorW), v: a(sensorH), d: a(Math.hypot(sensorW, sensorH)) };
    },
    hyperfocal(f, N, c) { return f * f / (N * c) + f; }, // mm
    dof(f, N, c, sMm) {
      const H = f * f / (N * c);
      const near = sMm * (H) / (H + (sMm - f));
      const far = sMm >= H + f ? Infinity : sMm * H / (H - (sMm - f));
      return { near, far, total: far - near, H: H + f };
    },
    // Tamaño de un objeto angular en el sensor y fracción del fotograma
    angularOnSensor(angDeg, f, sensorH) { const mm = 2 * f * Math.tan(angDeg / 2 * D2R); return { mm, frac: mm / sensorH }; },
    // Distancia para que un sujeto de altura hM tenga ratio r respecto al diámetro de la Luna
    distanceForMoonRatio(hM, ratio, moonDeg) { return hM / (ratio * Math.tan((moonDeg || 0.52) * D2R)); },
    starTrailArc(minutes, decDeg) { return 360 * minutes / 1436.07; },
    timelapse(clipSec, fps, intervalSec) { const frames = Math.ceil(clipSec * fps); return { frames, shootSec: frames * intervalSec }; }
  };

  return {
    D2R, R2D, MIN, HOUR, DAY, norm360, wrap180, observer, pos, sepDeg, moonInfo, dayEvents, path, milkyWayArc,
    sunLight, LIGHT_LABEL, inverse, destination, elevationAngle, searchAlignment, milkyWayNights,
    moonQuarters, lunarEclipses, solarEclipses, meteorShowers, moonConjunctions, PLANET_ES,
    horizonAlt, realRiseSet, horizonSamplePoints, buildHorizon, calc, GC_RA, GC_DEC, A
  };
});
