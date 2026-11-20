import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Isolate the browser session and model per case; run the shipped scripts.
function session() {
  const nodes=new Map();
  const node=id=>{
    if(!nodes.has(id)) nodes.set(id,{style:{},dataset:{},classList:{toggle(){}},addEventListener(){},showModal(){this.open=true},close(){this.open=false}});
    return nodes.get(id);
  };
  const ctx=vm.createContext({window:{addEventListener(){}},document:{querySelector:node,body:node('body'),addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout});
  const run=js=>vm.runInContext(js,ctx);
  for(const file of ['game.js','feed.js','app.js']) run(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  run("g.name='QA';g.role='QA Engineer';g.exp='1–3 года'");
  return run;
}

test('demo: pages are unique, browsing is free and API retries are bounded',async()=>{
  const run=session();
  run("let calls=0;generate=async()=>{calls++;return {mode:'demo'}}");
  for(let i=0;i<8;i++)await run('batch(true)');
  assert.equal(run('g.jobs.length'),run('seed.length + briefs.length'));
  assert.equal(run('new Set(g.jobs.map(j=>j.desc)).size'),run('seed.length + briefs.length'));
  assert.equal(run('g.day===0 && g.cash===150000 && g.actions===0 && calls===1'),true);
});

test('slow provider: local page first, valid prepared job next, no duplicate or stale session',async()=>{
  const run=session();
  run("let finish;generate=()=>new Promise(r=>finish=r);let jobAI={title:'QA',salary:'120 000 ₽',company:'Условия',desc:'Оплачиваемое дежурство'}");
  await run('batch(true)'); assert.equal(run('g.jobs.length'),run('seed.length + 3'));
  await run('finish({jobs:[jobAI,jobAI,{}]});prepareFeed(g)');
  await run('batch(true)');assert.equal(run('g.jobs[seed.length + 3].company'),'Условия');
  assert.equal(run("g.jobs.filter(j=>j.company==='Условия').length"),1);
  await run("let obsolete=prepareFeed(g);g=fresh();finish({jobs:[jobAI]});obsolete");
  assert.equal(run('reserve(g).length'),0);
});

test('concurrent recruiters: reverse delivery and double click do not cross histories or charge twice',async()=>{
  const run=session();
  run("let deliver={};generate=(_,d)=>new Promise(r=>deliver[d.company]=r);applyJob(current(2));applyJob(current(4));chat(current(2));let first=answer('А');answer('Дубликат');chat(current(4));let second=answer('Б')");
  await run("deliver[current(4).company]({reply:'Ответ Б'});second");
  assert.equal(run('g.apps[2].history.length'),2);
  await run("deliver[current(2).company]({reply:'Ответ А'});first");
  assert.equal(run("g.apps[2].history.at(-1).t.startsWith('Ответ А') && g.apps[4].history.at(-1).t.startsWith('Ответ Б') && chatId===4 && g.day===4"),true);
});

test('role and keyword intersect with saved/remote/hidden constraints',()=>{
 const run=session();
 assert.equal(run("matchingJobs(g,'Маркетолог','  HEAD of   MARketing ','Удалённо',true)[0].company"),'Перспективный стартап');
 assert.equal(run("matchingJobs(g,'Frontend Developer','маркетинг','Все вакансии',false).length"),0);
 assert.equal(run("matchingJobs(g,'Frontend Developer','фронтенд','Все вакансии',false)[0].id"),2);
 assert.equal(run("g.saved=[8];matchingJobs(g,'','marketing head','Избранное',false).length"),1);
 assert.equal(run("g.hidden=[8];matchingJobs(g,'','marketing head','Избранное',false).length"),0);
});
