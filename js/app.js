/* Meridian: globe, countries and regions, spot explorer, live public media and trip planner. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const enc = encodeURIComponent;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => innerWidth < 768;
  const getJSON = async (url, opt) => { const r = await fetch(url, opt); if (!r.ok) throw new Error(r.status); return r.json(); };

  const TEX = {
    day: 'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg',
    night: 'vendor/img/earth-night.jpg',
    bump: 'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png',
    sky: 'vendor/img/night-sky.png',
  };
  const WIKI = 'https://en.wikipedia.org/w/api.php?format=json&origin=*&action=query';
  const COMMONS = 'https://commons.wikimedia.org/w/api.php?format=json&origin=*&action=query';
  const ACCENT = '#ee8d58';
  /* Wikimedia Commons photo at a chosen width. 3840 = 4K (the original is served when it is smaller). */
  const cimg = (file, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${enc(file)}?width=${w}`;

  const CITIES = window.CITIES;
  const byId = new Map(CITIES.map(c => [c.id, c]));
  const extras = new Map();   // non-curated markers: user location, searched places
  const els = new Map();      // marker id -> DOM element
  let spotMarkers = [];       // spots of the open place shown on the globe
  let current = null;         // place shown in the panel
  let user = null;            // { lat, lng, approx }
  let loadToken = 0;
  let countries = [];         // country border features
  let hoverCountry = null;
  let TYPES = {};             // spot type key -> { label, cat, insta }

  /* ---------------- Data files ---------------- */
  const fileCache = new Map();
  const loadData = rel => {
    if (!fileCache.has(rel)) fileCache.set(rel, fetch('data/' + rel).then(r => r.ok ? r.json() : null).catch(() => null));
    return fileCache.get(rel);
  };
  const typesReady = loadData('types.json').then(t => { TYPES = t || {}; });
  const countriesReady = loadData('countries.json').then(g => { countries = g?.features || []; });
  const stash = {
    get(k) { try { return JSON.parse(localStorage.getItem('meridian.c.' + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('meridian.c.' + k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  };

  /* ---------------- Toast ---------------- */
  let toastTimer;
  const toast = msg => {
    const t = $('#toast'); t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), 3200);
  };

  /* ---------------- Trip state ---------------- */
  const STORE = 'meridian.trip.v1';
  let trip = { name: '', start: '', stops: [] };
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && Array.isArray(s.stops)) trip = s; } catch { /* storage unavailable */ }
  const saveTrip = () => { try { localStorage.setItem(STORE, JSON.stringify(trip)); } catch { /* ignore */ } };
  const stopIndex = id => trip.stops.findIndex(s => s.id === id);

  const km = (a, b) => {
    const R = 6371, rad = d => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const fmtKm = n => n < 10 ? `${n.toFixed(1)} km` : `${Math.round(n).toLocaleString('en')} km`;

  /* ---------------- Globe ---------------- */
  const globeEl = $('#globe');
  const startLng = Math.max(-180, Math.min(180, (-new Date().getTimezoneOffset() / 60) * 15));

  const makeMarker = d => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mk' + (d.kind === 'spot' ? ' is-spot' : ''); b.style.pointerEvents = 'auto';
    b.innerHTML = `<i class="mk-dot"></i><span class="mk-label">${esc(d.label || d.name)}</span>`;
    b.setAttribute('aria-label', d.kind === 'user' ? 'Your location. Open places around you' : `Open ${d.name}`);
    b.addEventListener('click', e => {
      e.stopPropagation();
      if (d.kind === 'user') openAround(); else if (d.kind === 'spot') focusSpot(d.id, true); else openPlace(d);
    });
    els.set(d.id, b);
    return b;
  };

  const capColor = d => d === hoverCountry ? 'rgba(238,141,88,.30)' : (current?.kind === 'country' && current.code === d.properties.code ? 'rgba(238,141,88,.10)' : 'rgba(0,0,0,0)');
  const globe = Globe()(globeEl)
    .backgroundImageUrl(TEX.sky)
    .backgroundColor('#070b10')
    .atmosphereColor('#bfe9ff').atmosphereAltitude(0.17)
    .htmlLat('lat').htmlLng('lng').htmlAltitude(0.008).htmlElement(makeMarker)
    .ringLat('lat').ringLng('lng')
    .ringColor(d => t => d.user ? `rgba(111,211,255,${1 - t})` : `rgba(238,141,88,${1 - t})`)
    .ringMaxRadius(d => d.user ? 5 : d.small ? 0.6 : 3.2).ringPropagationSpeed(d => d.small ? 0.4 : 1.6).ringRepeatPeriod(1300)
    .arcColor(() => [ACCENT, '#ffd2b4']).arcStroke(0.28).arcAltitudeAutoScale(0.42)
    .arcDashLength(0.5).arcDashGap(0.18).arcDashAnimateTime(reduceMotion ? 0 : 2600)
    .polygonAltitude(0.004).polygonCapColor(capColor).polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => 'rgba(255,255,255,.2)').polygonsTransitionDuration(0)
    .polygonLabel(d => esc(d.properties.name))
    .onPolygonHover(d => { hoverCountry = d; globe.polygonCapColor(capColor); globeEl.style.cursor = d ? 'pointer' : ''; })
    .onPolygonClick(d => { if (d.properties.code) openCountry(d.properties.code); else toast(`No travel data for ${d.properties.name} yet.`); })
    .pointOfView({ lat: 18, lng: startLng, altitude: 2.3 });
  const SAND = new Set('EG LY DZ SA AE OM YE NE TD ML MR SD IR IQ JO KW QA EH TN NA BW TM UZ AF PK MN KZ SY IL ER DJ SO'.split(' '));
  const COLD = new Set('RU CA NO SE FI IS'.split(' '));
  let toonTex = '';
  const toonTexture = () => {
    const W = 4096, H = 2048, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), sea = x.createLinearGradient(0, 0, 0, H);
    [[0, '#f2fbff'], [0.07, '#9fe2ff'], [0.3, '#4fc0ff'], [0.5, '#35b2ff'], [0.7, '#4fc0ff'], [0.93, '#9fe2ff'], [1, '#f6fcff']].forEach(([o, c]) => sea.addColorStop(o, c));
    x.fillStyle = sea; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.16)';   // little wave dashes
    for (let i = 0; i < 900; i++) { const a = (i * 2654435761 % 4096), b = 200 + (i * 40503 % 1650); x.fillRect(a, b, 26 + i % 30, 3); }
    const GREEN = ['#9be36d', '#b4ea7a', '#86d96a', '#c6ee84', '#a5e07f', '#93dd8a'];
    const trace = f => {
      x.beginPath();
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const ring of poly) {
        ring.forEach(([lo, la], i) => { const px = (lo + 180) / 360 * W, py = (90 - la) / 180 * H; i ? x.lineTo(px, py) : x.moveTo(px, py); });
        x.closePath();
      }
    };
    x.lineJoin = 'round';
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 15;
    countries.forEach(f => { trace(f); x.stroke(); });                 // white foam around the coasts
    countries.forEach((f, i) => {
      const c = f.properties.code;
      x.fillStyle = c === 'AQ' || c === 'GL' ? '#ffffff' : SAND.has(c) ? (i % 2 ? '#f8dd92' : '#f3cf84') : COLD.has(c) ? '#bfecb4' : GREEN[i % GREEN.length];
      trace(f); x.fill('evenodd');
    });
    x.strokeStyle = '#2f6b46'; x.lineWidth = 3;
    countries.forEach(f => { trace(f); x.stroke(); });                 // ink outline
    return cv.toDataURL('image/jpeg', 0.92);
  };
  countriesReady.then(() => { globe.polygonsData(countries); toonTex = toonTexture(); globe.globeImageUrl(toonTex); });

  const controls = globe.controls();
  controls.autoRotate = !reduceMotion; controls.autoRotateSpeed = 0.35;
  controls.minDistance = 108.4; controls.maxDistance = 520;
  controls.enableDamping = true; controls.zoomSpeed = 0.8;
  let spin = !reduceMotion, resumeTimer;
  const pauseSpin = () => { controls.autoRotate = false; clearTimeout(resumeTimer); };
  const maybeResume = () => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { if (spin && !current && !$('#trip').classList.contains('is-open')) controls.autoRotate = true; }, 6000);
  };
  controls.addEventListener('start', pauseSpin);
  controls.addEventListener('end', maybeResume);
  controls.addEventListener('change', () => {
    const a = globe.pointOfView().altitude;
    document.body.classList.toggle('zoomed', a < 1.25);
    document.body.classList.toggle('close', a < 0.32);
    if (!mapMode && a < 0.1) { const v = globe.pointOfView(); enterMap(v.lat, v.lng); }   // hand over to the sharp detail map
  });

  const fit = () => globe.width(innerWidth).height(innerHeight);
  addEventListener('resize', fit); fit();

  const flyTo = (lat, lng, altitude = 0.55) => {
    pauseSpin();
    if (mapMode) {
      if (altitude <= 0.25) return map.flyTo({ center: [lng, lat], zoom: 6.6 - Math.log2(altitude / 0.1), essential: true });
      exitMap();
    }
    altitude = Math.max(0.11, altitude);
    const shift = current && !isMobile() ? altitude * 14 : 0;   // keep the target clear of the open panel
    const down = current && isMobile() ? altitude * 16 : 0;
    globe.pointOfView({ lat: lat - down, lng: lng + shift, altitude }, reduceMotion ? 0 : 1600);
  };
  const zoomBy = f => {
    if (mapMode) { const z = map.getZoom() + (f < 1 ? 1 : -1); return z < 5.6 ? exitMap() : map.easeTo({ zoom: z, duration: 400 }); }
    const p = globe.pointOfView(); pauseSpin(); maybeResume();
    globe.pointOfView({ ...p, altitude: Math.max(0.09, Math.min(4.2, p.altitude * f)) }, 400);
  };

  const refreshGlobe = () => {
    const extra = [...extras.values()].filter(d => d.kind === 'user' || d.id === current?.id || stopIndex(d.id) > -1);
    globe.htmlElementsData([...CITIES.filter(d => d.id === current?.id || stopIndex(d.id) > -1), ...extra, ...spotMarkers]);
    const rings = [];
    if (user) rings.push({ lat: user.lat, lng: user.lng, user: true });
    if (view.focus) rings.push({ lat: view.focus.lat, lng: view.focus.lng, small: true });
    globe.ringsData(rings);
    globe.arcsData(trip.stops.slice(1).map((s, i) => ({ startLat: trip.stops[i].lat, startLng: trip.stops[i].lng, endLat: s.lat, endLng: s.lng })));
    globe.polygonCapColor(capColor);
    requestAnimationFrame(syncMarkers);
    if (mapMode) syncMapMarkers();
  };

  /* ---------------- Detail map: sharp satellite imagery and 3D buildings once you zoom in ---------------- */
  const MAPLIB = 'vendor/maplibre-gl';   // libraries are kept in /vendor so the site does not wait on outside servers
  let map = null, mapMode = false, mapLib = null, baseStyle = null, mapKind = 'toon', mapPins = [], autoTilted = false, mapHint = false;
  const loadMapLib = () => mapLib ||= new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = MAPLIB + '.css'; document.head.append(l);
    const s = document.createElement('script'); s.src = MAPLIB + '.js'; s.onload = res; s.onerror = rej; document.head.append(s);
  }).then(async () => { baseStyle = await getJSON('https://tiles.openfreemap.org/styles/liberty'); });

  const buildStyle = kind => {
    const s = structuredClone(baseStyle);
    s.projection = { type: 'globe' };
    s.sky = { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 0.5, 9, 0] };
    if (kind === 'sat') {
      // Small tile size makes the map request one level deeper, so imagery stays crisp on Retina and 4K screens.
      s.sources.sat = { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: devicePixelRatio > 1 ? 128 : 256, maxzoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' };
      s.layers = [{ id: 'space', type: 'background', paint: { 'background-color': '#070b10' } }, { id: 'sat', type: 'raster', source: 'sat' },
        ...s.layers.filter(l => l.type === 'symbol' || l.type === 'fill-extrusion')];
      for (const l of s.layers) if (l.type === 'symbol') l.paint = { ...l.paint, 'text-color': '#ffffff', 'text-halo-color': 'rgba(7,11,16,.85)', 'text-halo-width': 1.4 };
    }
    if (kind === 'toon') {
      // cartoon city: flat candy colours, dark ink outlines on roads, pastel block buildings, a soft anime sky
      const C = { land: '#c9f0a3', water: '#58c7ff', green: '#8fdd78', sand: '#ffe9a6', ice: '#ffffff', urban: '#e4f5c4', build: '#ffd9c7', ink: '#4a3b5c', road: '#fffaf0', major: '#ffcf5c', rail: '#9a8cab', pink: '#ff8fb1' };
      s.layers = s.layers.filter(l => l.type !== 'raster');
      for (const l of s.layers) {
        const id = l.id.toLowerCase(), sl = l['source-layer'] || '', p = l.paint = { ...l.paint };
        if (l.type === 'background') p['background-color'] = C.land;
        else if (l.type === 'fill') {
          delete p['fill-pattern'];
          p['fill-color'] = sl === 'water' || /water/.test(id) ? C.water : /ice|glacier/.test(id) ? C.ice : /sand|beach/.test(id) ? C.sand : sl === 'building' ? C.build
            : sl === 'landcover' || sl === 'park' || /park|wood|grass|forest|cemetery|pitch/.test(id) ? C.green : sl === 'aeroway' || sl === 'transportation' ? '#fff3d6' : C.urban;
          if (sl === 'building') p['fill-outline-color'] = C.ink; else delete p['fill-outline-color'];
        } else if (l.type === 'line') {
          delete p['line-pattern'];
          p['line-color'] = sl === 'waterway' || /water/.test(id) ? C.water : sl === 'boundary' ? C.pink : /rail|transit/.test(id) ? C.rail
            : /casing|outline/.test(id) ? C.ink : /motorway|trunk|primary/.test(id) ? C.major : C.road;
        } else if (l.type === 'symbol') { p['text-color'] = '#3b2d4d'; p['text-halo-color'] = '#ffffff'; p['text-halo-width'] = 1.8; }
      }
      s.sky = { 'sky-color': '#6ecbff', 'horizon-color': '#ffe6f2', 'fog-color': '#fff7fb', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 0.5, 9, 0] };
      s.light = { anchor: 'viewport', color: '#ffffff', intensity: 0.25 };
    }
    for (const l of s.layers) if (l.type === 'fill-extrusion') {
      l.minzoom = 13;
      // leave a clearing where a hand-built landmark model stands
      if (window.Landmarks) l.filter = ['all', ['!', ['has', 'hide_3d']], ['>', ['distance', { type: 'MultiPoint', coordinates: Landmarks.list.map(L => [L.lng, L.lat]) }], 150]];
      if (kind === 'toon') {
        l.paint = { ...l.paint, 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true,
          'fill-extrusion-color': ['match', ['%', ['round', ['coalesce', ['get', 'render_height'], 6]], 6], 0, '#ffb3c6', 1, '#ffd6a5', 2, '#fff3a3', 3, '#b9f6c0', 4, '#a8d8ff', '#cdbdff'] };
        continue;
      }
      l.paint = { ...l.paint, 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, kind === 'sat' ? '#dfe5e8' : '#d5dbe0', 120, '#ffffff', 400, '#ffd9bf'], 'fill-extrusion-opacity': kind === 'sat' ? 0.9 : 0.96, 'fill-extrusion-vertical-gradient': true };
    }
    return s;
  };

  const mapPadding = () => {
    if (!map) return;
    const place = $('#place').classList.contains('is-open'), tripOpen = $('#trip').classList.contains('is-open');
    map.setPadding(isMobile() ? { top: 110, bottom: place || tripOpen ? innerHeight * 0.6 : 0, left: 0, right: 0 } : { top: 72, bottom: 0, left: tripOpen ? 456 : 0, right: place ? 456 : 0 });
  };

  async function enterMap(lat, lng, zoom, pitch = 0) {
    if (mapMode && zoom) return map.flyTo({ center: [lng, lat], zoom, pitch, essential: true });
    if (mapMode) return;
    mapMode = true;   // set early so the globe does not ask twice
    try { await loadMapLib(); }
    catch { mapMode = false; controls.minDistance = 108.4; return toast('The detail map could not load. Check your connection.'); }
    if (!map) {
      map = new maplibregl.Map({ container: 'map', style: buildStyle(mapKind), center: [lng, lat], zoom: 6.6, maxPitch: 75, maxZoom: 19.5, attributionControl: { compact: true } });
      map.on('zoom', e => { if (e.originalEvent && map.getZoom() < 5.6) exitMap(); });
      map.on('zoomend', e => {   // tilt once when the visitor reaches building level, so the 3D shapes show
        const z = map.getZoom();
        if (z < 13) autoTilted = false;
        else if (e.originalEvent && z >= 14.6 && !autoTilted && map.getPitch() < 10) { autoTilted = true; map.easeTo({ pitch: 58, duration: 900 }); }
      });
      map.on('pitchend', () => $('#toggle-tilt').setAttribute('aria-pressed', map.getPitch() > 20));
      map.on('error', () => {});
      map.on('style.load', () => window.Landmarks?.attach(map));
      window.meridianMap = map;   // handy for debugging in the console
    } else map.jumpTo({ center: [lng, lat], zoom: 6.6, pitch: 0, bearing: 0 });
    document.body.classList.add('map-mode'); pauseSpin(); globe.pauseAnimation();
    map.resize(); mapPadding(); syncMapMarkers();
    if (zoom) map.flyTo({ center: [lng, lat], zoom, pitch, essential: true });
    if (!mapHint) { mapHint = true; toast('Cartoon map. Keep zooming for the 3D city and famous landmarks, zoom out to return to the globe.'); }
  }
  function exitMap() {
    if (!mapMode) return;
    const c = map.getCenter(); mapMode = false;
    document.body.classList.remove('map-mode'); globe.resumeAnimation();
    globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: 0.19 }, 0); maybeResume();
  }

  function syncMapMarkers() {
    if (!map) return;
    mapPins.forEach(m => m.remove()); mapPins = [];
    const add = (lat, lng, html, cls, onClick) => {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'pin ' + cls; el.innerHTML = html;
      if (onClick) el.addEventListener('click', e => { e.stopPropagation(); onClick(); });
      mapPins.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map));
    };
    spotMarkers.forEach(s => add(s.lat, s.lng,
      `${s.img ? `<img src="${cimg(s.img, 160)}" alt="">` : `<i class="ph ${LIVE[s.food]?.icon || 'ph-map-pin'}"></i>`}<span>${esc(s.name)}</span>`,
      (s.img ? 'photo' : 'ico') + (view.focus?.id === s.id ? ' is-focus' : ''), () => focusSpot(s.id, true)));
    trip.stops.forEach((s, i) => add(s.lat, s.lng, `<b>${i + 1}</b><span>${esc(s.name)}</span>`, 'stop', null));
    if (user) add(user.lat, user.lng, '<b></b><span>You are here</span>', 'me', openAround);
  }
  const syncMarkers = () => {
    els.forEach((el, id) => {
      const n = stopIndex(id);
      el.classList.toggle('is-active', current?.id === id);
      el.classList.toggle('is-stop', n > -1);
      el.classList.toggle('is-user', id === 'user');
      el.classList.toggle('is-focus', view.focus?.id === id);
      el.firstElementChild.textContent = n > -1 ? n + 1 : '';
    });
  };

  /* ---------------- Location ---------------- */
  const setUser = (lat, lng, approx) => {
    user = { lat, lng, approx };
    const d = extras.get('user') || { id: 'user', kind: 'user', name: 'You' };
    Object.assign(d, { lat, lng, label: approx ? 'You are around here' : 'You are here' });
    extras.set('user', d);
    const el = els.get('user'); if (el) el.lastElementChild.textContent = d.label;
    refreshGlobe(); flyTo(lat, lng, 0.9); maybeResume();
  };
  const approxFromTimezone = async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const city = tz.split('/').pop().replace(/_/g, ' ');
      const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${enc(city)}`);
      const r = j.results?.[0]; if (!r) throw 0;
      setUser(r.latitude, r.longitude, true);
      toast(`Location is off, so this is a rough guess from your time zone (${city}).`);
    } catch { toast('Could not find your location. Search for your city instead.'); }
  };
  const locate = () => {
    if (!navigator.geolocation) return approxFromTimezone();
    toast('Finding you on the globe');
    navigator.geolocation.getCurrentPosition(
      p => { setUser(p.coords.latitude, p.coords.longitude, false); toast('You are here. Tap your marker to see what is nearby.'); },
      () => approxFromTimezone(),
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 },
    );
  };
  const openAround = () => {
    if (!user) return;
    openPlace({ id: 'around', kind: 'custom', name: 'Around you', country: user.approx ? 'Approximate location' : 'Your location', lat: user.lat, lng: user.lng, around: true });
  };

  /* ---------------- Places: countries and regions ---------------- */
  const spanOf = f => {
    let a = 180, b = -180, c = 90, d = -90;
    const walk = x => typeof x[0] === 'number' ? (a = Math.min(a, x[0]), b = Math.max(b, x[0]), c = Math.min(c, x[1]), d = Math.max(d, x[1])) : x.forEach(walk);
    walk(f.geometry.coordinates); return Math.max(b - a, (d - c) * 1.4);
  };
  const countryPlace = code => {
    const f = countries.find(x => x.properties.code === code); if (!f) return null;
    const p = f.properties;
    return { id: 'country-' + code, kind: 'country', code, name: p.name, country: 'Country', lat: p.lat, lng: p.lng, alt: Math.max(0.28, Math.min(1.7, spanOf(f) / 42)) };
  };
  const regionPlace = (r, c) => ({ id: r.id, kind: 'region', qid: r.id, name: r.n, country: c.name, code: c.code, lat: r.lat, lng: r.lng, r: r.r, clat: r.clat, clng: r.clng, cap: r.cap, img: r.img, alt: Math.max(0.1, Math.min(1.2, r.r / 190)) });
  async function openCountry(code, opt) {
    await countriesReady;
    const p = countryPlace(code);
    if (p) openPlace(p, opt); else toast('That country is not on the map yet.');
  }

  /* ---------------- Panel basics ---------------- */
  const WEATHER = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
  const skeleton = (n, cls = 'line') => Array.from({ length: n }, (_, i) => `<div class="skeleton ${cls}" style="width:${cls === 'line' ? 100 - i * 12 : 100}%"></div>`).join('');
  const emptyState = (icon, text, extra = '') => `<div class="empty-state"><i class="ph ${icon}"></i><p>${text}</p>${extra}</div>`;
  const loaded = {};
  const view = { spots: null, live: {}, liveState: {}, filter: 'all', sort: 'famous', focus: null, shown: 30 };

  const setPanel = (id, open) => {
    const p = $(id); p.classList.toggle('is-open', open); p.inert = !open;
    document.body.classList.toggle(id === '#place' ? 'has-panel' : 'has-trip', open);
    mapPadding();
  };

  const fact = (icon, label, value) => `<div class="fact"><i class="ph ${icon}"></i><div><span>${label}</span>${esc(value)}</div></div>`;
  const renderFacts = (p, live = {}) => {
    const out = [];
    if (p.best) out.push(fact('ph-calendar-check', 'Best time', p.best));
    if (p.budget) out.push(fact('ph-wallet', 'Cost level (rough)', { $: 'Budget friendly', $$: 'Mid range', $$$: 'Pricey' }[p.budget]));
    if (p.cap && p.kind === 'region') out.push(fact('ph-buildings', 'Main city', p.cap));
    if (live.regions) out.push(fact('ph-map-trifold', 'Regions', String(live.regions)));
    if (live.time) out.push(fact('ph-clock', 'Local time', live.time));
    if (live.weather) out.push(fact('ph-thermometer-simple', 'Right now', live.weather));
    $('#place-facts').innerHTML = out.join('');
  };
  let liveFacts = {};

  const updateAddButton = () => {
    const b = $('#add-stop'); if (!current) return;
    const on = stopIndex(current.id) > -1;
    b.classList.toggle('is-added', on);
    b.innerHTML = on ? '<i class="ph ph-check-circle"></i><span>In my trip. Open planner</span>' : '<i class="ph ph-plus-circle"></i><span>Add to my trip</span>';
  };

  const selectTab = name => {
    $$('.tabs [role=tab]').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === name));
    $$('.tab-body').forEach(b => b.hidden = b.dataset.body !== name);
    if (!current || loaded[name]) return;
    loaded[name] = true;
    if (name === 'photos') loadPhotos(current, loadToken);
    if (name === 'videos') loadVideos(current, loadToken);
    if (name === 'reviews') renderReviews(current, loadToken);
  };

  const setCover = (file, alt) => {
    const img = $('#place-img');
    img.onload = () => img.classList.add('is-ready');
    img.srcset = `${cimg(file, 960)} 960w, ${cimg(file, 1920)} 1920w, ${cimg(file, 3840)} 3840w`;
    img.sizes = '(max-width: 767px) 100vw, 440px';
    img.src = cimg(file, 960); img.alt = alt; img.dataset.file = file;
  };

  async function openPlace(p, { push = true } = {}) {
    current = p; const token = ++loadToken;
    document.dispatchEvent(new CustomEvent('meridian:place', { detail: current }));
    Object.keys(loaded).forEach(k => delete loaded[k]);
    Object.assign(view, { spots: null, live: {}, liveState: {}, filter: 'all', sort: 'famous', focus: null, shown: 30 });
    spotMarkers = []; liveFacts = {};
    if (p.kind === 'custom') extras.set(p.id, p);

    $('#place-name').textContent = p.name;
    const crumb = $('#place-country'); crumb.textContent = p.country || ''; crumb.classList.toggle('is-link', p.kind === 'region');
    $('#place-blurb').innerHTML = p.line ? esc(p.line) + skeleton(3) : skeleton(4);
    $('#regions-wrap').hidden = true; $('#regions-find').value = '';
    $('#sights-wrap').hidden = p.kind === 'country' || p.kind === 'region';
    $('#place-sights').innerHTML = skeleton(4, 'block');
    $('#sights-title').textContent = p.kind === 'city' ? 'Places to see' : 'Notable places nearby';
    $('#spots-count').textContent = ''; $('#spot-sort').value = 'famous';
    const img = $('#place-img'); img.classList.remove('is-ready'); img.removeAttribute('src'); img.removeAttribute('srcset'); img.alt = ''; delete img.dataset.file;
    renderFacts(p); updateAddButton(); selectTab('overview'); renderSpots();
    $('#place .panel-scroll').scrollTop = 0;
    setPanel('#place', true);
    if (isMobile()) setPanel('#trip', false);
    refreshGlobe();
    if (mapMode && p.kind !== 'country') map.flyTo({ center: [p.lng, p.lat], zoom: p.kind === 'region' ? Math.max(6.2, 14.8 - Math.log2(p.r || 70)) : p.around ? 13.5 : 11.4, pitch: 0, essential: true });
    else flyTo(p.lat, p.lng, p.alt || (p.around ? 0.2 : 0.5));

    if (push) {
      const q = p.kind === 'city' ? `?city=${p.id}` : p.kind === 'country' ? `?country=${p.code}` : p.kind === 'region' ? `?country=${p.code}&region=${p.qid}`
        : p.around ? location.pathname : `?q=${enc(p.name)}&lat=${p.lat.toFixed(4)}&lng=${p.lng.toFixed(4)}${p.country ? `&c=${enc(p.country)}` : ''}`;
      history.pushState({}, '', q);
    }
    document.title = p.around ? 'Meridian | Around you' : `${p.name}${p.country && p.kind !== 'country' ? ', ' + p.country : ''} travel spots and trip planner | Meridian`;

    loadSummary(p, token); loadSpots(p, token);
    if (p.kind === 'city' || p.kind === 'custom') loadSights(p, token);
    if (p.kind !== 'country') loadLive(p, token);
  }

  const closePlace = () => {
    current = null; loadToken++; spotMarkers = []; view.focus = null;
    document.dispatchEvent(new CustomEvent('meridian:place', { detail: current }));
    setPanel('#place', false); refreshGlobe(); maybeResume();
    history.pushState({}, '', location.pathname);
    document.title = 'Meridian | Interactive world travel planner';
    $$('#place video').forEach(v => v.pause());
  };

  async function loadSummary(p, token) {
    const blurb = $('#place-blurb');
    if (p.around) { blurb.textContent = 'Travel spots, cafes and restaurants close to where you are right now.'; return; }
    const tries = p.wiki ? [p.wiki] : p.kind === 'country' ? [p.name, `${p.name} (country)`]
      : p.kind === 'region' ? [`${p.name} province`, `${p.name}, ${p.country}`, p.name]
      : [p.name, p.admin && `${p.name}, ${p.admin}`, p.country && `${p.name}, ${p.country}`].filter(Boolean);
    let s = null;
    for (const t of tries) {
      try {
        const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(t.replace(/ /g, '_'))}?redirect=true`);
        if (j.type === 'standard' && j.extract) { s = j; p.wiki = j.titles?.canonical?.replace(/_/g, ' ') || t; break; }
      } catch { /* try the next title */ }
    }
    if (token !== loadToken) return;
    if (!s) { blurb.textContent = p.line || 'Open the Spots tab to see what is here.'; return; }
    blurb.innerHTML = `${p.line ? `<strong>${esc(p.line)}</strong> ` : ''}${esc(s.extract)}<span class="note" style="display:block">Text from <a href="${esc(s.content_urls?.desktop?.page || '#')}" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA.</span>`;
    if (p.kind === 'country' || $('#place-img').dataset.file) return;   // countries use their top spot as cover
    let pic = s;
    if (p.img && p.kind === 'city') { try { pic = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(p.img.replace(/ /g, '_'))}?redirect=true`); } catch { pic = s; } if (token !== loadToken) return; }
    const m = /\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/.exec(pic.originalimage?.source || '');
    if (m && /\.(jpe?g|png|webp)$/i.test(m[1])) setCover(decodeURIComponent(m[1]), p.name);
    else if (pic.thumbnail?.source) { const img = $('#place-img'); img.onload = () => img.classList.add('is-ready'); img.src = pic.thumbnail.source; img.alt = p.name; }
  }

  async function loadLive(p, token) {
    try {
      const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&current=temperature_2m,weather_code&timezone=auto`);
      if (token !== loadToken) return;
      liveFacts.time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', weekday: 'short', timeZone: j.timezone }).format(new Date());
      liveFacts.weather = `${Math.round(j.current.temperature_2m)}°C, ${(WEATHER[j.current.weather_code] || 'Mixed').toLowerCase()}`;
      renderFacts(p, liveFacts);
    } catch { /* live facts are optional */ }
  }

  /* Short hand-picked list (featured cities) or nearby notable places (searched cities), shown on Overview. */
  async function loadSights(p, token) {
    const list = $('#place-sights');
    let pages = [];
    try {
      if (p.sights?.length) {
        const j = await getJSON(`${WIKI}&redirects=1&prop=pageimages|description|coordinates&piprop=name|thumbnail&pithumbsize=320&titles=${enc(p.sights.join('|'))}`);
        const all = Object.values(j.query?.pages || {}).filter(x => !x.missing);
        const alias = {}; (j.query?.redirects || []).concat(j.query?.normalized || []).forEach(r => alias[r.from] = r.to);
        pages = p.sights.map(t => all.find(x => x.title === (alias[alias[t] || t] || alias[t] || t))).filter(Boolean);
        all.forEach(x => { if (!pages.includes(x)) pages.push(x); });
      } else {
        const j = await getJSON(`${WIKI}&generator=geosearch&ggscoord=${p.lat}|${p.lng}&ggsradius=10000&ggslimit=40&prop=pageimages|description|coordinates&piprop=name|thumbnail&pithumbsize=320`);
        pages = Object.values(j.query?.pages || {})
          .filter(x => x.thumbnail && !/district|province|municipality|subdistrict|county|constituency/i.test(x.description || ''))
          .sort((a, b) => a.index - b.index).slice(0, 6);
      }
    } catch { /* handled below */ }
    if (token !== loadToken) return;
    if (!pages.length) { $('#sights-wrap').hidden = true; return; }
    const stop = trip.stops[stopIndex(p.id)];
    list.innerHTML = pages.map(x => {
      const on = stop?.places.includes(x.title);
      const co = x.coordinates?.[0];
      return `<li class="sight" data-title="${esc(x.title)}" ${co ? `data-lat="${co.lat}" data-lng="${co.lon}"` : ''} ${x.pageimage ? `data-file="${esc(x.pageimage.replace(/_/g, ' '))}"` : ''}>
        ${x.thumbnail ? `<img src="${esc(x.thumbnail.source)}" alt="" loading="lazy">` : '<div class="ph-img"><i class="ph ph-image"></i></div>'}
        <div><strong>${esc(x.title)}</strong><small>${esc(x.description || '')}</small>
          <a href="https://www.google.com/maps/search/?api=1&query=${enc(x.title + (p.around ? '' : ' ' + p.name))}" target="_blank" rel="noopener">Map and reviews</a></div>
        <button class="icon-btn ${on ? 'is-on' : ''}" type="button" ${p.around ? 'disabled' : ''} aria-label="${on ? 'Remove' : 'Add'} ${esc(x.title)} ${on ? 'from' : 'to'} my trip" aria-pressed="${!!on}"><i class="ph ${on ? 'ph-check' : 'ph-plus'}"></i></button>
      </li>`;
    }).join('');
  }

  const togglePlace = (title) => {   // save or remove a named place on the current stop
    if (!current) return false;
    if (current.around) { toast('Search for a city first, then save places to it.'); return false; }
    let i = stopIndex(current.id);
    if (i < 0) { addStop(current, { quiet: true }); i = stopIndex(current.id); }
    const places = trip.stops[i].places, at = places.indexOf(title);
    at > -1 ? places.splice(at, 1) : places.push(title);
    saveTrip(); renderTrip();
    toast(at < 0 ? `${title} saved to your ${current.name} stop` : `${title} removed`);
    return at < 0;
  };

  $('#place-sights').addEventListener('click', e => {
    const li = e.target.closest('.sight'); if (!li || !current || e.target.closest('a')) return;
    const btn = e.target.closest('.icon-btn');
    if (btn) {
      if (btn.disabled) return;
      const on = togglePlace(li.dataset.title);
      btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', on);
      btn.firstElementChild.className = `ph ${on ? 'ph-check' : 'ph-plus'}`;
    } else if (e.target.tagName === 'IMG' && li.dataset.file) {
      openLightbox({ file: li.dataset.file, title: li.dataset.title });
    } else if (li.dataset.lat) enterMap(+li.dataset.lat, +li.dataset.lng, 15.6, 58);
  });

  /* ---------------- Spot explorer ---------------- */
  const FILTERS = [
    ['all', 'All spots', 'ph-map-pin'], ['insta', 'Instagrammable', 'ph-camera'], ['nature', 'Nature', 'ph-tree'],
    ['culture', 'Culture', 'ph-bank'], ['fun', 'Fun', 'ph-ticket'], ['cafe', 'Cafes', 'ph-coffee'], ['restaurant', 'Restaurants', 'ph-fork-knife'],
    ['dive', 'Diving', 'ph-waves'], ['bar', 'Bars', 'ph-martini'], ['hotel', 'Stays', 'ph-bed'], ['shop', 'Shopping', 'ph-shopping-bag'],
  ];
  /* Categories that are not stored with the site: they are asked live from OpenStreetMap when picked. */
  const LIVE = {
    cafe: { icon: 'ph-coffee', one: 'Cafe', many: 'cafes', r: 3000, sel: ['["amenity"="cafe"]'] },
    restaurant: { icon: 'ph-fork-knife', one: 'Restaurant', many: 'restaurants', r: 3000, sel: ['["amenity"="restaurant"]'] },
    dive: { icon: 'ph-waves', one: 'Diving', many: 'diving places', r: 60000, wide: true, sel: ['["sport"~"scuba_diving"]', '["amenity"="dive_centre"]', '["shop"="scuba_diving"]'] },
    bar: { icon: 'ph-martini', one: 'Bar', many: 'bars and nightlife spots', r: 3000, sel: ['["amenity"~"^(bar|pub|nightclub)$"]'] },
    hotel: { icon: 'ph-bed', one: 'Stay', many: 'places to stay', r: 3000, sel: ['["tourism"~"^(hotel|hostel|guest_house|resort)$"]'] },
    shop: { icon: 'ph-shopping-bag', one: 'Shopping', many: 'shopping places', r: 6000, sel: ['["shop"~"^(mall|department_store)$"]', '["amenity"="marketplace"]'] },
  };
  const isFood = f => Object.hasOwn(LIVE, f);
  const allLive = () => Object.values(view.live).flat();
  const centre = p => ({ lat: p.clat ?? p.lat, lng: p.clng ?? p.lng });

  /* Live lookup for places that have no pre-built file (any searched city). Slower: Wikidata can take a while. */
  const liveSpots = async (lat, lng, radius, minSl) => {
    const [classes] = await Promise.all([loadData('classes.json'), typesReady]);
    if (!classes) return [];
    const order = Object.keys(TYPES), rootKey = {};
    const q = `SELECT ?item ?itemLabel ?itemDescription (GROUP_CONCAT(DISTINCT STRAFTER(STR(?t),"entity/");separator=" ") AS ?ts) (SAMPLE(?c) AS ?coord) (SAMPLE(?i) AS ?img) ?sl (MAX(?h) AS ?wh) WHERE { hint:Query hint:optimizer "None".
      SERVICE wikibase:around { ?item wdt:P625 ?c . bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral; wikibase:radius "${radius}". }
      ?item wikibase:sitelinks ?sl. FILTER(?sl>=${minSl}) ?item wdt:P18 ?i; wdt:P31 ?t. OPTIONAL { ?item wdt:P1435 wd:Q9259. BIND(1 AS ?h) }
      SERVICE wikibase:label{bd:serviceParam wikibase:language "en"} } GROUP BY ?item ?itemLabel ?itemDescription ?sl ORDER BY DESC(?sl) LIMIT 600`;
    const j = await getJSON('https://query.wikidata.org/sparql?format=json&query=' + enc(q), { signal: AbortSignal.timeout(58000) });
    const types = await loadData('typeids.json');   // root QID -> key
    Object.assign(rootKey, types || {});
    const out = [];
    for (const r of j.results.bindings) {
      const name = r.itemLabel?.value; if (!name || /^Q\d+$/.test(name)) continue;
      const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(r.coord?.value || ''); if (!m) continue;
      const file = decodeURIComponent((r.img?.value || '').split('Special:FilePath/')[1] || ''); if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
      let best = null;
      for (const t of (r.ts?.value || '').split(' ')) { const k = rootKey[classes[t]]; if (k && (best === null || order.indexOf(k) < order.indexOf(best))) best = k; }
      if (!best && !r.wh) continue;
      out.push({ id: r.item.value.split('/').pop(), n: name, t: best || 'attraction', lat: +m[2], lng: +m[1], img: file, sl: +r.sl.value, d: r.itemDescription?.value?.slice(0, 110), wh: r.wh ? 1 : 0 });
      if (out.length >= 120) break;
    }
    return out;
  };

  /* Quick list from Wikipedia's "what is near here" search: answers in about a second. */
  const QUICK = [[/beach/, 'beach'], [/waterfall/, 'waterfall'], [/national park/, 'national-park'], [/temple|pagoda|\bwat\b/, 'temple'], [/shrine/, 'shrine'], [/mosque/, 'mosque'],
    [/church|cathedral|basilica|chapel/, 'church'], [/museum|gallery/, 'museum'], [/palace/, 'palace'], [/castle|fort/, 'castle'], [/garden/, 'garden'], [/\bpark\b/, 'park'],
    [/bridge/, 'bridge'], [/tower|skyscraper/, 'tower'], [/market|bazaar/, 'market'], [/zoo/, 'zoo'], [/aquarium/, 'aquarium'], [/island/, 'island'], [/lake/, 'lake'],
    [/mountain|peak|volcano/, 'mountain'], [/monument|memorial|statue/, 'monument'], [/square|plaza/, 'square'], [/ruin|archaeolog|ancient/, 'ruins'], [/opera|theatre|theater/, 'opera-house'], [/amusement|theme park/, 'amusement-park']];
  const quickSpots = async (lat, lng) => {
    const j = await getJSON(`${WIKI}&generator=geosearch&ggscoord=${lat}%7C${lng}&ggsradius=10000&ggslimit=50&prop=coordinates%7Cpageimages%7Cdescription%7Cpageprops&piprop=name&pilimit=50&colimit=50&ppprop=wikibase_item`, { signal: AbortSignal.timeout(8000) });
    const out = [];
    Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index).forEach((pg, i) => {
      const co = pg.coordinates?.[0], file = pg.pageimage, d = (pg.description || '').toLowerCase();
      if (!co || !file || !/\.(jpe?g|png|webp)$/i.test(file)) return;
      if (/stock exchange|company|railway station|metro station|school|university|hospital|ward of|district of/.test(d + ' ' + pg.title.toLowerCase())) return;
      const hit = QUICK.find(([re]) => re.test(d) || re.test(pg.title.toLowerCase()));
      if (!hit || !TYPES[hit[1]]) return;
      out.push({ id: pg.pageprops?.wikibase_item || 'w' + pg.pageid, n: pg.title, t: hit[1], lat: co.lat, lng: co.lon, img: file.replace(/_/g, ' '), sl: 60 - i, d: (pg.description || '').slice(0, 110), wh: 0 });
    });
    return out;
  };

  async function loadSpots(p, token) {
    await typesReady;
    let spots = null, data = null;
    if (p.kind === 'country') {
      data = await loadData(`country/${p.code}.json`);
      spots = data?.spots || null;
      if (token !== loadToken) return;
      if (data?.regions?.length) renderRegions(p, data);
      if (data) { liveFacts.regions = data.regions.length; renderFacts(p, liveFacts); }
    } else if (p.kind === 'region') spots = (await loadData(`region/${p.qid}.json`))?.spots || null;
    else if (p.kind === 'city') spots = (await loadData(`city/${p.id}.json`))?.spots || null;

    if (!spots && p.kind !== 'country') {
      const key = `sp.${p.id}.${p.lat.toFixed(2)}.${p.lng.toFixed(2)}`;
      spots = stash.get(key);
      if (!spots) {
        view.loadingNote = 'Collecting travel spots for this place for the first time. This can take up to a minute.';
        renderSpots();
        let quick = null;
        quickSpots(p.lat, p.lng).then(q => {
          quick = q;
          if (token !== loadToken || view.spots !== null || !q.length) return;
          const c = centre(p); q.forEach(s => { s.km = km(c, s); });
          view.spots = q; view.loadingNote = ''; $('#spots-count').textContent = q.length; renderSpots();   // shown at once, replaced by the fuller list below
        }).catch(() => {});
        try { spots = await liveSpots(p.lat, p.lng, p.r || (p.around ? 15 : 25), p.around ? 1 : 2); if (spots.length) stash.set(key, spots); }
        catch { spots = []; }
        if (!spots.length && quick?.length) spots = quick;
        view.error = !spots.length;
      }
    }
    if (token !== loadToken) return;
    view.loadingNote = '';
    view.spots = spots || [];
    const c = centre(p);
    view.spots.forEach(s => { s.km = km(c, s); });
    $('#spots-count').textContent = view.spots.length || '';
    if (view.spots[0] && !$('#place-img').dataset.file && (p.kind === 'country' || p.kind === 'region')) setCover(p.img || view.spots[0].img, p.name);
    renderSpots();
  }

  function renderRegions(p, data) {
    const wrap = $('#regions-wrap'), box = $('#place-regions');
    wrap.hidden = false;
    $('#regions-title').textContent = `${data.regions.length} regions of ${p.name}`;
    box.innerHTML = data.regions.map((r, i) => `<button class="region" type="button" data-i="${i}" data-n="${esc(r.n.toLowerCase())}">
      <span class="region-img">${r.img ? `<img src="${cimg(r.img, 400)}" alt="" loading="lazy">` : '<i class="ph ph-map-pin-area"></i>'}</span><strong>${esc(r.n)}</strong></button>`).join('');
    box.onclick = e => { const b = e.target.closest('.region'); if (b) openPlace(regionPlace(data.regions[+b.dataset.i], { name: p.name, code: p.code })); };
  }
  $('#regions-find').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    $$('#place-regions .region').forEach(b => b.hidden = q && !b.dataset.n.includes(q));
  });

  const filtered = () => {
    const f = view.filter;
    let list = isFood(f) ? (view.live[f] || [])
      : (view.spots || []).filter(s => f === 'all' || (f === 'insta' ? TYPES[s.t]?.insta : TYPES[s.t]?.cat === f));
    if (view.sort === 'near') list = [...list].sort((a, b) => a.km - b.km);
    else if (view.sort === 'az') list = [...list].sort((a, b) => a.n.localeCompare(b.n));
    return list;
  };

  const instaLink = name => `https://www.instagram.com/explore/search/keyword/?q=${enc(name)}`;
  const mapsLink = (name, s) => `https://www.google.com/maps/search/?api=1&query=${enc(name + (current && !current.around ? ' ' + (current.kind === 'country' ? current.name : current.name) : ''))}`;
  const saved = name => trip.stops[stopIndex(current?.id)]?.places.includes(name);

  const spotCard = s => {
    const t = TYPES[s.t] || { label: 'Attraction' }, on = saved(s.n);
    return `<li class="spot" data-id="${s.id}">
      <button class="spot-img" type="button" aria-label="Open photo of ${esc(s.n)} in 4K">
        <img src="${cimg(s.img, 640)}" srcset="${cimg(s.img, 640)} 640w, ${cimg(s.img, 1280)} 1280w" sizes="(max-width: 767px) 100vw, 400px" alt="${esc(s.n)}" loading="lazy">
      </button>
      <div class="spot-body">
        <div class="spot-type"><span>${esc(t.label)}${s.wh ? ', UNESCO World Heritage' : ''}</span><span>${fmtKm(s.km)} from centre</span></div>
        <strong>${esc(s.n)}</strong>${s.d ? `<p>${esc(s.d)}</p>` : ''}
        <div class="spot-actions">
          <button class="pill add ${on ? 'is-on' : ''}" type="button" data-act="save" aria-pressed="${!!on}"><i class="ph ${on ? 'ph-check' : 'ph-plus'}"></i>${on ? 'Saved' : 'Save'}</button>
          <button class="pill" type="button" data-act="show"><i class="ph ph-globe-hemisphere-west"></i>Show</button>
          <a class="pill" href="${mapsLink(s.n)}" target="_blank" rel="noopener"><i class="ph ph-star"></i>Reviews</a>
          <a class="pill" href="${instaLink(s.n)}" target="_blank" rel="noopener"><i class="ph ph-instagram-logo"></i>Instagram</a>
        </div>
      </div></li>`;
  };
  const foodCard = s => {
    const on = saved(s.n);
    return `<li class="spot food" data-id="${s.id}">
      <span class="food-ico"><i class="ph ${LIVE[s.k].icon}"></i></span>
      <div class="spot-body">
        <div class="spot-type"><span>${esc(s.cu || LIVE[s.k].one)}</span><span>${fmtKm(s.km)} from centre</span></div>
        <strong>${esc(s.n)}</strong>
        ${s.addr || s.hrs ? `<p>${esc([s.addr, s.hrs && 'Open ' + s.hrs].filter(Boolean).join('. '))}</p>` : ''}
        <div class="spot-actions">
          <button class="pill add ${on ? 'is-on' : ''}" type="button" data-act="save" aria-pressed="${!!on}"><i class="ph ${on ? 'ph-check' : 'ph-plus'}"></i>${on ? 'Saved' : 'Save'}</button>
          <button class="pill" type="button" data-act="show"><i class="ph ph-globe-hemisphere-west"></i>Show</button>
          <a class="pill" href="https://www.google.com/maps/search/?api=1&query=${enc(s.n)}%20%40${s.lat},${s.lng}" target="_blank" rel="noopener"><i class="ph ph-star"></i>Reviews and photos</a>
          <a class="pill" href="${s.ig ? `https://www.instagram.com/${enc(s.ig)}/` : instaLink(s.n)}" target="_blank" rel="noopener"><i class="ph ph-instagram-logo"></i>${s.ig ? '@' + esc(s.ig) : 'Instagram'}</a>
          ${s.web ? `<a class="pill" href="${esc(s.web)}" target="_blank" rel="noopener"><i class="ph ph-link"></i>Website</a>` : ''}
        </div>
      </div></li>`;
  };

  function renderSpots() {
    const p = current; if (!p) return;
    const f = view.filter, list = $('#spot-list');
    const counts = { all: view.spots?.length, insta: 0, nature: 0, culture: 0, fun: 0 };
    (view.spots || []).forEach(s => { const t = TYPES[s.t]; if (t) { counts[t.cat]++; if (t.insta) counts.insta++; } });
    $('#spot-filters').innerHTML = FILTERS.map(([k, label, icon]) =>
      `<button class="chip" type="button" data-f="${k}" aria-pressed="${k === f}"><i class="ph ${icon}"></i>${label}${counts[k] ? ` <span>${counts[k]}</span>` : ''}</button>`).join('');

    if (isFood(f)) {
      const L = LIVE[f];
      if (p.kind === 'country' && !L.wide) { list.innerHTML = `<li>${emptyState(L.icon, `This category is listed per place. Pick a region on the Overview tab or search a city to see ${L.many}.`)}</li>`; $('#spot-total').textContent = ''; return setSpotMarkers([]); }
      if (!view.live[f] && view.liveState[f] !== 'error') { if (view.liveState[f] !== 'loading') loadPoi(p, f, loadToken); list.innerHTML = skeleton(5, 'block'); $('#spot-total').textContent = 'Loading live'; return; }
      if (view.liveState[f] === 'error') { list.innerHTML = `<li>${emptyState('ph-plugs', 'The map service is busy right now, so this list could not load.', '<button class="btn btn-ghost" type="button" data-act="retry-food">Try again</button>')}</li>`; $('#spot-total').textContent = ''; return; }
    } else if (view.spots === null) {
      list.innerHTML = (view.loadingNote ? `<li class="note" style="margin:0 0 12px">${view.loadingNote}</li>` : '') + skeleton(4, 'block');
      $('#spot-total').textContent = 'Loading'; return;
    }

    const items = filtered();
    const where = p.kind === 'region' && isFood(f) && p.cap ? ` around ${p.cap}` : '';
    $('#spot-total').textContent = `${items.length} ${isFood(f) ? LIVE[f].many : 'spots'}${where}`;
    if (!items.length) {
      const msg = view.error ? 'The spot service did not answer in time. Close this place and open it again in a moment.'
        : p.kind === 'country' && !view.spots.length ? 'Spots for this country are not built yet. Search a city inside it to explore.'
        : 'Nothing in this category here. Try another filter.';
      list.innerHTML = `<li>${emptyState('ph-binoculars', msg)}</li>`; return setSpotMarkers([]);
    }
    const shown = items.slice(0, view.shown);
    list.innerHTML = shown.map(isFood(f) ? foodCard : spotCard).join('')
      + (items.length > shown.length ? `<li class="more-row"><button class="btn btn-ghost btn-wide" type="button" data-act="more">Show ${Math.min(30, items.length - shown.length)} more</button></li>` : '')
      + `<li class="note">${isFood(f) ? 'Loaded live from OpenStreetMap contributors. Ratings and photos open on Google Maps.' : 'Spots and photos from Wikidata and Wikimedia Commons. Tap a photo for the 4K view and photographer credit.'}</li>`;
    setSpotMarkers(shown.slice(0, 40));
  }

  function setSpotMarkers(items) {
    spotMarkers.forEach(m => els.delete(m.id));
    spotMarkers = items.map(s => ({ id: s.id, kind: 'spot', name: s.n, lat: s.lat, lng: s.lng, img: s.img, food: s.k }));
    refreshGlobe();
  }
  function focusSpot(id, scroll) {
    const s = [...(view.spots || []), ...allLive()].find(x => x.id === id); if (!s) return;
    view.focus = s; refreshGlobe();
    enterMap(s.lat, s.lng, s.k === 'dive' ? 13.6 : s.k ? 17.2 : TYPES[s.t]?.cat === 'nature' ? 13.2 : 16.2, 58);   // fly down to the spot in the 3D detail map
    $$('#spot-list .spot').forEach(li => li.classList.toggle('is-focus', li.dataset.id === id));
    if (scroll) { selectTab('spots'); $(`#spot-list .spot[data-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }); }
  }

  $('#spot-filters').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    view.filter = b.dataset.f; view.shown = 30; view.focus = null; renderSpots();
  });
  $('#spot-sort').addEventListener('change', e => { view.sort = e.target.value; view.shown = 30; renderSpots(); });
  $('#spot-list').addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act, li = e.target.closest('.spot');
    if (act === 'more') { view.shown += 30; return renderSpots(); }
    if (act === 'retry-food') { view.liveState[view.filter] = ''; return renderSpots(); }
    if (!li) return;
    const s = [...(view.spots || []), ...allLive()].find(x => x.id === li.dataset.id); if (!s) return;
    if (e.target.closest('.spot-img')) return openLightbox({ file: s.img, title: s.n });
    if (act === 'show') return focusSpot(s.id);
    if (act === 'save') {
      const b = e.target.closest('.pill'), on = togglePlace(s.n);
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on);
      b.innerHTML = `<i class="ph ${on ? 'ph-check' : 'ph-plus'}"></i>${on ? 'Saved' : 'Save'}`;
    }
  });
  $('#see-spots').addEventListener('click', () => { selectTab('spots'); $('.tabs').scrollIntoView({ block: 'start' }); });

  /* Cafes and restaurants: pre-built for featured cities, otherwise asked live from OpenStreetMap. */
  const OVERPASS = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  /* Fallback source: Photon place search (OpenStreetMap data, no key). Several word searches per category, merged. */
  const PHOTON = {
    cafe: [['cafe', 'amenity:cafe'], ['coffee', 'amenity:cafe'], ['espresso', 'amenity:cafe'], ['bakery', 'amenity:cafe'], ['tea', 'amenity:cafe'], ['roasters', 'amenity:cafe']],
    restaurant: [['restaurant', 'amenity:restaurant'], ['kitchen', 'amenity:restaurant'], ['grill', 'amenity:restaurant'], ['bistro', 'amenity:restaurant'], ['house', 'amenity:restaurant'], ['thai', 'amenity:restaurant'], ['sushi', 'amenity:restaurant'], ['pizza', 'amenity:restaurant']],
    dive: [['diving', 'amenity:dive_centre'], ['dive', 'amenity:dive_centre'], ['scuba', 'amenity:dive_centre'], ['divers', 'amenity:dive_centre'], ['dive', 'shop:scuba_diving'], ['diving', 'shop:scuba_diving'], ['dive', 'sport:scuba_diving'], ['reef', 'sport:scuba_diving']],
    bar: [['bar', 'amenity:bar'], ['pub', 'amenity:pub'], ['hotel', 'amenity:pub'], ['club', 'amenity:nightclub'], ['lounge', 'amenity:bar'], ['rooftop', 'amenity:bar']],
    hotel: [['hotel', 'tourism:hotel'], ['resort', 'tourism:resort'], ['hostel', 'tourism:hostel'], ['guesthouse', 'tourism:guest_house'], ['inn', 'tourism:hotel'], ['suites', 'tourism:hotel']],
    shop: [['mall', 'shop:mall'], ['centre', 'shop:mall'], ['plaza', 'shop:mall'], ['market', 'amenity:marketplace'], ['department', 'shop:department_store'], ['arcade', 'shop:mall']],
  };
  const bboxOf = (p, c, r) => {
    const ft = p.kind === 'country' && countries.find(x => x.properties.code === p.code);
    if (ft) {
      let w = 180, so = 90, e = -180, n = -90;
      const walk = g => { if (typeof g[0] === 'number') { w = Math.min(w, g[0]); so = Math.min(so, g[1]); e = Math.max(e, g[0]); n = Math.max(n, g[1]); } else g.forEach(walk); };
      walk(ft.geometry.coordinates);
      return [w, so, e, n];
    }
    const dy = r / 111000, dx = dy / Math.cos(c.lat * Math.PI / 180);
    return [c.lng - dx, c.lat - dy, c.lng + dx, c.lat + dy];
  };
  async function photon(p, f, c, r) {
    const bb = bboxOf(p, c, r).map(n => n.toFixed(4)).join(',');
    // one request at a time: this free service blocks bursts
    const res = [];
    let got = 0;
    for (const [q, tag] of PHOTON[f]) {
      try {
        const v = await getJSON(`https://photon.komoot.io/api/?q=${enc(q)}&osm_tag=${enc(tag)}&bbox=${bb}&limit=50&lang=en`, { signal: AbortSignal.timeout(9000) });
        res.push({ status: 'fulfilled', value: v }); got += v.features?.length || 0;
      } catch { res.push({ status: 'rejected' }); if (res.length === 2 && !got) break; }
      if (got >= 120) break;
    }
    if (res.every(x => x.status === 'rejected')) throw new Error('photon');
    const seen = new Set(), out = [];
    res.forEach(x => x.status === 'fulfilled' && (x.value.features || []).forEach(ft => {
      const g = ft.properties, [lo, la] = ft.geometry.coordinates; if (!g.name) return;
      const id = (g.osm_type || 'N').toLowerCase() + g.osm_id; if (seen.has(id)) return; seen.add(id);
      const sub = f === 'dive' ? (g.osm_key === 'sport' ? 'Dive site' : 'Dive centre') : f === 'cafe' || f === 'restaurant' ? '' : String(g.osm_value || '').replace(/_/g, ' ').replace(/^./, ch => ch.toUpperCase());
      out.push({ id, n: g.name, k: f, lat: la, lng: lo, cu: sub, web: '', ig: '', hrs: '', addr: [g.housenumber, g.street].filter(Boolean).join(' ') || g.city || g.county || '', s: 0 });
    }));
    return out.slice(0, 300);
  }

  async function loadPoi(p, f, token) {
    const L = LIVE[f], c = centre(p), whole = p.kind === 'country';
    view.liveState[f] = 'loading';
    let items = null;
    if ((f === 'cafe' || f === 'restaurant') && (p.kind === 'city' || p.kind === 'region')) items = (await loadData(`food/${p.id}.json`))?.items?.filter(x => x.k === f) || null;
    const key = `poi.${f}.${whole ? p.code : c.lat.toFixed(2) + '.' + c.lng.toFixed(2)}`;
    if (!items?.length) items = stash.get(key);
    if (!items) {
      const r = L.wide ? Math.min(150000, Math.max(L.r, (p.r || 0) * 1000)) : L.r;
      const where = whole ? '(area.a)' : `(around:${r},${c.lat},${c.lng})`;
      const q = `[out:json][timeout:${whole ? 50 : 25}];${whole ? `area["ISO3166-1"="${p.code}"][admin_level=2]->.a;` : ''}(${L.sel.map(x => `nwr${x}["name"]${where};`).join('')});out tags center 900;`;
      const parse = j => {
        const seen = new Set();
        return j.elements.map(e => {
          const g = e.tags, la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; if (la == null) return null;
          const n = g['name:en'] || g.name, dk = n.toLowerCase() + la.toFixed(3); if (seen.has(dk)) return null; seen.add(dk);
          const ig = (g['contact:instagram'] || g.instagram || '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^@|\/.*$/g, '');
          const web = g.website || g['contact:website'];
          const sub = g.cuisine ? g.cuisine.split(';').slice(0, 3).join(', ')
            : f === 'dive' ? (g.amenity === 'dive_centre' || g.shop ? 'Dive centre' : 'Dive site')
            : f === 'cafe' || f === 'restaurant' ? '' : (g.tourism || g.amenity || g.shop || '');
          const o = { id: e.type[0] + e.id, n, k: f, lat: la, lng: lo,
            cu: sub.replace(/_/g, ' ').replace(/^./, ch => ch.toUpperCase()), web: /^https?:\/\//.test(web || '') ? web : '', ig: /^[\w.]+$/.test(ig) ? ig : '',
            hrs: (g.opening_hours || '').slice(0, 80), addr: [g['addr:housenumber'], g['addr:street']].filter(Boolean).join(' ') };
          o.s = (o.web ? 2 : 0) + (o.ig ? 3 : 0) + (g.cuisine ? 1 : 0) + (o.hrs ? 1 : 0) + (g.wikidata ? 3 : 0) + (g.stars ? 1 : 0);
          return o;
        }).filter(Boolean).sort((x, y) => y.s - x.s).slice(0, whole ? 300 : 150);
      };
      const post = { method: 'POST', body: 'data=' + enc(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
      // ask every OpenStreetMap server at once and keep the first answer; if none answers, fall back to Photon
      try { items = await Promise.any(OVERPASS.map(url => getJSON(url, { ...post, signal: AbortSignal.timeout(whole ? 12000 : 8000) }).then(parse))); }
      catch { items = await photon(p, f, c, r).catch(() => null); }
      if (items) stash.set(key, items);
    }
    if (token !== loadToken) return;
    if (!items) view.liveState[f] = 'error';
    else { items.forEach(x => { x.km = km(c, x); }); view.live[f] = items; view.liveState[f] = ''; }
    renderSpots();
  }

  /* ---------------- Photos (4K with credits), videos, reviews ---------------- */
  const stripTags = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent.trim().replace(/\s+/g, ' ').slice(0, 120); };
  let lbToken = 0;
  async function openLightbox({ file, url, title, credit }) {
    const img = $('#lightbox-img'), cap = $('#lightbox-cap'), cr = $('#lightbox-credit'), token = ++lbToken;
    img.alt = title || ''; cap.textContent = title || ''; cr.innerHTML = credit || '';
    $('#lightbox').showModal();
    if (!file) { img.src = url; return; }
    img.src = cimg(file, 1280);
    const big = new Image();           // swap to the 4K version as soon as it has loaded
    big.onload = () => { if (token === lbToken) img.src = big.src; };
    big.src = cimg(file, 3840);
    cr.textContent = 'Loading photo credit';
    try {
      const j = await getJSON(`${COMMONS}&titles=${enc('File:' + file)}&prop=imageinfo&iiprop=extmetadata|size|url&iiextmetadatafilter=Artist|LicenseShortName`);
      const ii = Object.values(j.query.pages)[0].imageinfo?.[0]; if (token !== lbToken) return;
      const who = stripTags(ii?.extmetadata?.Artist?.value) || 'Wikimedia Commons contributor';
      const lic = ii?.extmetadata?.LicenseShortName?.value || 'free licence';
      const w = ii?.width, h = ii?.height;
      const shown = w ? (w >= 3840 ? `4K view of a ${w} x ${h} original` : `Full original, ${w} x ${h}`) : '';
      cr.innerHTML = `Photo: ${esc(who)}, ${esc(lic)}, via <a href="${esc(ii?.descriptionurl || '#')}" target="_blank" rel="noopener">Wikimedia Commons</a>. ${shown}. <a href="${esc(ii?.url || cimg(file, 3840))}" target="_blank" rel="noopener">Open full size</a>`;
    } catch { if (token === lbToken) cr.innerHTML = `Photo from <a href="https://commons.wikimedia.org/wiki/File:${enc(file)}" target="_blank" rel="noopener">Wikimedia Commons</a>`; }
  }
  $('.place-cover').addEventListener('click', () => { const f = $('#place-img').dataset.file; if (f) openLightbox({ file: f, title: current?.name }); });

  async function loadPhotos(p, token) {
    const box = $('#place-photos'); box.innerHTML = skeleton(4, 'block');
    $$('#place-photos ~ *').forEach(n => n.remove());
    let items = [];
    try {
      if (p.around || !p.wiki) throw 0;
      const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/media-list/${enc(p.wiki.replace(/ /g, '_'))}`);
      items = j.items.filter(i => i.type === 'image' && /\.jpe?g$/i.test(i.title) && !/map|flag|locator|coat|logo|seal|portrait|diagram/i.test(i.title))
        .slice(0, 16).map(i => ({ file: i.title.replace(/^File:/, '').replace(/_/g, ' ') }));
    } catch { /* fall through to spot photos */ }
    if (token !== loadToken) return;
    const seen = new Set(items.map(i => i.file));
    (view.spots || []).slice(0, 24).forEach(s => { if (!seen.has(s.img)) { seen.add(s.img); items.push({ file: s.img, title: s.n }); } });
    items = items.slice(0, 30);
    box.items = items;
    box.innerHTML = items.length
      ? items.map((i, n) => { const t = i.title || i.file.replace(/\.\w+$/, ''); return `<button type="button" data-n="${n}" aria-label="Open photo in 4K: ${esc(t)}"><img src="${cimg(i.file, 500)}" alt="${esc(t)}" loading="lazy"></button>`; }).join('')
      : emptyState('ph-image', 'No free photos found for this place.');
    box.insertAdjacentHTML('afterend', `${items.length ? '<p class="note">Tap any photo for the 4K view with photographer and licence. Photos from Wikimedia Commons.</p>' : ''}
      <h3>From photographers on Flickr</h3><div class="flickr-grid" id="flickr">${skeleton(2, 'block')}</div>`);
    loadFlickr(p, token);
  }
  $('#place-photos').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const i = $('#place-photos').items[+b.dataset.n];
    openLightbox({ file: i.file, title: i.title || i.file.replace(/\.\w+$/, '') });
  });

  /* Flickr photos through Openverse: only licences that allow reuse, each shown with its photographer credit. */
  async function loadFlickr(p, token) {
    const box = $('#flickr'); if (!box) return;
    let res = [];
    try {
      const q = p.around ? 'travel' : p.kind === 'region' ? `${p.name} ${p.country}` : p.name;
      const j = await getJSON(`https://api.openverse.org/v1/images/?q=${enc(q)}&source=flickr&license_type=commercial&page_size=14&mature=false`);
      res = (j.results || []).filter(r => r.url && r.creator);
    } catch { /* empty state below */ }
    if (token !== loadToken || !box.isConnected) return;
    box.items = res;
    const credit = r => `Photo by <a href="${esc(r.creator_url || r.foreign_landing_url)}" target="_blank" rel="noopener">${esc(r.creator)}</a> on <a href="${esc(r.foreign_landing_url)}" target="_blank" rel="noopener">Flickr</a>, CC ${esc((r.license || '').toUpperCase())} ${esc(r.license_version || '')}`;
    box.innerHTML = res.length
      ? res.map((r, n) => `<figure><button type="button" data-n="${n}" aria-label="Open photo: ${esc(r.title || 'Flickr photo')}"><img src="${esc(r.thumbnail || r.url)}" alt="${esc(r.title || '')}" loading="lazy"></button><figcaption class="photo-credit">${credit(r)}</figcaption></figure>`).join('')
      : '<p class="note">No reusable Flickr photos found for this place.</p>';
    box.onclick = e => { const b = e.target.closest('button'); if (!b) return; const r = res[+b.dataset.n]; openLightbox({ url: r.url, title: r.title, credit: credit(r) }); };
  }

  async function loadVideos(p, token) {
    const box = $('#place-videos'); box.innerHTML = skeleton(2, 'block');
    const name = p.around ? '' : p.name;
    const yt = `https://www.youtube.com/results?search_query=${enc((name || 'travel') + ' travel guide 4k')}`;
    const run = async q => {
      const j = await getJSON(`${COMMONS}&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${enc(q)}&prop=videoinfo&viprop=url|mime|size|derivatives&viurlwidth=640`);
      return Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index).map(x => {
        const v = x.videoinfo?.[0]; if (!v || !/^video\//.test(v.mime || '')) return null;
        const ders = (v.derivatives || []).filter(d => /webm|mp4/.test(d.type || '') && d.height);
        const best = ders.filter(d => d.height <= 2160).sort((a, b) => b.height - a.height)[0];
        const src = best?.src || (v.size < 120e6 ? v.url : null); if (!src) return null;
        return { src, poster: v.thumburl, q: best?.height, title: x.title.replace(/^File:|\.\w+$/g, ''), page: v.descriptionurl };
      }).filter(Boolean);
    };
    let vids = [];
    try {
      if (name) {
        vids = await run(`filetype:video "${name}" (city OR street OR walk OR tour OR travel OR timelapse OR aerial OR drone OR view OR market OR temple OR beach)`);
        if (vids.length < 2) vids = vids.concat((await run(`filetype:video intitle:"${name}"`)).filter(v => !vids.some(o => o.src === v.src)));
      }
    } catch { /* empty state below */ }
    if (token !== loadToken) return;
    const more = `<a class="btn btn-ghost btn-wide" href="${yt}" target="_blank" rel="noopener"><i class="ph ph-youtube-logo"></i><span>More 4K videos on YouTube</span></a>`;
    box.innerHTML = vids.length
      ? vids.slice(0, 6).map(v => `<article class="video">
          <button class="video-frame" type="button" data-src="${esc(v.src)}" aria-label="Play video: ${esc(v.title)}">
            ${v.poster ? `<img src="${esc(v.poster)}" alt="" loading="lazy">` : ''}<span class="play"><i class="ph ph-play"></i></span>
          </button>
          <p>${esc(v.title)}${v.q ? `, ${v.q}p` : ''} <a href="${esc(v.page)}" target="_blank" rel="noopener">Source and credit</a></p>
        </article>`).join('') + more + '<p class="note">Clips are free-licence uploads on Wikimedia Commons, played at the best quality each one offers.</p>'
      : emptyState('ph-film-strip', 'No free-licence clips found for this place.') + more;
  }
  $('#place-videos').addEventListener('click', e => {
    const f = e.target.closest('.video-frame'); if (!f) return;
    const v = document.createElement('video');
    v.src = f.dataset.src; v.controls = true; v.autoplay = true; v.playsInline = true; v.className = 'video-frame';
    f.replaceWith(v);
  });

  async function renderReviews(p, token) {
    const box = $('#place-reviews');
    const q = p.around ? `${p.lat.toFixed(4)},${p.lng.toFixed(4)}` : `${p.name}${p.country && p.kind !== 'country' ? ' ' + p.country : ''}`;
    const n = p.around ? 'near me' : p.name;
    const tag = (p.around ? 'travel' : p.name).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
    const card = (href, icon, title, sub) => `<a class="link-card" href="${esc(href)}" target="_blank" rel="noopener"><i class="ph ${icon}"></i><div><strong>${title}</strong><small>${sub}</small></div></a>`;
    box.innerHTML = `
      <div id="voy">${skeleton(3)}</div>
      <h3>Reviews and ratings</h3>
      <div class="links">
        ${card(`https://www.google.com/maps/search/?api=1&query=${enc('things to do in ' + q)}`, 'ph-google-logo', 'Google Maps', 'Ratings, photos, hours')}
        ${card(`https://www.tripadvisor.com/Search?q=${enc(q)}`, 'ph-star', 'Tripadvisor', 'Traveller reviews')}
        ${card(`https://www.google.com/maps/search/?api=1&query=${enc('best cafes in ' + q)}`, 'ph-coffee', 'Cafes', 'Top rated coffee')}
        ${card(`https://www.google.com/maps/search/?api=1&query=${enc('best restaurants in ' + q)}`, 'ph-fork-knife', 'Where to eat', 'Top rated food')}
        ${card(`https://www.google.com/maps/search/?api=1&query=${enc('hotels in ' + q)}`, 'ph-bed', 'Where to stay', 'Hotels with reviews')}
        ${card(`https://www.reddit.com/search/?q=${enc(n + ' travel tips')}`, 'ph-reddit-logo', 'Reddit', 'Honest trip reports')}
      </div>
      <h3>See it on social</h3>
      <div class="links">
        ${card(`https://www.instagram.com/explore/tags/${enc(tag)}/`, 'ph-instagram-logo', 'Instagram', '#' + esc(tag))}
        ${card(`https://www.tiktok.com/search?q=${enc(n + ' travel')}`, 'ph-tiktok-logo', 'TikTok', 'Short travel clips')}
        ${card(`https://www.youtube.com/results?search_query=${enc(n + ' travel vlog 4k')}`, 'ph-youtube-logo', 'YouTube', 'Vlogs and guides')}
        ${card(`https://www.pinterest.com/search/pins/?q=${enc(n + ' travel')}`, 'ph-pinterest-logo', 'Pinterest', 'Photo ideas')}
      </div>
      <p class="note">These open live results on each platform in a new tab, so you always see current reviews and posts.</p>`;
    const voy = $('#voy');
    try {
      if (p.around) throw 0;
      const j = await getJSON(`https://en.wikivoyage.org/w/api.php?format=json&origin=*&action=query&redirects=1&prop=extracts&exintro=1&explaintext=1&titles=${enc(p.voy || p.name)}`);
      const page = Object.values(j.query.pages)[0];
      if (token !== loadToken) return;
      if (!page.extract || page.extract.length < 60) throw 0;
      voy.innerHTML = `<h3 style="margin-top:0">Traveller notes</h3><p class="blurb">${esc(page.extract.slice(0, 620))}${page.extract.length > 620 ? '...' : ''}</p>
        <p class="note">From the community guide on <a href="https://en.wikivoyage.org/wiki/${enc(page.title)}" target="_blank" rel="noopener">Wikivoyage</a>, CC BY-SA.</p>`;
    } catch { if (token === loadToken) voy.innerHTML = ''; }
  }

  /* ---------------- Trip planner ---------------- */
  const addStop = (p, { quiet } = {}) => {
    if (p.around) return toast('Search for a city to add it as a stop.');
    if (stopIndex(p.id) > -1) return;
    const meta = p.kind === 'country' ? { kind: 'country', code: p.code } : p.kind === 'region' ? { kind: 'region', code: p.code, qid: p.qid, r: p.r, clat: p.clat, clng: p.clng, cap: p.cap, img: p.img } : null;
    trip.stops.push({ id: p.id, name: p.name, country: p.kind === 'country' ? '' : (p.country || ''), lat: p.lat, lng: p.lng, days: 3, places: [], notes: '', ...(meta && { meta }) });
    saveTrip(); renderTrip(); refreshGlobe(); updateAddButton();
    if (!quiet) toast(`${p.name} added as stop ${trip.stops.length}`);
  };
  const placeFromStop = s => {
    if (byId.has(s.id)) return byId.get(s.id);
    if (s.meta?.kind === 'country') return countryPlace(s.meta.code);
    if (s.meta?.kind === 'region') return { id: s.id, kind: 'region', name: s.name, country: s.country, lat: s.lat, lng: s.lng, alt: Math.max(0.1, Math.min(1.2, (s.meta.r || 70) / 190)), ...s.meta };
    return extras.get(s.id) || { id: s.id, kind: 'custom', name: s.name, country: s.country, lat: s.lat, lng: s.lng };
  };

  const fmtDate = d => d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  function renderTrip() {
    const n = trip.stops.length, days = trip.stops.reduce((a, s) => a + s.days, 0);
    let dist = 0; for (let i = 1; i < n; i++) dist += km(trip.stops[i - 1], trip.stops[i]);
    const badge = $('#trip-count'); badge.hidden = !n; badge.textContent = n;
    $('#trip-actions').hidden = !n; $('#trip-stats').hidden = !n;
    $('#trip-stats').innerHTML = `<div><dt>Stops</dt><dd>${n}</dd></div><div><dt>Days</dt><dd>${days}</dd></div><div><dt>Distance</dt><dd>${dist ? fmtKm(dist) : '0 km'}</dd></div>`;
    const list = $('#trip-stops');
    if (!n) {
      list.innerHTML = `<li>${emptyState('ph-map-pin-plus', 'Your route is empty. Open any country, region or city and press Add to my trip.', '<button class="btn btn-accent" type="button" data-act="browse"><i class="ph ph-compass"></i><span>Pick a first stop</span></button>')}</li>`;
      return;
    }
    let cursor = trip.start ? new Date(trip.start + 'T12:00:00') : null;
    list.innerHTML = trip.stops.map((s, i) => {
      let when = '';
      if (cursor) { const from = new Date(cursor); cursor.setDate(cursor.getDate() + s.days); when = `${fmtDate(from)} to ${fmtDate(cursor)}`; }
      const leg = i ? `<li class="leg">${fmtKm(km(trip.stops[i - 1], s))} from ${esc(trip.stops[i - 1].name)}</li>` : '';
      return `${leg}<li class="stop" data-i="${i}">
        <div class="stop-top">
          <span class="stop-num">${i + 1}</span>
          <button class="stop-name" type="button" data-act="open">${esc(s.name)}</button>
          <span class="stop-tools">
            <button type="button" data-act="up" aria-label="Move ${esc(s.name)} earlier" ${i ? '' : 'disabled'}><i class="ph ph-arrow-up"></i></button>
            <button type="button" data-act="down" aria-label="Move ${esc(s.name)} later" ${i < n - 1 ? '' : 'disabled'}><i class="ph ph-arrow-down"></i></button>
            <button type="button" data-act="remove" aria-label="Remove ${esc(s.name)}"><i class="ph ph-trash"></i></button>
          </span>
        </div>
        <p class="stop-meta">${esc([s.country, when].filter(Boolean).join(' | '))}</p>
        <div class="stop-row"><span>Length of stay</span>
          <span class="stepper"><button type="button" data-act="less" aria-label="One day less"><i class="ph ph-minus"></i></button><b>${s.days} ${s.days === 1 ? 'day' : 'days'}</b><button type="button" data-act="more" aria-label="One day more"><i class="ph ph-plus"></i></button></span>
        </div>
        ${s.places.length ? `<div class="stop-places">${s.places.map((t, k) => `<span class="tag">${esc(t)}<button type="button" data-act="unplace" data-k="${k}" aria-label="Remove ${esc(t)}"><i class="ph ph-x"></i></button></span>`).join('')}</div>` : ''}
        <label class="sr-only" for="note-${i}">Notes for ${esc(s.name)}</label>
        <textarea id="note-${i}" rows="${Math.min(9, (s.notes.match(/\n/g) || []).length + 1)}" placeholder="Notes: hotel, tickets, food to try">${esc(s.notes)}</textarea>
      </li>`;
    }).join('');
  }

  const afterTripChange = () => {
    saveTrip(); renderTrip(); refreshGlobe(); updateAddButton();
    if (current) { if (!$('#sights-wrap').hidden) loadSights(current, loadToken); if (view.spots) renderSpots(); }
  };
  $('#trip-stops').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'browse') return openBrowse();
    const i = +b.closest('.stop').dataset.i, s = trip.stops[i];
    switch (b.dataset.act) {
      case 'open': { const p = placeFromStop(s); return p && openPlace(p); }
      case 'up': trip.stops.splice(i - 1, 0, trip.stops.splice(i, 1)[0]); break;
      case 'down': trip.stops.splice(i + 1, 0, trip.stops.splice(i, 1)[0]); break;
      case 'remove': trip.stops.splice(i, 1); break;
      case 'less': s.days = Math.max(1, s.days - 1); break;
      case 'more': s.days = Math.min(60, s.days + 1); break;
      case 'unplace': s.places.splice(+b.dataset.k, 1); break;
    }
    afterTripChange();
  });
  $('#trip-stops').addEventListener('input', e => {
    if (e.target.tagName !== 'TEXTAREA') return;
    trip.stops[+e.target.closest('.stop').dataset.i].notes = e.target.value; saveTrip();
  });
  $('#trip-name').value = trip.name; $('#trip-start').value = trip.start;
  $('#trip-name').addEventListener('input', e => { trip.name = e.target.value; saveTrip(); });
  $('#trip-start').addEventListener('input', e => { trip.start = e.target.value; saveTrip(); renderTrip(); });

  const tripText = () => {
    let cursor = trip.start ? new Date(trip.start + 'T12:00:00') : null;
    const lines = [trip.name || 'My trip', ''];
    trip.stops.forEach((s, i) => {
      let when = '';
      if (cursor) { const f = new Date(cursor); cursor.setDate(cursor.getDate() + s.days); when = ` (${fmtDate(f)} to ${fmtDate(cursor)})`; }
      lines.push(`${i + 1}. ${s.name}${s.country ? ', ' + s.country : ''}: ${s.days} ${s.days === 1 ? 'day' : 'days'}${when}`);
      s.places.forEach(t => lines.push(`   - ${t}`));
      if (s.notes) lines.push(`   Notes: ${s.notes}`);
    });
    return lines.join('\n');
  };
  $('#trip-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(tripText()); toast('Plan copied. Paste it anywhere.'); }
    catch { toast('Copy is blocked in this browser. Use Print instead.'); }
  });
  $('#trip-print').addEventListener('click', () => print());
  $('#trip-clear').addEventListener('click', () => {
    if (!confirm('Remove every stop from this trip?')) return;
    trip.stops = []; afterTripChange();
  });

  const openTrip = () => {
    const open = !$('#trip').classList.contains('is-open');
    setPanel('#trip', open);
    if (open) {
      pauseSpin();
      if (isMobile() && current) setPanel('#place', false);
      if (trip.stops.length > 1 && !current) {
        const lat = trip.stops.reduce((a, s) => a + s.lat, 0) / trip.stops.length;
        globe.pointOfView({ lat, lng: trip.stops[0].lng, altitude: 2 }, reduceMotion ? 0 : 1400);
      }
    } else maybeResume();
  };

  /* ---------------- Destinations sheet ---------------- */
  const POPULAR = [['TH', 'Thailand'], ['AU', 'Australia'], ['JP', 'Japan'], ['IT', 'Italy'], ['FR', 'France'], ['ES', 'Spain'], ['US', 'United States'], ['ID', 'Indonesia'], ['VN', 'Vietnam'], ['NZ', 'New Zealand'], ['GB', 'United Kingdom'], ['KR', 'South Korea']];
  const regions = ['All', ...new Set(CITIES.map(c => c.region))];
  let thumbsLoaded = false;
  const renderBrowse = region => {
    $('#browse-countries').innerHTML = '<span class="lead">Whole countries</span>' + POPULAR.map(([c, n]) => `<button class="chip" type="button" data-code="${c}"><i class="ph ph-flag"></i>${n}</button>`).join('');
    $('#browse-filters').innerHTML = regions.map(r => `<button class="chip" type="button" aria-pressed="${r === region}" data-region="${r}">${r}</button>`).join('');
    $('#browse-grid').innerHTML = CITIES.filter(c => region === 'All' || c.region === region).map(c => `
      <a class="dest" href="?city=${c.id}" data-id="${c.id}">
        <div class="dest-img">${c.thumb ? `<img src="${esc(c.thumb)}" alt="${esc(c.name)}, ${esc(c.country)}" loading="lazy">` : ''}</div>
        <div class="dest-text"><span>${esc(c.country)}</span><strong>${esc(c.name)}</strong><p>${esc(c.line)}</p></div>
      </a>`).join('');
  };
  const loadThumbs = async () => {
    if (thumbsLoaded) return; thumbsLoaded = true;
    try {
      const j = await getJSON(`${WIKI}&redirects=1&prop=pageimages&pithumbsize=640&pilimit=50&titles=${enc(CITIES.map(c => c.img || c.wiki).join('|'))}`);
      const alias = {}; (j.query.redirects || []).concat(j.query.normalized || []).forEach(r => alias[r.from] = r.to);
      const pages = Object.values(j.query.pages);
      CITIES.forEach(c => { const w = c.img || c.wiki, t = alias[w] || w; c.thumb = pages.find(p => p.title === (alias[t] || t))?.thumbnail?.source; });
      renderBrowse($('#browse-filters [aria-pressed=true]')?.dataset.region || 'All');
    } catch { thumbsLoaded = false; }
  };
  const openBrowse = () => { renderBrowse('All'); $('#browse').showModal(); loadThumbs(); };
  $('#browse-filters').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) renderBrowse(b.dataset.region); });
  $('#browse-countries').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { $('#browse').close(); openCountry(b.dataset.code); } });
  $('#browse-grid').addEventListener('click', e => {
    const a = e.target.closest('.dest'); if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); $('#browse').close(); openPlace(byId.get(a.dataset.id));
  });

  /* ---------------- Search (cities, countries, anywhere) ---------------- */
  const input = $('#search-input'), results = $('#search-results');
  let searchTimer, searchSeq = 0, found = [];
  const showResults = pending => {
    results.hidden = false; input.setAttribute('aria-expanded', 'true');
    results.innerHTML = found.length
      ? found.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === 0}"><span>${esc(r.name)}</span><small>${esc(r.kind === 'country' ? 'Country' : [r.admin, r.country].filter(Boolean).join(', '))}</small></li>`).join('')
      : `<li class="empty">${pending ? 'Searching the world' : 'Nothing found. Check the spelling and try again.'}</li>`;
  };
  const hideResults = () => { results.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const pick = i => { const r = found[i]; if (!r) return; hideResults(); input.value = ''; input.blur(); openPlace(r); };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase(); clearTimeout(searchTimer);
    if (q.length < 2) return hideResults();
    const lands = countries.filter(f => f.properties.code && f.properties.name.toLowerCase().startsWith(q)).slice(0, 3).map(f => countryPlace(f.properties.code));
    const local = [...lands, ...CITIES.filter(c => (c.name + ' ' + c.country).toLowerCase().includes(q)).slice(0, 4)];
    found = local; showResults(true);
    const seq = ++searchSeq;
    searchTimer = setTimeout(async () => {
      try {
        const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&name=${enc(q)}`);
        if (seq !== searchSeq) return;
        const remote = (j.results || []).filter(r => /^PPL/.test(r.feature_code || '')).map(r => ({
          id: `x-${r.id}`, kind: 'custom', name: r.name, country: r.country || '', admin: r.admin1 !== r.name ? r.admin1 : '', lat: r.latitude, lng: r.longitude,
        })).filter(r => !local.some(c => c.kind === 'city' && c.name === r.name && km(c, r) < 60));
        found = [...local, ...remote].slice(0, 9); showResults();
      } catch { if (seq === searchSeq) showResults(); }
    }, 260);
  });
  input.addEventListener('keydown', e => {
    const items = $$('li[role=option]', results); if (!items.length) return;
    let i = items.findIndex(li => li.getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((li, k) => li.setAttribute('aria-selected', k === i));
    } else if (e.key === 'Enter') { e.preventDefault(); pick(Math.max(0, i)); }
    else if (e.key === 'Escape') hideResults();
  });
  results.addEventListener('click', e => { const li = e.target.closest('li[role=option]'); if (li) pick(+li.dataset.i); });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) hideResults(); });

  /* ---------------- Wiring ---------------- */
  $('#zoom-in').addEventListener('click', () => zoomBy(0.6));
  $('#zoom-out').addEventListener('click', () => zoomBy(1.6));
  $('#locate').addEventListener('click', locate);
  $('#locate-hero').addEventListener('click', locate);
  $('#surprise').addEventListener('click', () => openPlace(CITIES[Math.floor(Math.random() * CITIES.length)]));
  $('#toggle-night').addEventListener('click', e => {
    const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', on); globe.globeImageUrl(on ? TEX.night : toonTex || TEX.day);
  });
  $('#toggle-tilt').addEventListener('click', () => { if (map) map.easeTo({ pitch: map.getPitch() > 20 ? 0 : 60, duration: 700 }); });
  $('#toggle-style').addEventListener('click', () => {
    if (!map) return;
    mapKind = { toon: 'sat', sat: 'streets', streets: 'toon' }[mapKind]; map.setStyle(buildStyle(mapKind));
    toast(mapKind === 'sat' ? 'Satellite view' : 'Street map view');
  });
  $('#toggle-spin').addEventListener('click', e => { spin = !spin; controls.autoRotate = spin; e.currentTarget.setAttribute('aria-pressed', spin); });
  $('#close-place').addEventListener('click', closePlace);
  $('#open-trip').addEventListener('click', openTrip);
  $('#close-trip').addEventListener('click', openTrip);
  $('#open-browse').addEventListener('click', openBrowse);
  $('#close-browse').addEventListener('click', () => $('#browse').close());
  $('#close-lightbox').addEventListener('click', () => $('#lightbox').close());
  $('#lightbox').addEventListener('close', () => { lbToken++; $('#lightbox-img').removeAttribute('src'); });
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
  $('#place-country').addEventListener('click', () => { if (current?.kind === 'region') openCountry(current.code); });
  $('#add-stop').addEventListener('click', () => {
    if (!current) return;
    if (stopIndex(current.id) > -1) { if (!$('#trip').classList.contains('is-open')) openTrip(); }
    else addStop(current);
  });
  $('.tabs').addEventListener('click', e => { const t = e.target.closest('[role=tab]'); if (t) selectTab(t.dataset.tab); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]') && current && document.activeElement !== input) closePlace();
  });

  /* ---------------- Routing and start ---------------- */
  const route = async () => {
    const q = new URLSearchParams(location.search);
    const city = byId.get(q.get('city'));
    if (city) return openPlace(city, { push: false });
    const code = (q.get('country') || '').toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) {
      await countriesReady;
      const cp = countryPlace(code), rid = q.get('region');
      if (cp && rid) {
        const data = await loadData(`country/${code}.json`), r = data?.regions.find(x => x.id === rid);
        if (r) return openPlace(regionPlace(r, { name: cp.name, code }), { push: false });
      }
      if (cp) return openPlace(cp, { push: false });
    }
    if (q.get('q') && q.get('lat') && q.get('lng')) {
      const lat = +q.get('lat'), lng = +q.get('lng');
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
        return openPlace({ id: `x-${lat.toFixed(3)}-${lng.toFixed(3)}`, kind: 'custom', name: q.get('q').slice(0, 80), country: (q.get('c') || '').slice(0, 80), lat, lng }, { push: false });
    }
    if (current) { current = null; loadToken++; spotMarkers = []; setPanel('#place', false); refreshGlobe(); }
  };
  addEventListener('popstate', route);

  // Structured data for the destination list (helps search engines read the page)
  const ld = document.createElement('script'); ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Travel destinations',
    itemListElement: CITIES.map((c, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'TouristDestination', name: `${c.name}, ${c.country}`, description: c.line, geo: { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lng } } })),
  });
  document.head.append(ld);

  /* ---------------- Recommended plan: a few questions, then a day by day plan with a rough budget ---------------- */
  const waitMs = ms => new Promise(r => setTimeout(r, ms));
  const MOVE = {
    walk: { label: 'Walk and local transport', icon: 'ph-person-simple-walk', range: 12, speed: 16, by: 'on foot and local transport' },
    train: { label: 'Train', icon: 'ph-train', range: 80, speed: 45, by: 'by train' },
    car: { label: 'Hire a car', icon: 'ph-car', range: 170, speed: 50, by: 'by hire car' },
  };
  const LIKE = [['city', 'City life', 'ph-buildings'], ['nature', 'Nature and outdoors', 'ph-tree'], ['mix', 'A mix of both', 'ph-shuffle']];
  const ACTS = [['insta', 'Photo spots', 'ph-camera'], ['culture', 'Culture and history', 'ph-bank'], ['nature', 'Nature', 'ph-tree'], ['fun', 'Fun and theme parks', 'ph-ticket'],
    ['cafe', 'Cafes', 'ph-coffee'], ['restaurant', 'Restaurants', 'ph-fork-knife'], ['bar', 'Bars and nightlife', 'ph-martini'], ['shop', 'Shopping', 'ph-shopping-bag'], ['dive', 'Diving', 'ph-waves']];
  const TIER = [['saver', 'Saver', 'ph-piggy-bank'], ['mid', 'Comfortable', 'ph-wallet'], ['treat', 'Treat yourself', 'ph-sparkle']];
  const LIKE_ACTS = { city: ['insta', 'culture', 'fun', 'cafe', 'restaurant', 'bar', 'shop'], nature: ['insta', 'nature', 'cafe', 'restaurant'], mix: ['insta', 'culture', 'nature', 'fun', 'cafe', 'restaurant'] };
  // rough US dollars: [room per night, food per person per day, activities per person per day, local transport per person per day]
  const COST = {
    $: { saver: [25, 15, 10, 5], mid: [60, 30, 20, 10], treat: [150, 60, 45, 20], car: 35, rail: 12 },
    $$: { saver: [45, 25, 15, 8], mid: [110, 50, 30, 15], treat: [260, 100, 60, 30], car: 55, rail: 22 },
    $$$: { saver: [70, 40, 20, 12], mid: [180, 75, 40, 20], treat: [420, 150, 90, 40], car: 80, rail: 35 },
  };
  const plan = { stay: 'centre', stayText: '', days: 3, people: 2, move: 'walk', like: 'mix', acts: new Set(LIKE_ACTS.mix), tier: 'mid', result: null };
  const money = n => '$' + Math.round(n).toLocaleString('en');
  const chipset = (q, opts, val) => `<div class="chips" data-q="${q}">${opts.map(([k, label, icon]) =>
    `<button class="chip" type="button" data-v="${k}" aria-pressed="${val instanceof Set ? val.has(k) : val === k}"><i class="ph ${icon}"></i>${label}</button>`).join('')}</div>`;

  function renderPlanForm() {
    const p = current; if (!p) return;
    $('#plan-title').textContent = `Plan my trip to ${p.name}`;
    const stays = [['centre', p.kind === 'region' && p.cap ? `In ${p.cap}` : 'In the centre', 'ph-map-pin'], ...(user ? [['me', 'Where I am now', 'ph-navigation-arrow']] : []), ['other', 'Somewhere else', 'ph-bed']];
    $('#plan-body').innerHTML = `
      <section class="q"><h3>1. Where are you staying?</h3>${chipset('stay', stays, plan.stay)}
        <label class="sr-only" for="plan-stay">Area, suburb or street where you stay</label>
        <input class="mini-input" id="plan-stay" type="text" placeholder="Area or suburb, for example Surry Hills" value="${esc(plan.stayText)}" ${plan.stay === 'other' ? '' : 'hidden'}></section>
      <section class="q"><h3>2. How long, and how many people?</h3>
        <div class="plan-steps">
          <span class="stepper" data-step="days"><button type="button" data-d="-1" aria-label="One day less"><i class="ph ph-minus"></i></button><b>${plan.days} ${plan.days === 1 ? 'day' : 'days'}</b><button type="button" data-d="1" aria-label="One day more"><i class="ph ph-plus"></i></button></span>
          <span class="stepper" data-step="people"><button type="button" data-d="-1" aria-label="One person less"><i class="ph ph-minus"></i></button><b>${plan.people} ${plan.people === 1 ? 'person' : 'people'}</b><button type="button" data-d="1" aria-label="One person more"><i class="ph ph-plus"></i></button></span>
        </div></section>
      <section class="q"><h3>3. How will you get around?</h3>${chipset('move', Object.entries(MOVE).map(([k, m]) => [k, m.label, m.icon]), plan.move)}</section>
      <section class="q"><h3>4. What do you like more?</h3>${chipset('like', LIKE, plan.like)}</section>
      <section class="q"><h3>5. Pick everything you want to do</h3>${chipset('acts', ACTS, plan.acts)}</section>
      <section class="q"><h3>6. Your budget</h3>${chipset('tier', TIER, plan.tier)}</section>
      <button class="btn btn-accent btn-wide" type="button" data-act="make"><i class="ph ph-magic-wand"></i><span>Show my recommended plan</span></button>`;
  }

  async function makePlan() {
    const p = current, token = loadToken, body = $('#plan-body');
    if (!p) return;
    plan.stayText = $('#plan-stay')?.value || plan.stayText;
    body.innerHTML = `<p class="note" style="margin:0 0 14px">Building your plan. Looking up places can take a little while.</p>${skeleton(4, 'block')}`;
    for (let i = 0; view.spots === null && i < 130; i++) await waitMs(500);
    if (token !== loadToken || !current) return;
    const notes = [];

    // where the days start and end
    const c0 = centre(p);
    let stay = { lat: c0.lat, lng: c0.lng, label: p.kind === 'region' && p.cap ? p.cap : `${p.name} centre` };
    if (plan.stay === 'me' && user) stay = { lat: user.lat, lng: user.lng, label: 'where you are now' };
    else if (plan.stay === 'other' && plan.stayText.trim()) {
      const t = plan.stayText.trim();
      // suburbs and streets: OpenStreetMap search first, then the city-level geocoder
      const near = list => list.map(r => ({ ...r, d: km(c0, r) })).filter(r => r.d < 150).sort((x, y) => x.d - y.d)[0];
      let hit = null, failed = 0;
      try {
        const j = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${enc(t + ', ' + p.name)}`, { signal: AbortSignal.timeout(8000) });
        hit = near(j.map(r => ({ lat: +r.lat, lng: +r.lon })));
      } catch { failed++; }
      if (!hit) try {
        const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&name=${enc(t)}`, { signal: AbortSignal.timeout(8000) });
        hit = near((j.results || []).map(r => ({ lat: r.latitude, lng: r.longitude })));
      } catch { failed++; }
      if (hit) stay = { lat: hit.lat, lng: hit.lng, label: t };
      else notes.push(failed === 2 ? `"${esc(t)}" could not be looked up, so the plan starts from the centre.` : `"${esc(t)}" was not found near ${esc(p.name)}, so the plan starts from the centre.`);
    }

    // live categories the visitor picked, one after another
    for (const f of [...plan.acts].filter(isFood)) {
      if (p.kind === 'country' && !LIVE[f].wide) continue;
      if (!view.live[f] && view.liveState[f] !== 'loading') await Promise.race([loadPoi(p, f, token), waitMs(24000)]);
      if (!view.live[f]) notes.push(`${LIVE[f].one} places could not be loaded right now, so they are missing from this plan.`);
    }
    if (token !== loadToken) return;

    // choose sights: fame, what the visitor likes, and distance from where they stay
    const M = MOVE[plan.move], per = plan.move === 'walk' ? 4 : 3;
    const want = s => { const t = TYPES[s.t]; return t && ((plan.acts.has('insta') && t.insta) || plan.acts.has(t.cat)); };
    let range = Math.max(M.range, p.kind === 'country' ? 400 : 0), pool = [];
    for (let i = 0; i < 4; i++) {
      pool = (view.spots || []).filter(want).map(s => ({ ...s, d: km(stay, s) })).filter(s => s.d <= range);
      if (pool.length >= plan.days * per) break;
      range *= 2;
    }
    if (range > M.range * 1.5 && p.kind !== 'country') notes.push(`There are few matching places close by, so the plan reaches up to ${Math.round(range)} km out.`);
    const pref = plan.like === 'city' ? ['culture', 'fun'] : plan.like === 'nature' ? ['nature'] : [];
    pool.forEach(s => { s.score = (Math.log2((s.sl || 1) + 1) + (s.wh ? 2 : 0)) * (pref.includes(TYPES[s.t].cat) ? 1.6 : 1) / (1 + s.d / range); });
    pool.sort((a, b) => b.score - a.score);
    const left = new Set(pool.slice(0, plan.days * per)), days = [];
    for (let d = 0; d < plan.days && left.size; d++) {
      const seed = left.values().next().value; left.delete(seed);            // best remaining sight anchors the day
      const mates = [...left].sort((a, b) => km(seed, a) - km(seed, b)).slice(0, per - 1); mates.forEach(m => left.delete(m));
      const todo = [seed, ...mates], route = []; let cur = stay;
      while (todo.length) { todo.sort((a, b) => km(cur, a) - km(cur, b)); cur = todo.shift(); route.push(cur); }
      days.push({ items: route, extra: [] });
    }

    // food, shopping, nightlife and diving around each day's route
    const used = new Set();
    const nearest = (f, pt, max) => { const x = (view.live[f] || []).filter(v => !used.has(v.id)).sort((a, b) => km(pt, a) - km(pt, b))[0]; if (x && km(pt, x) <= max) { used.add(x.id); return x; } return null; };
    const reach = Math.max(4, range / 5);
    days.forEach((day, i) => {
      const first = day.items[0], mid = day.items[Math.min(1, day.items.length - 1)], last = day.items[day.items.length - 1];
      for (const [f, when, pt, ok] of [['cafe', 'Morning coffee', first, true], ['restaurant', 'Lunch', mid, true], ['shop', 'Shopping stop', last, i % 2 === 0], ['bar', 'Evening drink', stay, true]]) {
        if (!plan.acts.has(f) || !ok) continue;
        const x = nearest(f, pt, reach); if (x) day.extra.push({ when, ...x });
      }
    });
    if (plan.acts.has('dive') && days.length) {
      const x = nearest('dive', stay, Math.max(60, range));
      if (x) days[days.length - 1].extra.unshift({ when: 'Dive trip, half a day', ...x });
      else if (view.live.dive) notes.push('No dive centre was found within reach of where you stay.');
    }
    let totalKm = 0;
    days.forEach(day => {
      let dist = 0, cur = stay; day.items.forEach(s => { dist += km(cur, s); cur = s; }); dist += km(cur, stay);
      day.km = dist; day.hours = dist / M.speed; totalKm += dist;
      const cats = day.items.map(s => TYPES[s.t]?.cat), top = ['nature', 'culture', 'fun'].sort((a, b) => cats.filter(x => x === b).length - cats.filter(x => x === a).length)[0];
      day.theme = { nature: 'Nature day', culture: 'Culture day', fun: 'Fun day' }[top] || 'Highlights';
    });

    // rough budget
    const level = p.budget || '$$', C = COST[level], [room, food, act, local] = C[plan.tier];
    const nights = Math.max(1, plan.days - 1), rooms = Math.ceil(plan.people / 2);
    const rows = [
      [`Stay: ${nights} ${nights === 1 ? 'night' : 'nights'}, ${rooms} ${rooms === 1 ? 'room' : 'rooms'}`, nights * rooms * room],
      ['Food and drinks', plan.days * plan.people * food],
      ['Tickets and activities', plan.days * plan.people * act],
      plan.move === 'car' ? [`Car hire and fuel, about ${Math.round(totalKm)} km`, plan.days * C.car + totalKm * 0.12]
        : plan.move === 'train' ? ['Train and local transport', plan.days * plan.people * (C.rail + local)] : ['Local transport', plan.days * plan.people * local],
    ];
    if (!p.budget) notes.push('Prices for this place are not rated yet, so the budget uses mid-range world prices.');
    plan.result = { id: p.id, stay, days, rows, total: rows.reduce((a, r) => a + r[1], 0), notes };
    renderPlanResult();
  }

  function renderPlanResult() {
    const r = plan.result, p = current, M = MOVE[plan.move];
    if (!r || !p) return;
    if (!r.days.length) {
      $('#plan-body').innerHTML = emptyState('ph-binoculars', 'No places matched your choices here. Pick more activities or a wider way to get around.', '<button class="btn btn-ghost" type="button" data-act="back">Change my answers</button>');
      return;
    }
    const row = (s, when, icon) => `<li class="plan-item"><label><input type="checkbox" checked data-n="${esc(s.n)}"><span class="sr-only">Keep ${esc(s.n)} in the plan</span></label>
      ${s.img ? `<img src="${cimg(s.img, 160)}" alt="" loading="lazy">` : `<span class="plan-ico"><i class="ph ${icon}"></i></span>`}
      <div><small>${esc(when)}</small><button type="button" class="plan-name" data-show="${esc(s.id)}">${esc(s.n)}</button></div></li>`;
    $('#plan-body').innerHTML = `
      <p class="plan-sum">${plan.days} ${plan.days === 1 ? 'day' : 'days'} for ${plan.people} ${plan.people === 1 ? 'person' : 'people'}, staying at ${esc(r.stay.label)}, getting around ${M.by}.</p>
      ${r.notes.map(n => `<p class="note" style="margin-top:6px">${n}</p>`).join('')}
      <div class="plan-days">${r.days.map((d, i) => `<article class="plan-day">
        <header><h3>Day ${i + 1}</h3><span>${d.theme}. About ${fmtKm(d.km)} of travel, ${d.hours < 1 ? Math.max(5, Math.round(d.hours * 60 / 5) * 5) + ' min' : d.hours.toFixed(1) + ' h'} on the move</span></header>
        <ul>${[
          ...d.extra.filter(x => /coffee|Dive/.test(x.when)).map(x => row(x, x.when, LIVE[x.k].icon)),
          ...d.items.slice(0, 2).map(s => row(s, TYPES[s.t]?.label || 'Attraction')),
          ...d.extra.filter(x => /Lunch/.test(x.when)).map(x => row(x, x.when, LIVE[x.k].icon)),
          ...d.items.slice(2).map(s => row(s, TYPES[s.t]?.label || 'Attraction')),
          ...d.extra.filter(x => /Shopping|Evening/.test(x.when)).map(x => row(x, x.when, LIVE[x.k].icon)),
        ].join('')}</ul></article>`).join('')}</div>
      <section class="plan-budget"><h3>Rough budget</h3>
        <dl>${r.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${money(v)}</dd></div>`).join('')}
          <div class="total"><dt>Total for ${plan.people} ${plan.people === 1 ? 'person' : 'people'}</dt><dd>${money(r.total)}</dd></div></dl>
        <p class="note">A rough guide in US dollars based on typical prices for this kind of place. Flights are not included, and these are not live prices.</p></section>
      <div class="plan-actions">
        <button class="btn btn-ghost" type="button" data-act="back"><i class="ph ph-arrow-left"></i><span>Change my answers</span></button>
        <button class="btn btn-ghost" type="button" data-act="photo"><i class="ph ph-image"></i><span>Trip photo</span></button>
        <button class="btn btn-accent" type="button" data-act="save"><i class="ph ph-check-circle"></i><span>Save and make trip photo</span></button>
      </div>
      <p class="note">Untick anything you do not want before saving. Tap a name to see it on the map.</p>`;
    $('#plan').scrollTop = 0;
  }

  function savePlan() {
    const r = plan.result, p = current; if (!r || !p) return;
    if (stopIndex(p.id) < 0) addStop(p, { quiet: true });
    const s = trip.stops[stopIndex(p.id)]; if (!s) return;
    const kept = new Set([...$$('#plan-body input[type=checkbox]:checked')].map(i => i.dataset.n));
    const dayText = r.days.map((d, i) => { const names = [...d.items, ...d.extra].map(x => x.n).filter(n => kept.has(n)); return names.length ? `Day ${i + 1}: ${names.join(', ')}.` : ''; }).filter(Boolean);
    s.days = plan.days;
    s.places = [...new Set([...s.places, ...kept])];
    s.notes = [`Stay: ${r.stay.label}. Getting around ${MOVE[plan.move].by}.`, ...dayText, `Rough budget for ${plan.people}: ${money(r.total)}.`].join('\n');
    afterTripChange();
    $('#plan').close(); openTrip();
    toast(`Plan for ${p.name} saved to your trip`);
    showPoster(p, r, kept);
  }

  $('#plan-open').addEventListener('click', () => {
    if (!current) return;
    if (current.around) return toast('Search for a city first, then plan it.');
    const st = trip.stops[stopIndex(current.id)]; if (st) plan.days = st.days;
    if (plan.result?.id === current.id) renderPlanResult(); else renderPlanForm();
    $('#plan').showModal();
  });
  $('#close-plan').addEventListener('click', () => $('#plan').close());
  $('#plan-body').addEventListener('click', e => {
    const chip = e.target.closest('.chip'), step = e.target.closest('.stepper button'), act = e.target.closest('[data-act]')?.dataset.act, show = e.target.closest('[data-show]');
    if (chip) {
      const q = chip.parentElement.dataset.q, v = chip.dataset.v;
      plan.stayText = $('#plan-stay')?.value ?? plan.stayText;
      if (q === 'acts') plan.acts.has(v) ? plan.acts.delete(v) : plan.acts.add(v);
      else { plan[q] = v; if (q === 'like') plan.acts = new Set(LIKE_ACTS[v]); }
      renderPlanForm();
      if (q === 'stay' && v === 'other') $('#plan-stay').focus();
    } else if (step) {
      const k = step.parentElement.dataset.step;
      plan.stayText = $('#plan-stay')?.value ?? plan.stayText;
      plan[k] = Math.max(1, Math.min(k === 'days' ? 14 : 8, plan[k] + +step.dataset.d));
      renderPlanForm();
    } else if (act === 'make') {
      if (!plan.acts.size) return toast('Pick at least one thing you want to do.');
      makePlan();
    } else if (act === 'back') { plan.result = null; renderPlanForm(); }
    else if (act === 'save') savePlan();
    else if (act === 'photo') showPoster(current, plan.result, new Set([...$$('#plan-body input[type=checkbox]:checked')].map(i => i.dataset.n)));
    else if (show) { $('#plan').close(); focusSpot(show.dataset.show, true); }
  });

  /* ---------------- Trip photo: a shareable picture of the finished plan ---------------- */
  let posterUrl = '', posterBlob = null;
  const loadImg = u => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = u; });
  const coverDraw = (x, im, dx, dy, dw, dh, r) => {
    x.save(); x.beginPath(); x.roundRect(dx, dy, dw, dh, r); x.clip();
    if (im) { const k = Math.max(dw / im.width, dh / im.height), w = im.width * k, h = im.height * k; x.drawImage(im, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h); }
    else { x.fillStyle = '#1c2832'; x.fillRect(dx, dy, dw, dh); }
    x.restore();
  };
  const wrapText = (x, text, px, py, maxW, lh, maxLines) => {
    const words = String(text).split(/\s+/); let line = '', n = 0;
    for (let i = 0; i < words.length; i++) {
      const t = line ? line + ' ' + words[i] : words[i];
      if (x.measureText(t).width > maxW && line) {
        if (++n === maxLines) { while (x.measureText(line + '...').width > maxW && line.length > 3) line = line.slice(0, -1); x.fillText(line + '...', px, py); return n; }
        x.fillText(line, px, py); py += lh; line = words[i];
      } else line = t;
    }
    if (line) { x.fillText(line, px, py); n++; }
    return n;
  };

  async function drawPoster(p, r, kept, withImages) {
    const days = r.days.map((d, i) => ({ n: i + 1, theme: d.theme, sights: d.items.filter(s => kept.has(s.n)), extra: d.extra.filter(v => kept.has(v.n)) })).filter(d => d.sights.length || d.extra.length);
    const files = [...new Set(days.flatMap(d => d.sights.map(s => s.img)).filter(Boolean))].slice(0, 50), pics = {};
    if (withImages && files.length) {
      try {   // direct image addresses, which allow drawing onto a canvas
        const j = await getJSON(`${COMMONS}&prop=imageinfo&iiprop=url&iiurlwidth=640&titles=${enc(files.map(f => 'File:' + f).join('|'))}`, { signal: AbortSignal.timeout(12000) });
        const back = Object.fromEntries((j.query.normalized || []).map(n => [n.to, n.from]));
        const urls = {};
        for (const pg of Object.values(j.query.pages || {})) { const u = pg.imageinfo?.[0]?.thumburl; if (u) urls[(back[pg.title] || pg.title).replace(/^File:/, '')] = u; }
        await Promise.all(files.map(async f => { if (urls[f]) pics[f] = await loadImg(urls[f]); }));
      } catch { /* drawn without photos */ }
    }
    await document.fonts?.ready;
    const W = 1080, P = 56, G = 16, T = (W - 2 * P - 3 * G) / 4, HEAD = 540;
    const dayH = d => 76 + (d.sights.length ? T + 70 : 0) + (d.extra.length ? 44 : 0) + 30;
    const H = HEAD + 40 + days.reduce((a, d) => a + dayH(d), 0) + 190 + 90;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), D = "'Bricolage Grotesque', system-ui, sans-serif", B = "'Geist', system-ui, sans-serif";
    x.fillStyle = '#0b1116'; x.fillRect(0, 0, W, H);

    // header with the first photo of the trip
    const hero = pics[days.find(d => d.sights[0]?.img)?.sights[0].img] || null;
    coverDraw(x, hero, 0, 0, W, HEAD, 0);
    const g = x.createLinearGradient(0, 120, 0, HEAD); g.addColorStop(0, 'rgba(11,17,22,0)'); g.addColorStop(1, 'rgba(11,17,22,.96)');
    x.fillStyle = g; x.fillRect(0, 0, W, HEAD);
    x.fillStyle = ACCENT; x.font = `600 28px ${B}`; x.fillText('MY TRIP PLAN', P, HEAD - 150);
    x.fillStyle = '#ffffff'; x.font = `700 92px ${D}`; wrapText(x, p.name, P, HEAD - 62, W - 2 * P, 92, 1);
    x.fillStyle = '#d5dde1'; x.font = `500 30px ${B}`;
    x.fillText(`${plan.days} ${plan.days === 1 ? 'day' : 'days'}  |  ${plan.people} ${plan.people === 1 ? 'person' : 'people'}  |  ${MOVE[plan.move].by}`, P, HEAD - 14);

    let y = HEAD + 40;
    for (const d of days) {
      x.fillStyle = ACCENT; x.font = `700 40px ${D}`; x.fillText(`Day ${d.n}`, P, y + 40);
      const dw = x.measureText(`Day ${d.n}`).width;
      x.fillStyle = '#a3b0b5'; x.font = `500 26px ${B}`; x.fillText(d.theme, P + dw + 18, y + 38);
      y += 76;
      if (d.sights.length) {
        d.sights.slice(0, 4).forEach((s, i) => {
          const tx = P + i * (T + G);
          coverDraw(x, pics[s.img] || null, tx, y, T, T, 22);
          x.fillStyle = '#ffffff'; x.font = `600 23px ${B}`; wrapText(x, s.n, tx, y + T + 30, T - 4, 27, 2);
        });
        y += T + 70;
      }
      if (d.extra.length) {
        x.fillStyle = '#d5dde1'; x.font = `400 24px ${B}`;
        wrapText(x, d.extra.map(v => `${v.when.split(',')[0]}: ${v.n}`).join('   |   '), P, y + 22, W - 2 * P, 28, 1);
        y += 44;
      }
      x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(P, y + 8, W - 2 * P, 2);
      y += 30;
    }

    // budget
    x.fillStyle = 'rgba(255,255,255,.06)'; x.beginPath(); x.roundRect(P, y + 10, W - 2 * P, 150, 24); x.fill();
    x.fillStyle = '#a3b0b5'; x.font = `500 26px ${B}`; x.fillText(`Rough budget for ${plan.people} ${plan.people === 1 ? 'person' : 'people'}, flights not included`, P + 30, y + 62);
    x.fillStyle = '#ffffff'; x.font = `700 60px ${D}`; x.fillText(money(r.total), P + 30, y + 130);
    x.fillStyle = '#a3b0b5'; x.font = `400 24px ${B}`; x.textAlign = 'right';
    x.fillText(`Staying at ${r.stay.label}`.slice(0, 44), W - P - 30, y + 126); x.textAlign = 'left';
    y += 190;
    x.fillStyle = '#7d8a90'; x.font = `400 22px ${B}`;
    x.fillText('Made with Meridian. Photos from Wikimedia Commons contributors.', P, y + 34);
    return new Promise((res, rej) => { try { cv.toBlob(b => b ? res(b) : rej(new Error('empty')), 'image/jpeg', 0.92); } catch (e) { rej(e); } });
  }

  async function showPoster(p, r, kept) {
    const box = $('#poster-box'), save = $('#poster-save'), share = $('#poster-share');
    box.innerHTML = `<p class="note" style="margin:0 0 12px">Drawing your trip photo.</p>${skeleton(1, 'block')}`;
    save.hidden = true; share.hidden = true;
    $('#poster').showModal();
    let blob = null;
    try { blob = await drawPoster(p, r, kept, true); }
    catch { try { blob = await drawPoster(p, r, kept, false); } catch { /* handled below */ } }
    if (!blob) { box.innerHTML = emptyState('ph-image-broken', 'The trip photo could not be drawn in this browser.'); return; }
    if (posterUrl) URL.revokeObjectURL(posterUrl);
    posterBlob = blob; posterUrl = URL.createObjectURL(blob);
    const name = `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-trip-plan.jpg`;
    box.innerHTML = `<img src="${posterUrl}" alt="Trip plan picture for ${esc(p.name)} with each day and its places">`;
    save.href = posterUrl; save.download = name; save.hidden = false;
    const file = new File([blob], name, { type: 'image/jpeg' });
    share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    share.onclick = () => navigator.share({ files: [file], title: `${p.name} trip plan` }).catch(() => {});
  }
  $('#close-poster').addEventListener('click', () => $('#poster').close());

  /* Small bridge for js/community.js */
  window.Meridian = {
    toast,
    current: () => current,
    getTrip: () => structuredClone(trip),
    setTrip: t => {
      trip = { name: t.name || '', start: '', stops: t.stops };
      $('#trip-name').value = trip.name; $('#trip-start').value = '';
      afterTripChange(); openTrip();
    },
    show: (lat, lng) => enterMap(lat, lng, 16.2, 58),
    mapCentre: () => { if (mapMode && map) { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; } return current ? centre(current) : null; },
  };
  if (current) document.dispatchEvent(new CustomEvent('meridian:place', { detail: current }));

  renderTrip(); refreshGlobe(); route();
  navigator.permissions?.query({ name: 'geolocation' }).then(s => { if (s.state === 'granted' && !current) locate(); }).catch(() => {});
})();
