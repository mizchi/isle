import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceBindings } from '../runtime/resource-bindings.mjs';
import { resume } from '../runtime/client.mjs';
import { setImmediate } from 'node:timers/promises';

function bindings(resolve, onError = () => {}) {
  const live = new Set(['parent','child']);
  const root = { ownerDocument: { defaultView: { MutationObserver: class { observe() {} disconnect() {} } } } };
  const nodes = new Map([['parent',[{},null]],['child',[{},'parent']]]);
  let manager;
  const dispose = id => { live.delete(id); if (id === 'parent') live.delete('child'); manager.dispose(id); };
  manager = createResourceBindings(root,nodes,{schema:['./setup.mjs','setup',[]]},resolve,id=>live.has(id),dispose,onError);
  return { manager, dispose, live };
}

test('a failed setup import can be retried and initialization is per owner', async () => {
  let attempts=0, starts=0;
  const {manager} = bindings(async()=>{ if (++attempts===1) throw Error('offline'); return ()=>{starts++;}; });
  await assert.rejects(manager.prepare('schema'),/offline/);
  const setup=await manager.prepare('schema');
  manager.activate('parent',setup);manager.activate('parent',setup);manager.activate('child',setup);
  assert.equal(attempts,2);assert.equal(starts,2);manager.close();
});

test('reentrant disposal in setup revokes the owner and cleans registrations once', async () => {
  const {manager,dispose,live}=bindings();let releases=0;
  assert.throws(()=>manager.activate('parent',({owner})=>{
    owner.own(1,()=>{assert.equal(live.size,0);releases++;});dispose('parent');
  }),/disposed/);
  manager.close();await manager.settled();assert.equal(releases,1);
});

test('invalid async setup is joined even when the diagnostics callback throws', async () => {
  let reject, reported=0;
  const {manager}=bindings(undefined,()=>{reported++;throw Error('diagnostics failed');});
  assert.throws(()=>manager.activate('parent',()=>new Promise((_,fail)=>{reject=fail;})),/must be synchronous/);
  reject(Error('late setup error'));
  await manager.settled();assert.equal(reported,1);
});

test('prototype properties never resolve a setup entry', () => {
  const {manager}=bindings(()=>{throw Error('unexpected import');});
  assert.equal(manager.prepare('constructor'),undefined);manager.close();
});

test('invalid snapshots fail before starting a handler or setup import',async()=>{
  const errors=[],id='owner';
  const element={isConnected:true,getAttribute:name=>name==='data-isle-root'?id:null,contains:()=>true};
  const snapshot={getAttribute:()=>id,textContent:JSON.stringify([2,'schema',id,['forged']])};
  const root={baseURI:'https://example.test/',contains:()=>true,querySelector:()=>null,querySelectorAll:selector=>selector==='[data-isle-root]'?[element]:[snapshot]};
  const controller=resume(root,[{schema:['number']},['click'],{add:['data:,unsupported','run',[0]]},[],'https://example.test/',null,{schema:['data:,unsupported','setup',[]]}],{onError:error=>errors.push(error.message)});
  controller.dispatch(element,element,id,'add',{type:'click'});
  await controller.settled();await setImmediate();
  assert.deepEqual(errors,['Invalid state slot 0']);controller.close();
});
