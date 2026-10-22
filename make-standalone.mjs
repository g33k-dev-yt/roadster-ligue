// Makes a genuinely self-contained offline game: scripts, fonts, models, HDRI and decoder.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const output = process.argv[2] || path.join(root,'Roadster-Ligue.html');
const mime = name => name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream';
const files = ['roadster-2026.glb', 'roadster-game.glb', 'roadster-far.glb', 'stadium-sunset.hdr', 'draco/draco_wasm_wrapper.js', 'draco/draco_decoder.wasm'];
const assets = {};
for (const f of files) { const b = await fs.readFile(path.join(root, 'public/assets', f)); assets['/assets/' + f] = { mime: mime(f), data: b.toString('base64'), length: b.length }; }
const dist = await fs.readdir('dist/assets');
let js = await fs.readFile('dist/assets/' + dist.find(f => f.endsWith('.js')), 'utf8');
let css = await fs.readFile('dist/assets/' + dist.find(f => f.endsWith('.css')), 'utf8');
for (const file of await fs.readdir('public/assets')) if (file.endsWith('.ttf')) {
  const b = await fs.readFile('public/assets/' + file);
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('url\\(([\"\\\']?)(?:\\.\\./|\\./|/)?assets/' + escaped + '\\1\\)', 'g');
  css = css.replace(pattern, () => 'url(\"data:font/ttf;base64,' + b.toString('base64') + '\")');
}

let html = await fs.readFile('index.html', 'utf8');
html = html.replace(/\s*<link[^>]+rel="(?:preload|icon)"[^>]*>/g, '').replace(/<script type="module" src="\/src\/main.js"><\/script>/, '');
const favicon = await fs.readFile('public/favicon.svg', 'utf8');
html = html.replace('</head>', () => `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}"><style>${css}</style></head>`);
const shim = `(() => {globalThis.__ROADSTER_ASSET_BASE__='https://roadster-ligue.invalid/';const assets=${JSON.stringify(assets)};const originalFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=async(resource,options)=>{const u=typeof resource==='string'?resource:resource.url;let p;try{p=new URL(u,location.href).pathname;}catch{return originalFetch(resource,options);}const a=assets[p];if(!a)return originalFetch(resource,options);const raw=atob(a.data),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Response(bytes,{status:200,headers:{'Content-Type':a.mime,'Content-Length':String(a.length)}});};})();`;
const licenses={};for(const file of await fs.readdir('public/licenses'))licenses[file]=await fs.readFile('public/licenses/'+file,'utf8');
licenses['ASSET_SOURCES.md']=await fs.readFile('public/ASSET_SOURCES.md','utf8');
licenses['PROJECT-MIT.txt']=await fs.readFile('LICENSE','utf8');
licenses['SAFETY.md']=await fs.readFile('SAFETY.md','utf8');
const licenseData=JSON.stringify(licenses).replaceAll('</script','<\\/script');
html = html.replace('</body>', () => `<script type="application/json" id="third-party-licenses">${licenseData}</script><script>${shim}</script><script type="module">${js.replaceAll('</script', '<\\/script')}</script></body>`);
await fs.writeFile(output, html);
console.log(`Offline game: ${output} (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB)`);
