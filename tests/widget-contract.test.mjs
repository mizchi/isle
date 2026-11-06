import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWidgetDescriptor, resolveWidgetSource } from '../runtime/widget-contract.mjs';
const runtime = { version: '0.0.1', mode: 'shared' };

test('descriptor resolves assets and action transport relative to its own URL', () => {
  const descriptor = resolveWidgetDescriptor({ version: 2, runtime, html: '<p>SSR</p>', module: '../assets/app.js', preload: ['../assets/runtime.js'], actions: '../api/' }, 'https://cdn.example/package/components/card.json');
  assert.equal(descriptor.module, 'https://cdn.example/package/assets/app.js');
  assert.deepEqual(descriptor.preload, ['https://cdn.example/package/assets/runtime.js']);
  assert.equal(descriptor.actions, 'https://cdn.example/package/api/');
  assert.equal(resolveWidgetDescriptor({ version: 2, runtime, html: '', module: './app.js', preload: [] }, 'https://cdn.example/widget.json').actions, 'https://cdn.example/__isle/');
  assert.equal(resolveWidgetSource({ descriptorURL: 'https://cdn.example/components/card.json' }), 'https://cdn.example/components/card.json');
  assert.equal(resolveWidgetSource({ src: 'https://cdn.example/package/' }), 'https://cdn.example/package/widget.json');
});
test('static descriptors have no code; malformed boundaries fail before importing', () => {
  const base = { version: 2, runtime, html: '<p>Static</p>', module: null, preload: [] };
  assert.equal(resolveWidgetDescriptor(base, 'https://cdn.example/static.json').module, null);
  for (const patch of [{ module: 42 }, { version: 1 }, { runtime: undefined }, { html: {} }, { preload: [42] }, { preload: ['./code.js'] }, { actions: 'javascript:alert(1)' }]) {
    assert.throws(() => resolveWidgetDescriptor({ ...base, ...patch }, 'https://cdn.example/static.json'));
  }
  assert.throws(() => resolveWidgetDescriptor({ ...base, module: 'https://other.example/app.js' }, 'https://cdn.example/widget.json'), /provider/);
  assert.throws(() => resolveWidgetSource({ src: 'https://cdn.example/', descriptorURL: 'https://cdn.example/card.json' }), /one/);
});

test('descriptor version and distribution mode must match the mounting runtime', () => {
  const base = { version: 2, runtime, html: '', module: null, preload: [] };
  assert.throws(() => resolveWidgetDescriptor(base, 'https://cdn.example/widget.json', { version: '0.0.2', mode: 'shared' }), /version mismatch/);
  assert.throws(() => resolveWidgetDescriptor(base, 'https://cdn.example/widget.json', { version: '0.0.1', mode: 'standalone' }), /mode mismatch/);
});

test('CSS preloads stay on the provider and are forbidden for static descriptors',()=>{
  const base={version:2,runtime,html:'',module:'./app.js',preload:[],preloadStyles:['./theme.css','./theme.css']};
  const resolved=resolveWidgetDescriptor(base,'https://cdn.example/embed/widget.json');
  assert.deepEqual(resolved.preloadStyles,['https://cdn.example/embed/theme.css']);
  for(const patch of [{preloadStyles:['https://other.example/theme.css']},{preloadStyles:[1]},{preloadStyles:'theme.css'},{module:null}])assert.throws(()=>resolveWidgetDescriptor({...base,...patch},'https://cdn.example/widget.json'));
});
