// Builds the static travel data in /data from Wikidata (spots, regions) and OpenStreetMap (cafes, restaurants).
// Run:  node tools/build-data.mjs            (resumable: existing files are skipped)
//       node tools/build-data.mjs --force    (rebuild everything)
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)), 'data');
const FORCE = process.argv.includes('--force');
const UA = 'MeridianTravelBuild/0.2 (static data build script)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const exists = p => access(p).then(() => true, () => false);
const save = async (rel, obj) => { const p = join(ROOT, rel); await mkdir(join(p, '..'), { recursive: true }); await writeFile(p, JSON.stringify(obj)); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Place types we treat as travel spots. Order = priority when a place has several types.
// cat: nature | culture | fun.  insta: photogenic by nature of the place.
export const TYPES = [
  ['Q40080', 'beach', 'Beach', 'nature', 1], ['Q34038', 'waterfall', 'Waterfall', 'nature', 1], ['Q6017969', 'viewpoint', 'Viewpoint', 'nature', 1],
  ['Q46169', 'national-park', 'National park', 'nature', 1], ['Q150784', 'canyon', 'Canyon', 'nature', 1], ['Q35509', 'cave', 'Cave', 'nature', 1],
  ['Q177380', 'hot-spring', 'Hot spring', 'nature', 1], ['Q8072', 'volcano', 'Volcano', 'nature', 1], ['Q35666', 'glacier', 'Glacier', 'nature', 1],
  ['Q184358', 'reef', 'Reef', 'nature', 1], ['Q16560', 'palace', 'Palace', 'culture', 1], ['Q23413', 'castle', 'Castle', 'culture', 1],
  ['Q44539', 'temple', 'Temple', 'culture', 1], ['Q845945', 'shrine', 'Shrine', 'culture', 1], ['Q32815', 'mosque', 'Mosque', 'culture', 1],
  ['Q153562', 'opera-house', 'Opera house', 'culture', 1], ['Q39715', 'lighthouse', 'Lighthouse', 'culture', 1], ['Q167346', 'garden', 'Botanical garden', 'nature', 1],
  ['Q194195', 'amusement-park', 'Amusement park', 'fun', 1], ['Q43501', 'zoo', 'Zoo', 'fun', 0], ['Q2281788', 'aquarium', 'Aquarium', 'fun', 0],
  ['Q130003', 'ski-resort', 'Ski resort', 'fun', 1], ['Q37654', 'market', 'Market', 'culture', 1], ['Q483453', 'fountain', 'Fountain', 'culture', 1],
  ['Q12280', 'bridge', 'Bridge', 'culture', 1], ['Q11303', 'skyscraper', 'Skyscraper', 'culture', 1], ['Q12518', 'tower', 'Tower', 'culture', 1],
  ['Q174782', 'square', 'Square', 'culture', 1], ['Q16970', 'church', 'Church', 'culture', 0], ['Q33506', 'museum', 'Museum', 'culture', 0],
  ['Q839954', 'ruins', 'Archaeological site', 'culture', 1], ['Q1081138', 'historic-site', 'Historic site', 'culture', 0], ['Q4989906', 'monument', 'Monument', 'culture', 0],
  ['Q23442', 'island', 'Island', 'nature', 1], ['Q185113', 'cape', 'Cape', 'nature', 1], ['Q39594', 'bay', 'Bay', 'nature', 0],
  ['Q23397', 'lake', 'Lake', 'nature', 1], ['Q8502', 'mountain', 'Mountain', 'nature', 1], ['Q179049', 'nature-reserve', 'Nature reserve', 'nature', 0],
  ['Q22698', 'park', 'Park', 'nature', 0], ['Q570116', 'attraction', 'Attraction', 'fun', 1],
];
const PRIORITY = new Map(TYPES.map((t, i) => [t[0], i]));

async function sparql(query, timeout = 62000) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
      if (r.status === 429 || r.status >= 500) { await sleep(8000 * (attempt + 1)); continue; }
      const t = await r.text();
      if (!t.startsWith('{')) throw new Error('timeout');
      return JSON.parse(t).results.bindings;
    } catch (e) { if (attempt === 1) throw e; await sleep(3000); }
  }
  throw new Error('gave up');
}

