import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const file=process.argv[2]||'Roadster-Ligue.html';
const html=await fs.readFile(file,'utf8');
const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const ctx=await b.newContext({viewport:{width:1280,height:800},offline:true});
const page=await ctx.newPage(),errors=[],remote=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
try{
 await page.setContent('<body style="margin:0"><iframe id="game" sandbox="allow-scripts" style="display:block;width:100vw;height:100vh;border:0"></iframe></body>');
 await page.evaluate(html=>document.getElementById('game').srcdoc=html,html);
 const frame=page.frames().find(f=>f!==page.mainFrame());await frame.locator('#safety-screen').waitFor({state:'visible'});assert.equal(await frame.locator('#viewport canvas').count(),0);await frame.locator('#safety-continue').click();await frame.waitForFunction(()=>window.__ROADSTER__?.ready,null,{timeout:90000});
 await frame.click('#intro-training');await frame.waitForFunction(()=>window.__ROADSTER__.game.state==='playing');
 const result=await frame.evaluate(()=>({cars:window.__ROADSTER__.game.cars.length,freeplay:window.__ROADSTER__.game.freeplay,asset:!!window.__ROADSTER__.visuals.template}));
 await frame.evaluate(()=>document.fonts.ready);assert.equal(await frame.evaluate(()=>document.fonts.check('800 24px Barlow')),true,'embedded display font loaded');
 assert.deepEqual(result,{cars:1,freeplay:true,asset:true});assert.deepEqual(errors,[]);assert.deepEqual(remote,[],'the offline game must not attempt external requests');console.log('PASS offline self-contained HTML in sandbox="allow-scripts" with networking disabled.');
}finally{await b.close();}
