import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const php=process.env.PHP_BINARY || 'php';
async function server(t,port,preview) {
  const child=spawn(php,['-S',`127.0.0.1:${port}`,'-t','public',...(preview?['scripts/preview-shviro-portal.php']:[])],{cwd,stdio:'ignore'});
  let failure; child.on('error',e=>{failure=e;}); t.after(()=>child.kill());
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<80;i++){if(failure)throw failure;try{await fetch(base);return base;}catch{await delay(50);}}
  throw Error('Preview server failed to start');
}
test('production gate does not accept preview flags or reveal prices and resident data',async t=>{
  const base=await server(t,18790,false);
  const r=await fetch(base+'/shviro-ganei-tikva/?preview=1&scenario=resident',{headers:{'X-Forwarded-For':'127.0.0.1'}});
  const html=await r.text(); assert.equal(r.status,200);
  assert.match(html,/שלחו לי קוד כניסה/); assert.doesNotMatch(html,/id="pricelist"|TW601090|resident@example/);
  assert.match(r.headers.get('cache-control'),/no-store/); assert.match(r.headers.get('x-robots-tag'),/noindex/);
  assert.match(r.headers.get('set-cookie'),/ifeel_sgt_access/);
  for(const file of ['_catalog.php','_pricing.php','_guide.php']){
    const r2=await fetch(base+'/shviro-ganei-tikva/'+file);assert.doesNotMatch(await r2.text(),/TW601090|450\.00|cloud\.touchwand/);
  }
});
test('preview calculates installed prices and hours; CSRF and project boundaries remain enforced',async t=>{
  const base=await server(t,18791,true);let cookie='';
  async function get(suffix=''){const r=await fetch(base+'/shviro-ganei-tikva/'+suffix,{headers:{Cookie:cookie}});const cookies=r.headers.getSetCookie();cookie=cookies.map(c=>c.split(';')[0]).join('; ')||cookie;return r.text();}
  let html=await get();const csrf=html.match(/name="csrf" value="([^"]+)"/)[1];
  async function post(data,expected=303,suffix='') { const r=await fetch(base+'/shviro-ganei-tikva/'+suffix,{method:'POST',redirect:'manual',headers:{Cookie:cookie},body:new URLSearchParams({csrf,...data})});assert.equal(r.status,expected);return r.text(); }
  assert.match(html,/450\.00 ₪ לשעה/);assert.match(html,/ההתקנה אינה כוללת הכנת תשתית/);
  assert.match(html,/cloud\.touchwand\.com/);assert.match(html,/href="https:\/\/i-feel\.co\.il\/touchwand-app\/"/);
  assert.doesNotMatch(html,/4\.10\.2026|אשטרום|אבן שפרוט/);
  await post({action:'add',product:'glass-1',quantity:'2',price:'1'});
  await post({action:'add',product:'programming',quantity:'3'});
  html=await get();assert.match(html,/2,840\.00 ₪/);assert.match(html,/511\.20 ₪/);assert.match(html,/3,351\.20 ₪/);assert.match(html,/3 שעות/);
  assert.match(await post({action:'add',product:'glass-1',quantity:'1',csrf:'bad'},200),/פג תוקף/);
  assert.match(await post({action:'add',product:'unknown',quantity:'1'},200),/פריט לא מוכר/);
  assert.match(await post({action:'request_code',email:'resident@example.invalid'},200),/לא נשלחים קודי כניסה/);
  await post({action:'remove',product:'glass-1'});
  html=await get();assert.match(html,/1,593\.00 ₪/);
  for(const scenario of ['guest','other']){
    html=await get('?scenario='+scenario);assert.doesNotMatch(html,/id="pricelist"|id="app-guide"/);
    assert.match(await post({action:'add',product:'glass-1',quantity:'1'},200,'?scenario='+scenario),/דייר מאומת/);
  }
  assert.equal((await fetch(base+'/even-shaprut/')).status,404);
});
test('catalog snapshot uses existing approved prices and all referenced assets exist',()=>{
  const file=readFileSync(cwd+'public/shviro-ganei-tikva/_catalog.php','utf8');
  const products=JSON.parse(file.split("<<<'CATALOG'\n")[1].split('\nCATALOG')[0]);
  assert.equal(products.length,20);
  for(const p of products){assert.ok(Number.isInteger(p.netCents)&&p.netCents>0);if(p.image)assert.ok(existsSync(cwd+'public/shviro-ganei-tikva/assets/sku/'+p.image));}
  const bootstrap=readFileSync(cwd+'public/shviro-ganei-tikva/_bootstrap.php','utf8');
  assert.match(bootstrap,/SGT_MONDAY_GROUP_ID = 'group_mm4djwwb'/);
  assert.match(bootstrap,/groups\(ids: \$groupIds\)/);
  assert.doesNotMatch(bootstrap,/group_mm15570j|ifeel_esp_|ifeel-esp-/);
  assert.match(readFileSync(cwd+'public/shviro-ganei-tikva/.htaccess','utf8'),/Require all denied/);
});