const pt = s => { const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(s || ''); return m ? [+(+m[2]).toFixed(5), +(+m[1]).toFixed(5)] : null; };
const fileOf = u => { if (!u) return null; const f = decodeURIComponent(u.split('Special:FilePath/')[1] || ''); return /\.(jpe?g|png|webp)$/i.test(f) ? f : null; };
const qid = u => u.split('/').pop();

let classes; // type QID -> root QID
async function loadClasses() {
  const p = join(ROOT, 'classes.json');
  await save('types.json', Object.fromEntries(TYPES.map(([q, key, label, cat, insta]) => [key, { label, cat, insta }])));
  await save('typeids.json', Object.fromEntries(TYPES.map(t => [t[0], t[1]])));
  if (!FORCE && await exists(p)) { classes = JSON.parse(await readFile(p, 'utf8')); return; }
  log('fetching place-type tree');
  const rows = await sparql(`SELECT ?t ?root WHERE { VALUES ?root { ${TYPES.map(t => 'wd:' + t[0]).join(' ')} } ?t wdt:P279* ?root }`);
  classes = {};
  for (const r of rows) { const t = qid(r.t.value), root = qid(r.root.value); if (!(t in classes) || PRIORITY.get(root) < PRIORITY.get(classes[t])) classes[t] = root; }
  await save('classes.json', classes);
  await save('types.json', Object.fromEntries(TYPES.map(([q, key, label, cat, insta]) => [key, { label, cat, insta }])));
}
const KEY = new Map(TYPES.map(t => [t[0], t[1]]));

