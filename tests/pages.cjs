/* SPDX-License-Identifier: Apache-2.0 */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');

test('Pages package includes every entry-page and offline-cache asset plus vendor attribution',async()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'subhunt-pages-'));
  try {
    execFileSync('sh',['scripts/stage-pages.sh',output],{cwd:root});
    const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
    const assets=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(match=>match[1]);
    const events={};let task;
    vm.runInNewContext(fs.readFileSync(path.join(output,'sw.js'),'utf8'),{
      self:{registration:{scope:'https://example.test/SubHunt/'},addEventListener:(type,fn)=>events[type]=fn},
      caches:{open:async()=>({addAll:async files=>assets.push(...files)})}
    });
    events.install({waitUntil:promise=>task=promise});await task;
    assets.push('vendor/vanillajs/LICENSE','vendor/vanillajs/PROVENANCE.json','vendor/vanillajs/audio2d.source.mjs','LICENSE');
    for(const asset of new Set(assets)) {
      const file=asset==='./'?'index.html':asset;
      assert.ok(fs.existsSync(path.join(output,file)),'missing published asset: '+file);
      assert.deepEqual(fs.readFileSync(path.join(output,file)),fs.readFileSync(path.join(root,file)),file+' must match the verified checkout');
    }
    assert.ok(fs.existsSync(path.join(output,'.nojekyll')));
    for(const privatePath of ['.git','.github','tests','build'])assert.ok(!fs.existsSync(path.join(output,privatePath)));
  } finally { fs.rmSync(output,{recursive:true,force:true}); }
});
