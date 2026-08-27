import { chromium } from 'playwright-core';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const SITE='/home/claude/push/NV-STREAMING-V1/site';
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const srv=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const d=await readFile(path.join(SITE,p));res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(d);}catch{res.writeHead(404);res.end('x');}});
await new Promise(r=>srv.listen(8091,'127.0.0.1',r));
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:1500,height:950}})).newPage();
await pg.goto('http://localhost:8091/index.html',{waitUntil:'networkidle'}); await pg.waitForTimeout(2200);
await pg.locator('.nav-cat',{hasText:'Streaming'}).click(); await pg.waitForTimeout(400); await pg.mouse.move(750,600); await pg.waitForTimeout(200);
const r=await pg.evaluate(()=>{
  const inst=window.__NV_INSTANCE;
  const out={ openMenu: inst&&inst.state&&inst.state.openMenu };
  // what does renderVals produce for catNav?
  try{ const v=inst.renderVals(); out.catNavActive=(v.catNav||[]).map(c=>({l:c.label,a:c.active})); }catch(e){out.rvErr=String(e).slice(0,80);}
  const strm=[...document.querySelectorAll('.nav-cat')].find(c=>/Streaming/.test(c.textContent));
  out.domClass=strm&&strm.getAttribute('class');
  // force rerender then re-check
  window.__NV_RERENDER();
  const strm2=[...document.querySelectorAll('.nav-cat')].find(c=>/Streaming/.test(c.textContent));
  out.domClassAfterRerender=strm2&&strm2.getAttribute('class');
  return out;
});
console.log(JSON.stringify(r,null,2));
await b.close(); srv.close();