function toSpots(rows, max = 140) {
  const out = [];
  for (const r of rows) {
    const name = r.itemLabel?.value; if (!name || /^Q\d+$/.test(name)) continue;
    const co = pt(r.coord?.value), img = fileOf(r.img?.value); if (!co || !img) continue;
    let best = null;
    for (const t of (r.ts?.value || '').split(' ')) { const root = classes[t]; if (root && (best === null || PRIORITY.get(root) < PRIORITY.get(best))) best = root; }
    const wh = r.wh?.value ? 1 : 0;
    if (!best && !wh) continue;
    const s = { id: qid(r.item.value), n: name, t: best ? KEY.get(best) : 'attraction', lat: co[0], lng: co[1], img, sl: +r.sl.value };
    if (r.itemDescription?.value) s.d = r.itemDescription.value.slice(0, 110);
    if (wh) s.wh = 1;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

const SEL = 'SELECT ?item ?itemLabel ?itemDescription (GROUP_CONCAT(DISTINCT STRAFTER(STR(?t),"entity/");separator=" ") AS ?ts) (SAMPLE(?c) AS ?coord) (SAMPLE(?i) AS ?img) ?sl (MAX(?h) AS ?wh) WHERE {';
const END = 'SERVICE wikibase:label{bd:serviceParam wikibase:language "en"} } GROUP BY ?item ?itemLabel ?itemDescription ?sl ORDER BY DESC(?sl) LIMIT';

const aroundQuery = (lat, lng, radius, minSl) => `${SEL} hint:Query hint:optimizer "None".
  SERVICE wikibase:around { ?item wdt:P625 ?c . bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral; wikibase:radius "${radius}". }
  ?item wikibase:sitelinks ?sl. FILTER(?sl>=${minSl}) ?item wdt:P18 ?i; wdt:P31 ?t.
  OPTIONAL { ?item wdt:P1435 wd:Q9259. BIND(1 AS ?h) } ${END} 700`;

const SMALL = 'Q40080 Q34038 Q23442 Q35509 Q177380 Q8072 Q150784 Q6017969 Q16560 Q23413 Q153562 Q43501 Q194195 Q2281788 Q167346 Q570116 Q46169 Q184358 Q185113 Q39594'.split(' ').map(q => 'wd:' + q).join(' ');
const countryQuery = (c, quick) => `${SEL}
  { ?item wdt:P1435 wd:Q9259. BIND(1 AS ?h) } UNION { ?item wdt:P31/wdt:P279? wd:Q46169 } ${quick ? 'UNION { ?item wdt:P31 wd:Q570116 }' : `UNION { VALUES ?t0 { ${SMALL} } ?item wdt:P31 ?t0 }`}
  ?item wdt:P17 wd:${c}; wdt:P625 ?c; wdt:P18 ?i; wikibase:sitelinks ?sl; wdt:P31 ?t. ${END} 220`;

async function spotsAround(lat, lng, radius, minSl) {
  try { return toSpots(await sparql(aroundQuery(lat, lng, radius, minSl))); }
  catch { return toSpots(await sparql(aroundQuery(lat, lng, Math.max(12, Math.round(radius / 2)), minSl + 2))); }
}

async function regionsOf(c) {
  const rows = await sparql(`SELECT ?p ?pLabel (SAMPLE(?co) AS ?coord) (SAMPLE(?im) AS ?img) (SAMPLE(?ar) AS ?area) (SAMPLE(?cl) AS ?cap) (SAMPLE(?cc) AS ?capCoord) WHERE {
    wd:${c} wdt:P150 ?p. FILTER NOT EXISTS { ?p wdt:P576 ?gone } ?p wdt:P625 ?co.
    OPTIONAL { ?p wdt:P18 ?im } OPTIONAL { ?p wdt:P2046 ?ar } OPTIONAL { ?p wdt:P36 ?cp. ?cp wdt:P625 ?cc; rdfs:label ?cl. FILTER(LANG(?cl)="en") }
    SERVICE wikibase:label{bd:serviceParam wikibase:language "en"} } GROUP BY ?p ?pLabel`);
  return rows.map(r => {
    const co = pt(r.coord.value), cap = pt(r.capCoord?.value), area = +r.area?.value || 0;
    const big = area > 90000 && cap;
    const reg = { id: qid(r.p.value), n: r.pLabel.value, lat: (big ? cap : co)[0], lng: (big ? cap : co)[1], r: Math.round(Math.min(220, Math.max(25, area ? Math.sqrt(area / Math.PI) * 1.15 : 70))) };
    const img = fileOf(r.img?.value); if (img) reg.img = img;
    if (r.cap?.value) reg.cap = r.cap.value;
    if (cap) reg.clat = cap[0], reg.clng = cap[1];
    return reg;
  }).filter(r => !/^Q\d+$/.test(r.n)).sort((a, b) => a.n.localeCompare(b.n));
}

// ---- cafes and restaurants from OpenStreetMap ----
const OVERPASS = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function food(lat, lng, radius = 3000) {
  const q = `[out:json][timeout:40];(nwr["amenity"~"^(cafe|restaurant)$"]["name"](around:${radius},${lat},${lng}););out tags center 1500;`;
  for (let i = 0; i < OVERPASS.length * 4; i++) {
    try {
      const r = await fetch(OVERPASS[i % OVERPASS.length], { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(25000) });
      const t = await r.text(); if (!t.startsWith('{')) throw 0;
      const items = JSON.parse(t).elements.map(e => {
        const g = e.tags, la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; if (la == null) return null;
        const ig = (g['contact:instagram'] || g.instagram || '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^@|\/.*$/g, '');
        const o = { id: e.type[0] + e.id, n: g['name:en'] || g.name, k: g.amenity === 'cafe' ? 'cafe' : 'restaurant', lat: +la.toFixed(5), lng: +lo.toFixed(5) };
        if (g.cuisine) o.cu = g.cuisine.split(';').slice(0, 3).join(', ').replace(/_/g, ' ');
        const web = g.website || g['contact:website']; if (web && /^https?:\/\//.test(web)) o.web = web.slice(0, 200);
        if (ig && /^[\w.]+$/.test(ig)) o.ig = ig;
        if (g.opening_hours) o.hrs = g.opening_hours.slice(0, 80);
        const addr = [g['addr:housenumber'], g['addr:street']].filter(Boolean).join(' '); if (addr) o.addr = addr;
        o.s = (o.web ? 2 : 0) + (o.ig ? 3 : 0) + (o.cu ? 1 : 0) + (o.hrs ? 1 : 0) + (g.wikidata ? 3 : 0) + (g.outdoor_seating === 'yes' ? 1 : 0);
        return o;
      }).filter(Boolean).sort((a, b) => b.s - a.s);
      const pick = k => items.filter(x => x.k === k).slice(0, 120);
      return [...pick('cafe'), ...pick('restaurant')];
    } catch { await sleep(3000 + i * 1500); }
  }
  return null;
}

// ---- job runner ----
async function pool(jobs, n) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const job = jobs[i++]; try { await job(); } catch (e) { log('  failed:', e.message); } } }));
}
const once = (rel, label, fn) => async () => {
  if (!FORCE && await exists(join(ROOT, rel))) return;
  const t = Date.now(); const data = await fn(); if (!data) return log('  no data', label);
  await save(rel, data); log(`${label} -> ${rel} (${Math.round((Date.now() - t) / 1000)}s)`);
};

