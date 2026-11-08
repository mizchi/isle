import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';
import { planCodeLoad } from '../runtime/manifest.mjs';

async function bundle(mode = 'resume', loading = 'lazy', overrides = {}, source = 'client component Counter(initial:number){state n=initial;<button>on click add {n+=1;}{n}</button>}') {
  const directory = await mkdtemp(join(tmpdir(), 'isle-resource-bind-'));
  try {
    const entry = join(directory, 'app.isle');
    await writeFile(entry, source);
    await writeFile(join(directory, 'resource.mjs'), 'export function setup({owner,root}){owner.own(root,()=>{});}');
    await writeFile(join(directory, 'index.html'), '<!doctype html><html><head></head><body><!--isle:ssr--></body></html>');
    const result = await build({ configFile: false, root: directory, base: './', logLevel: 'silent', plugins: [isle({entry, mode, loading, resources: {Counter:'./resource.mjs'}, diagnostics:false, mounts:[{component:'Counter',props:{initial:1},label:'Counter'}],...overrides})], build:{write:false} });
    return result.output;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('resource setup is a lazy CodeRef dependency of every component handler', async () => {
  const output = await bundle(), asset = output.find(item => item.fileName === 'isle.manifest.json');
  const manifest = JSON.parse(asset.source), resource = manifest.references['Counter.$resources'];
  assert.equal(resource.kind, 'resource');
  assert.equal(resource.ref[1], 'setup');
  assert.ok(manifest.references['Counter.add'].requires.includes('Counter.$resources'));
  const plan = planCodeLoad(manifest, ['Counter.add']);
  assert.ok(plan.modules.includes(resource.ref[0]));
  const main = output.find(item => item.type === 'chunk' && item.facadeModuleId?.endsWith('index.html'));
  assert.ok(!main.code.includes('JSON.parse'));
  const html = output.find(item => item.fileName === 'index.html').source;
  assert.match(html, /data-isle-code="Counter.add"/);
});

test('external resource setup preserves an otherwise unobserved activation entry',async()=>{
  const output=await bundle('resume','lazy',{},'client component Counter(initial:number){state n=initial;<button>on click activate{n+=1;}Activate</button>}');
  const manifest=JSON.parse(output.find(item=>item.fileName==='isle.manifest.json').source);
  assert.ok(manifest.references['Counter.activate']);
  assert.ok(manifest.references['Counter.activate'].requires.includes('Counter.$resources'));
  assert.match(output.find(item=>item.fileName==='index.html').source,/data-isle-on-click/);
});

test('SSR-only omits setup and cleanup code even when a resource module is configured', async () => {
  const output = await bundle('ssr','lazy',{resources:{Counter:'./not-emitted-or-read.mjs'}});
  assert.equal(output.filter(item=>item.type==='chunk').length,0);
  assert.doesNotMatch(output.find(item=>item.fileName==='index.html').source,/data-isle-|<script/);
});

test('eager policy includes resource code in the manifest closure', async () => {
  const output = await bundle('resume','eager');
  const manifest=JSON.parse(output.find(item=>item.fileName==='isle.manifest.json').source);
  assert.ok(planCodeLoad(manifest,manifest.loading.eager).references.includes('Counter.$resources'));
});

test('unknown component and invalid resource entry configurations fail at build time',async()=>{
  await assert.rejects(bundle('resume','lazy',{resources:{Missing:'./resource.mjs'}}),/interactive client component: Missing/);
  for(const resources of [null,[],{Counter:''},{Counter:1},{constructor:'./resource.mjs'}]){
    await assert.rejects(bundle('resume','lazy',{resources}),/Invalid resource entry configuration/);
  }
  for(const side of ['','server ','client '])await assert.rejects(bundle('resume','lazy',{},`${side}component Counter(initial:number){<p>{initial}</p>}`),/interactive client component: Counter/);
});

test('unused resource capability disappears from the app graph',async()=>{
  const output=await bundle('resume','lazy',{resources:{}});
  const javascript=output.filter(item=>item.type==='chunk').map(item=>item.code).join('\n');
  assert.doesNotMatch(javascript,/Resource component disposed|Resource owner disposed|Resource setup must be synchronous|MutationObserver|Unknown resource channel|Invalid resource input|\.resources\(/);
  const manifest=JSON.parse(output.find(item=>item.fileName==='isle.manifest.json').source);
  assert.equal(Object.values(manifest.references).some(entry=>entry.kind==='resource'),false);
});

test('unused resource channels disappear even from a resource-capable app',async()=>{
 const output=await bundle();
 assert.doesNotMatch(output.filter(item=>item.type==='chunk').map(item=>item.code).join('\n'),/Unknown resource channel|Invalid resource input|Resource subscriptions/);
});
test('a resource declaration requires an explicit setup provider in a resume build',async()=>{
 await assert.rejects(bundle('resume','lazy',{resources:{}},'client component Counter(initial:number){state n=initial;resource result(){receive(value:number){n=value;}}<div>{n}</div>}'),/Resource channels require a setup entry/);
});

test('primitive-only resource channels erase the structured sharing codec',async()=>{
 const output=await bundle('resume','lazy',{},'client component Counter(initial:number){state n=initial;resource result(){receive(value:number){n=value;}}<div>{n}</div>}');
 assert.doesNotMatch(output.filter(item=>item.type==='chunk').map(item=>item.code).join('\n'),/getOwnPropertyDescriptors|\.isFrozen\(/);
});
test('structured resource channels include the immutable snapshot codec',async()=>{
 const output=await bundle('resume','lazy',{},'schema Row{id:string;}client component Counter(initial:number){state rows:Row[]=[];resource result(){receive(value:Row[]){rows=value;}}<div>{rows.length}</div>}');
 assert.match(output.filter(item=>item.type==='chunk').map(item=>item.code).join('\n'),/getOwnPropertyDescriptors/);
});
