// Builds sitemap.xml from the featured cities and the built country and region files.
//   node tools/build-sitemap.mjs https://your-site-address/
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const base = (process.argv[2] || 'https://chteerut.github.io/meridian/').replace(/\/?$/, '/');
const today = new Date().toISOString().slice(0, 10);
const esc = s => s.replace(/&/g, '&amp;');

const urls = [[base, '1.0']];
const src = await readFile(join(root, 'js', 'data.js'), 'utf8');
for (const m of src.matchAll(/c\('([\w-]+)',/g)) urls.push([`${base}?city=${m[1]}`, '0.8']);
for (const f of (await readdir(join(root, 'data', 'country'))).sort()) {
  const code = f.replace('.json', '');
  urls.push([`${base}?country=${code}`, '0.7']);
  const data = JSON.parse(await readFile(join(root, 'data', 'country', f), 'utf8'));
  for (const r of data.regions || []) urls.push([`${base}?country=${code}&region=${r.id}`, '0.5']);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, p]) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod><priority>${p}</priority></url>`).join('\n')}
</urlset>
`;
await writeFile(join(root, 'sitemap.xml'), xml);
console.log(`sitemap.xml: ${urls.length} pages`);
