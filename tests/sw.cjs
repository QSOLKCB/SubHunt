/* SPDX-License-Identifier: Apache-2.0 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const scope='https://example.test/SubHunt/';
function worker(initial={}){
  const stores=new Map(Object.entries(initial).map(([key,urls])=>[key,new Map(urls.map(url=>[url,{body:key}]))]));
  const events={};let claimed=false;
  const caches={keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),open:async key=>{
    if(!stores.has(key))stores.set(key,new Map());const map=stores.get(key);
    return {keys:async()=>[...map.keys()].map(url=>({url})),match:async req=>map.get(req.url),addAll:async urls=>urls.forEach(url=>map.set(new URL(url,scope).href,{body:key}))};
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../sw.js'),'utf8'),{
    self:{registration:{scope},location:{origin:new URL(scope).origin},clients:{claim:async()=>{claimed=true;}},addEventListener:(type,fn)=>events[type]=fn},
    caches,URL,fetch:async()=>({body:'network'})
  });
  return {stores,events,claimed:()=>claimed};
}
async function lifecycle(w,type){let task;w.events[type]({waitUntil:p=>task=p});await task;}
test('offline install caches the controller module and activation preserves other projects',async()=>{
  const w=worker({['subhunt:'+scope+':v1']:[scope+'index.html'],['subhunt:'+scope+':v3']:[scope+'index.html'],'other-project':['https://example.test/other/index.html'],'subhunt:https://example.test/other/:v1':['https://example.test/other/index.html'],'subhunt-bathtub-v1':[scope+'index.html']});
  await lifecycle(w,'install');await lifecycle(w,'activate');
  for(const asset of ['js/controller.js','js/music.js','vendor/vanillajs/audio2d.js'])assert.ok(w.stores.get('subhunt:'+scope+':v4').has(scope+asset));
  assert.ok(!w.stores.has('subhunt:'+scope+':v1'));assert.ok(!w.stores.has('subhunt:'+scope+':v3'));assert.ok(!w.stores.has('subhunt-bathtub-v1'));
  assert.ok(w.stores.has('other-project'));assert.ok(w.stores.has('subhunt:https://example.test/other/:v1'));assert.ok(w.claimed());
});
test('legacy cache is not deleted if another project owns any entries',async()=>{
  const w=worker({'subhunt-bathtub-v1':[scope+'index.html','https://example.test/other/index.html']});await lifecycle(w,'activate');assert.ok(w.stores.has('subhunt-bathtub-v1'));
});
test('fetch serves only named GET assets from this game cache',async()=>{
  const w=worker({'other-project':[scope+'js/app.js']});await lifecycle(w,'install');
  let response;w.events.fetch({request:{method:'GET',url:scope+'js/app.js'},respondWith:p=>response=p});assert.equal((await response).body,'subhunt:'+scope+':v4');
  for(const request of [{method:'POST',url:scope+'index.html'},{method:'GET',url:'https://example.test/other/index.html'},{method:'GET',url:scope+'README.md'}]){
    let intercepted=false;w.events.fetch({request,respondWith:()=>intercepted=true});assert.equal(intercepted,false);
  }
});
