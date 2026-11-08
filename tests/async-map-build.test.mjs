import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMap} from '../tools/async-map-bundle.mjs';
import {planCodeLoad} from '../runtime/manifest.mjs';

test('map code is lazy, resource dependencies share the cold closure, and details remain optional',async()=>{
  const output=await buildMap(),manifest=JSON.parse(output.find(item=>item.fileName==='isle.manifest.json').source);
  assert.ok(manifest.references['Explorer.activate'].requires.includes('Explorer.$resources'));
  assert.deepEqual(Object.keys(manifest.references).filter(id=>manifest.references[id].kind==='handler').sort(),['Explorer.activate','Explorer.filter','Explorer.results','Explorer.search']);
  const details=Object.keys(manifest.chunks).find(file=>file.includes('detail-view'));
  const plan=planCodeLoad(manifest,['Explorer.activate']);assert.ok(!plan.modules.includes(manifest.chunks[details].url));
  assert.ok(output.some(item=>item.fileName.includes('places-')&&item.fileName.endsWith('.json')));
  const html=output.find(item=>item.fileName==='index.html').source;assert.match(html,/Start exploring/);assert.match(html,/data-isle-snapshot/);assert.doesNotMatch(html,/data-isle-on-resource/);
  assert.equal(manifest.references['Explorer.results'].event,'resource');
});
test('SSR-only map omits the adapter, data assets, snapshots and all JavaScript',async()=>{
  const output=await buildMap('ssr'),html=output.find(item=>item.fileName==='index.html').source;
  assert.deepEqual(output.filter(item=>item.type==='chunk'),[]);assert.doesNotMatch(html,/data-isle-|type="module"/);
  assert.equal(output.some(item=>/places-|details-/.test(item.fileName)),false);assert.ok(output.some(item=>item.fileName.endsWith('.svg')));
});
