import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('dist');
const prefix = '/roadster-ligue/';
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.wasm':'application/wasm','.glb':'model/gltf-binary','.svg':'image/svg+xml','.md':'text/plain'};
const server = http.createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith(prefix)) { res.writeHead(404);res.end('No root-path fallback');return; }
    const file = path.resolve(root, decodeURIComponent(pathname.slice(prefix.length) || 'index.html'));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403);res.end();return; }
    const content = await fs.readFile(file);
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});res.end(content);
  } catch { res.writeHead(404);res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const page = await browser.newPage({viewport:{width:1000,height:650}});
  const errors=[], badResponses=[], badPaths=[];
  page.on('pageerror', e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)badResponses.push(`${r.status()} ${r.url()}`);});
  page.on('request',r=>{if(r.url().startsWith(base) && !new URL(r.url()).pathname.startsWith(prefix))badPaths.push(r.url());});
  await page.goto(base+prefix);
  await page.locator('#safety-continue').click();
  await page.waitForFunction(()=>window.__ROADSTER__?.ready,null,{timeout:90000});
  await page.locator('#intro-training').click();
  await page.waitForFunction(()=>window.__ROADSTER__.game.state==='playing');
  assert.equal(await page.evaluate(()=>Boolean(window.__ROADSTER__.visuals.template)),true);
  assert.deepEqual(badPaths,[],'No assets may load from the host root');
  assert.deepEqual(badResponses,[],'All static resources must resolve under the repository subpath');
  assert.deepEqual(errors,[]);
  console.log('PASS GitHub Pages-style /roadster-ligue/ hosting, models, WebAssembly decoder and free play.');
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
