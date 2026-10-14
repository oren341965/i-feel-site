import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('worker never caches authenticated portal pages or evidence', async () => {
  const handlers = {};
  const cached = [];
  const self = {location:{href:'https://i-feel.co.il/staff-expenses/mcohome-sw.js',origin:'https://i-feel.co.il'},addEventListener:(name,fn)=>{handlers[name]=fn;}};
  vm.runInNewContext(fs.readFileSync('public/staff-expenses/mcohome-sw.js','utf8'), {self,URL,caches:{match:async request=>{cached.push(request.url); return {};}},fetch:async()=>({ok:true})});
  for (const path of ['/', '/?tab=new', '/mcohome-review.php?date=2026-10-14','/mcohome-connection.php','/mcohome-evidence.php?id=event','/mcohome-media.php?id=event']) {
    let intercepted = false;
    handlers.fetch({request:{method:'GET',mode:'navigate',url:'https://i-feel.co.il/staff-expenses'+path},respondWith:()=>{intercepted=true;}});
    assert.equal(intercepted,false,path);
  }
  let response;
  handlers.fetch({request:{method:'GET',mode:'cors',url:'https://i-feel.co.il/staff-expenses/mcohome-app.js?v=3'},respondWith:promise=>{response=promise;}});
  await response;
  assert.equal(cached.length,1);
});