const COUNTRIES = 'TH AU JP FR IT ES US GB ID VN KR CN IN GR PT TR NZ MX BR AR PE EG MA ZA TZ AE JO NL CZ AT IS DE CH CA SG MY PH KH LA NP LK MV CU CL CO HR NO SE DK IE FI HU PL BE KE TW RU SA IL QA OM FJ EC BO CR PA DO JM KZ UZ GE AM MM BT MN ET NA BW MG TN SN GH RO BG RS SI SK EE LV LT UA CY MT LU ME AL BA MK'.split(' ');
const REGION_DETAIL = 'TH AU JP VN ID IT ES FR GB NZ KR MY PH US'.split(' ');

async function main() {
  await mkdir(ROOT, { recursive: true });
  await loadClasses();
  const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');

  // 1. Featured cities (ids and coordinates come from js/data.js)
  const src = await readFile(join(ROOT, '..', 'js', 'data.js'), 'utf8');
  const cities = [...src.matchAll(/c\('([\w-]+)', '[^']+', '[^']+', (-?[\d.]+), (-?[\d.]+)/g)].map(m => ({ id: m[1], lat: +m[2], lng: +m[3] }));
  const cityJobs = cities.map(c => once(`city/${c.id}.json`, `city ${c.id}`, async () => ({ spots: await spotsAround(c.lat, c.lng, 25, 2) })));

  // Cafes and restaurants only:  node tools/build-data.mjs --food
  if (process.argv.includes('--food')) {
    const jobs = cities.map(c => once(`food/${c.id}.json`, `food ${c.id}`, async () => { const items = await food(c.lat, c.lng); return items && { items }; }));
    for (const code of ['TH', 'AU', 'JP', 'VN', 'ID', 'IT', 'ES', 'FR', 'GB', 'NZ', 'KR', 'MY', 'PH', 'US']) {
      const p = join(ROOT, `country/${code}.json`); if (!await exists(p)) continue;
      for (const r of JSON.parse(await readFile(p, 'utf8')).regions)
        jobs.push(once(`food/${r.id}.json`, `food ${code} ${r.n}`, async () => { const items = await food(r.clat ?? r.lat, r.clng ?? r.lng); return items && { items }; }));
    }
    await pool(jobs, 2); return log('food done');
  }

  // 2. Countries: id lookup, regions, top spots
  log('resolving countries');
  const idRows = await sparql(`SELECT ?c ?code ?cLabel WHERE { VALUES ?code { ${COUNTRIES.map(c => `"${c}"`).join(' ')} } ?c wdt:P297 ?code. FILTER NOT EXISTS { ?c wdt:P576 ?gone } SERVICE wikibase:label{bd:serviceParam wikibase:language "en"} }`);
  const cid = Object.fromEntries(idRows.map(r => [r.code.value, { q: qid(r.c.value), name: r.cLabel.value }]));
  const list = (only || COUNTRIES).filter(c => cid[c]);
  const regionJobs = [], mergeLater = [];
  const countryJobs = list.map(code => async () => {
    const rel = `country/${code}.json`; let data;
    if (!FORCE && await exists(join(ROOT, rel))) data = JSON.parse(await readFile(join(ROOT, rel), 'utf8'));
    else {
      const t = Date.now(), { q, name } = cid[code];
      const regions = await regionsOf(q).catch(() => []);
      let spots = [];
      // Big countries (Japan, France, China...) are too heavy for one whole-country question: their spots are merged from their regions later.
      try { spots = toSpots(await sparql(countryQuery(q, false)), 150); }
      catch { try { spots = toSpots(await sparql(countryQuery(q, true)), 150); } catch { if (!regions.length) throw new Error(`country ${code}: no regions and no spots`); } }
      data = { id: q, code, name, regions, spots };
      await save(rel, data); log(`country ${code} ${name}: ${regions.length} regions, ${spots.length} spots (${Math.round((Date.now() - t) / 1000)}s)`);
    }
    if (!data.spots.length) mergeLater.push(code);
    if (REGION_DETAIL.includes(code) || !data.spots.length) for (const r of data.regions)
      regionJobs.push(once(`region/${r.id}.json`, `region ${code} ${r.n}`, async () => ({ spots: await spotsAround(r.lat, r.lng, r.r, r.r > 120 ? 2 : 1) })));
  });

  const foodJobs = process.argv.includes('--no-food') ? [] : cities.map(c => once(`food/${c.id}.json`, `food ${c.id}`, async () => { const items = await food(c.lat, c.lng); return items && { items }; }));

  // Priority order: Thailand and Australia first, then everything else.
  const first = countryJobs.slice(0, 2);
  await pool(first, 2);
  const firstRegions = regionJobs.splice(0);
  await Promise.all([pool([...cityJobs.slice(0, 12), ...firstRegions, ...cityJobs.slice(12)], 3), pool(foodJobs, 1)]);
  await pool(countryJobs.slice(2), 3);
  await pool(regionJobs, 3);

  // Countries without their own spot list: take the most famous spots from all of their regions.
  for (const code of mergeLater) {
    const rel = `country/${code}.json`, data = JSON.parse(await readFile(join(ROOT, rel), 'utf8')), seen = new Map();
    for (const r of data.regions) {
      const p = join(ROOT, `region/${r.id}.json`); if (!await exists(p)) continue;
      for (const sp of JSON.parse(await readFile(p, 'utf8')).spots || []) if (!seen.has(sp.id)) seen.set(sp.id, sp);
    }
    data.spots = [...seen.values()].sort((a, b) => (b.sl || 0) - (a.sl || 0)).slice(0, 150);
    await save(rel, data); log(`country ${code}: merged ${data.spots.length} spots from ${data.regions.length} regions`);
  }

  // Index of what exists, so the site knows which files it can load instantly.
  const { readdir } = await import('node:fs/promises');
  const ls = async d => (await readdir(join(ROOT, d)).catch(() => [])).map(f => f.replace('.json', ''));
  await save('index.json', { country: await ls('country'), region: await ls('region'), city: await ls('city'), food: await ls('food'), built: new Date().toISOString().slice(0, 10) });
  log('done');
}
main().catch(e => { console.error(e); process.exit(1); });
