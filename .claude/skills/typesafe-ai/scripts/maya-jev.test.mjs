import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {makeRequest,parseResult,callApi,routes,MODEL} from './maya-jev.mjs';
const input = {channel:'email',items:[{ref:'one',text:'לקוח מבקש הצעת מחיר.'}]};
const fixture = () => ({model:MODEL,answers:{m0_route:{type:'choice',choice:'sales',confidence:0.9,probabilities:Object.fromEntries(Object.keys(routes).map(k=>[k,k==='sales'?1:0]))},m0_attention:{type:'noul',noul:0.9}}});
test('batches independent typed questions and redacts direct identifiers',()=>{
  const payload=makeRequest({channel:'whatsapp',items:[{ref:'a',text:'שלום person@example.com +972 50 123 4567 https://example.com/private'}]});
  assert.equal(Object.keys(payload.questions).length,2);
  assert.ok(!JSON.stringify(payload.state).includes('person@example.com'));
  assert.ok(!JSON.stringify(payload.state).includes('123 4567'));
  assert.ok(!JSON.stringify(payload.state).includes('example.com'));
});
test('rejects credentials, duplicate references and excessive context',()=>{
  assert.throws(()=>makeRequest({channel:'email',items:[{ref:'a',text:'api_key=secretcredential123'}]}),/SENSITIVE_INPUT/);
  assert.throws(()=>makeRequest({channel:'email',items:[input.items[0],input.items[0]]}),/INVALID_ITEM_REF/);
  assert.throws(()=>makeRequest({...input,items:[{ref:'a',text:'x'.repeat(6001)}]}),/INVALID_TEXT_LENGTH/);
});
test('model opinion never authorizes a customer action even at certainty',()=>{
  const parsed=parseResult(fixture(),input)[0];
  assert.equal(parsed.actionAuthorized,false);
  assert.equal(parsed.reviewRequired,true);
});
test('rejects missing/foreign answers, model drift and malformed probabilities',()=>{
  for (const alter of [x=>delete x.answers.m0_attention,x=>x.answers.extra={},x=>x.model='jev-other',x=>x.answers.m0_route.probabilities.sales=2,x=>x.answers.m0_attention.noul='0.9']) {
    const data=fixture(); alter(data); assert.throws(()=>parseResult(data,input),/INVALID_API_RESPONSE/);
  }
});
test('one bounded call with fixed HTTPS endpoint, no redirect or retries',async()=>{
  let calls=0;
  const response=await callApi('systemone',makeRequest(input),'fake-unit-test-key',async(url,options)=>{
    calls++; assert.equal(url,'https://api.typesafe.ai/v1/systemone'); assert.equal(options.redirect,'error'); assert.ok(options.signal);
    return new Response(JSON.stringify(fixture()),{status:200});
  });
  assert.equal(calls,1); assert.equal(response.body.model,MODEL);
});
test('failure diagnostics never echo vendor errors or secret material',async()=>{
  await assert.rejects(callApi('systemone',{},'fake-unit-test-key',async()=>new Response('private data',{status:401})),/^Error: JEV_HTTP_401$/);
  await assert.rejects(callApi('systemone',{},'fake-unit-test-key',async()=>{throw Error('fake-unit-test-key')}),/^Error: JEV_NETWORK_OR_TIMEOUT$/);
});
test('PowerShell wrapper passes pipeline JSON to child without parameter binding failure',{skip:process.platform!=='win32'},()=>{
  const wrapper=fileURLToPath(new URL('./invoke-maya-jev.ps1',import.meta.url)).replaceAll("'","''");
  const script=`function node { $payload=($input | Out-String); Write-Output $payload; $global:LASTEXITCODE=0 }; $env:TYPESAFE_API_KEY='synthetic-test-only'; '{"channel":"email","items":[{"ref":"test","text":"synthetic"}]}' | & '${wrapper}' -Command classify`;
  const run=spawnSync('pwsh',['-NoProfile','-Command',script],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr); assert.deepEqual(JSON.parse(run.stdout),{channel:'email',items:[{ref:'test',text:'synthetic'}]});
  assert.ok(!run.stdout.includes('synthetic-test-only'));
});
