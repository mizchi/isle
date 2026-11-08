import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {prepareProgram} from '../lib/codegen.mjs';

const source=`schema Place {id:string;name:string;}
client component Map() {
 state query="";state alternate="";state rows:Place[]=[];state phase="idle";
 resource results(query) {
  receive(places:Place[],status:string) {rows=places;phase=status;}
 }
 event search(e:EventSnapshot<InputEvent>){query=e.value;}
 <main><input aria-label="Search" on:input={search}/><p>{phase}</p><For each={rows}>{(p)=><span key={p.id}>{p.name}</span>}</For></main>
}`;
test('resource results are typed, mutable, lazy entries with retained key slots and no DOM listener',()=>{
 const ir=requireIR(compile(source)),program=prepareProgram(ir),generated=program.get('Map').generate();
 assert.deepEqual(generated.events,['input']);
 assert.deepEqual(generated.channels,[{name:'results',keys:[['query',0]],input:{record:{places:{array:{record:{id:'string',name:'string'}}},status:'string'}},handler:'Map.results'}]);
 assert.ok(generated.handlers.find(h=>h.id==='Map.results').code.includes('event.data'));
 const rendered=program.get('Map').render({});
 assert.doesNotMatch(rendered.html,/data-isle-on-resource/);
 assert.ok(rendered.snapshot);
 assert.ok(generated.analysis.snapshotSlots.includes('rows'));
});
test('resource grammar rejects unsafe boundaries, invalid keys, shadowing and incompatible results',()=>{
 for(const [text,code] of [
  [source.replace('client component','component'),'E_RESOURCE_SIDE'],
  [source.replace('results(query)','results(missing)'),'E_RESOURCE_KEY'],
  [source.replace('results(query)','results(rows)'),'E_RESOURCE_KEY'],
  [source.replace('places:Place[]','places:string'),'E_STATE_TYPE'],
  [source.replace('rows=places;','places=[];'),'E_EVENT_READONLY'],
  [source.replace('status:string','query:string'),'E_EVENT_SIGNATURE'],
  [source.replace('rows=places;','rows=await places;'),'E_'],
  [source.replace('results(query)','results(phase)'),'E_RESOURCE_CYCLE'],
 ]) {const result=compile(text);assert.equal(result.ok,false,text);assert.ok(result.diagnostics.some(d=>d.code.startsWith(code)),JSON.stringify(result));}
});
test('resource input contract and keys participate in schema identity',()=>{
 const schema=text=>prepareProgram(requireIR(compile(text))).get('Map').generate().schemaId;
 assert.notEqual(schema(source),schema(source.replace('status:string','status:string,ignored:boolean')));
 assert.notEqual(schema(source),schema(source.replace('results(query)','results(alternate)')));
});

// This harness deliberately delays code independently of data and the owner queue.
import {createResourceChannels} from '../runtime/resource-channels.mjs';
import {createResourceOwner} from '../runtime/resource-owner.mjs';
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
function harness(load=async()=>()=>{}){
 const owner=createResourceOwner(),values=['old'],commits=[],errors=[];let queue=Promise.resolve();
 const channels=createResourceChannels(owner,[{name:'results',keys:[['query',0]],input:{record:{items:{array:'string'}}},handler:'receive'}],()=>values,load,(run,data,guard)=>{
  const task=queue.then(()=>{if(!guard())return false;commits.push(data);return true;});queue=task;return task;
 },error=>errors.push(error));
 const tasks=[],channel=channels.get('results');channel.subscribe(task=>{tasks.push(task);});
 return {owner,values,commits,errors,channels,channel,tasks};
}
test('resource key changes abort before resubscription; late data/code cannot commit (including ABA)',async()=>{
 const code=deferred(),h=harness(()=>code.promise);await Promise.resolve();
 const stale=h.tasks[0].publish({items:['old']});
 h.values[0]='new';h.channels.notify();assert.equal(h.tasks[0].signal.aborted,true);
 h.values[0]='old';h.channels.notify();const fresh=h.tasks.at(-1).publish({items:['fresh']});
 code.resolve(()=>{});assert.equal(await stale,false);assert.equal(await fresh,true);
 assert.deepEqual(h.commits,[{items:['fresh']}]);h.owner.dispose();
});
test('latest publication wins while code loads; caller mutation and invalid wire values cannot leak',async()=>{
 const code=deferred(),h=harness(()=>code.promise);await Promise.resolve();
 const input={items:['first']},first=h.tasks[0].publish(input);input.items[0]='mutated';
 const second=h.tasks[0].publish({items:['second']});code.resolve(()=>{});
 assert.equal(await first,false);assert.equal(await second,true);assert.deepEqual(h.commits,[{items:['second']}]);
 await assert.rejects(h.tasks[0].publish({items:['x'],extra:true}),/input/);
 let accesses=0;await assert.rejects(h.tasks[0].publish({get items(){accesses++;return [];}}),/input/);assert.equal(accesses,0);
 h.owner.dispose();assert.equal(await h.tasks[0].publish({items:[]}),false);
});
test('refresh revokes previous task, distinct owners stay independent and queued commits recheck disposal',async()=>{
 const h=harness(),other=harness();await Promise.resolve();
 h.channel.refresh();assert.equal(h.tasks[0].signal.aborted,true);assert.equal(other.tasks[0].signal.aborted,false);
 const result=h.tasks.at(-1).publish({items:['late']});h.owner.dispose();assert.equal(await result,false);
 assert.equal(await other.tasks[0].publish({items:['live']}),true);other.owner.dispose();
});

import {compilePreview} from '../lib/compiler-browser.mjs';
test('preview reports a missing resource host explicitly; SSR preview remains static',()=>{
 const result=compilePreview(source);assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,'E_PREVIEW_RESOURCE');
 assert.equal(compilePreview(source,{mode:'ssr'}).ok,true);
});
test('an obsolete task cannot invalidate a current publication; accepted input is detached',async()=>{
 const code=deferred(),h=harness(()=>code.promise);await Promise.resolve();
 h.channel.refresh();const input={items:['live']},fresh=h.tasks[1].publish(input);input.items[0]='mutated';
 assert.equal(await h.tasks[0].publish({items:['stale']}),false);
 await assert.rejects(h.tasks[1].publish({items:[123]}),/input/);code.resolve(()=>{});
 assert.equal(await fresh,true);assert.deepEqual(h.commits,[{items:['live']}]);h.owner.dispose();
});
test('bounded resource schedules check all completion orders and disposal positions',async()=>{
 const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
 for(const order of orders)for(let disposeAfter=0;disposeAfter<=3;disposeAfter++){
  const loads=[deferred(),deferred(),deferred()];let index=0;
  const h=harness(()=>loads[index++].promise);await Promise.resolve();const requests=[];
  for(let i=0;i<3;i++){if(i){h.values[0]=`q${i}`;h.channels.notify();}requests.push(h.tasks.at(-1).publish({items:[`q${i}`]}));}
  if(disposeAfter===0)h.owner.dispose();
  for(let i=0;i<3;i++){const done=order[i];loads[done].resolve(()=>{});await requests[done];if(i+1===disposeAfter)h.owner.dispose();}
  const expected=order.indexOf(2)<disposeAfter?[{items:['q2']}]:[];
  assert.deepEqual(h.commits,expected,JSON.stringify({order,disposeAfter}));h.owner.dispose();
 }
});
test('resource dependency cycles across declarations are rejected at compile time',()=>{
 const result=compile('client component Cycle(){state a="";state b="";resource one(a){receive(x:string){b=x;}}resource two(b){receive(y:string){a=y;}}<div>{a}{b}</div>}');
 assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,'E_RESOURCE_CYCLE');
});
test('resource names cannot collide with legacy entries or become DOM event handlers',()=>{
 for(const text of [source.replace('<main>','<main>on click results {}'),source.replace('on:input={search}','on:input={results}')]){
  const result=compile(text);assert.equal(result.ok,false);assert.ok(result.diagnostics.some(d=>['E_RESOURCE_DUPLICATE','E_EVENT_BINDING'].includes(d.code)),JSON.stringify(result));
 }
});
test('invalid async subscriptions are revoked and joined even when reporting throws',async()=>{
 const owner=createResourceOwner(),errors=[],failure=deferred();
 const channels=createResourceChannels(owner,[{name:'result',keys:[],input:{record:{n:'number'}},handler:'h'}],()=>[],async()=>()=>{},async()=>true,error=>{errors.push(error.message);throw Error('report failed');});
 let task;channels.get('result').subscribe(value=>{task=value;return failure.promise;});await Promise.resolve();
 assert.equal(task.signal.aborted,true);failure.resolve(Promise.reject(Error('late')));await channels.settled();
 assert.equal(errors.length,2);assert.match(errors[0],/synchronous/);assert.equal(errors[1],'late');owner.dispose();
});

import {resume} from '../runtime/client.mjs';
import {setImmediate} from 'node:timers/promises';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
async function controllerFixture(receiver,preparedReceiver){
 const key=`__isleResourceTest${Math.random().toString(36).slice(2)}`,gate=deferred(),state={gate:gate.promise,received:[],errors:[]};globalThis[key]=state;
 const directory=await mkdtemp(join(tmpdir(),'isle-channel-'));
 const url=async(name,source)=>{const path=join(directory,name+'.mjs');await writeFile(path,source);return pathToFileURL(path).href;};
 const document={baseURI:'https://example.test/',defaultView:{MutationObserver:class{observe(){}disconnect(){}}},createTreeWalker:()=>({nextNode:()=>null})};
 const element={isConnected:true,getAttribute:name=>name==='data-isle-root'?'owner':null,contains:()=>true},snapshot={getAttribute:()=> 'owner',textContent:JSON.stringify([2,'schema','owner',[0,0]])};
 const root={ownerDocument:document,contains:()=>true,querySelector:()=>null,querySelectorAll:selector=>selector==='[data-isle-root]'?[element]:[snapshot]};
 const setup=await url('setup',`export function setup({channel}){channel('result').subscribe(task=>{void task.publish({n:task.key.query});});}`);
 const code=receiver?await url('receiver',`await globalThis[${JSON.stringify(key)}].gate;export function run(v,set,t,a,r,e){globalThis[${JSON.stringify(key)}].received.push(e.data.n);set(1,e.data.n);}`):'data:,invalid';
 const prepared={start:(v,set)=>set(0,1),...(preparedReceiver?{receive:(v,set,t,a,r,e)=>{state.received.push(e.data.n);set(1,e.data.n);}}:{})};
 const controller=resume(root,[{schema:['number','number']},['click'],{start:['data:,invalid','run',[0,1]],receive:[code,'run',[0,1]]},[],'https://example.test/',prepared,{schema:[setup,'setup',[]]},{schema:[{name:'result',keys:[['query',0]],input:{record:{n:'number'}},handler:'receive'}]}],{onError:error=>state.errors.push(error)});
 return {controller,element,state,gate,async release(){controller.close();delete globalThis[key];await rm(directory,{recursive:true,force:true});}};
}
test('settled joins receiver loads created by a queued activation and their subsequent commits',async()=>{
 const h=await controllerFixture(true,false);let done=false;
 h.controller.dispatch(h.element,h.element,'owner','start',{type:'click'});
 const settled=h.controller.settled().then(()=>{done=true;});await setImmediate();await setImmediate();assert.deepEqual(h.state.errors,[]);assert.equal(done,false);
 h.gate.resolve();await settled;assert.deepEqual(h.state.errors,[]);assert.deepEqual(h.state.received,[1]);await h.release();
});
test('resource receivers honor prepared eager code without importing their lazy reference',async()=>{
 const h=await controllerFixture(false,true);
 h.controller.dispatch(h.element,h.element,'owner','start',{type:'click'});await h.controller.settled();
 assert.deepEqual(h.state.errors,[]);assert.deepEqual(h.state.received,[1]);await h.release();
});
test('revocation cleanup may dispose the owner or refresh reentrantly without starting an obsolete task',async()=>{
 const h=harness();await Promise.resolve();h.tasks[0].owner.own(null,()=>h.owner.dispose());
 assert.doesNotThrow(()=>h.channel.refresh());assert.equal(h.tasks.length,1);
 const next=harness();await Promise.resolve();next.tasks[0].owner.own(null,()=>next.channel.refresh());
 next.channel.refresh();assert.equal(next.tasks.length,2);assert.equal(next.tasks[1].signal.aborted,false);next.owner.dispose();
});

test('unchanged deeply frozen input retains a detached immutable snapshot across publications and task refresh',async()=>{
 const h=harness();await Promise.resolve();const items=Object.freeze(['stable']);
 await h.tasks[0].publish({items});const first=h.commits[0].items;
 assert.notEqual(first,items);assert.equal(Object.isFrozen(first),true);
 await h.tasks[0].publish({items});assert.equal(h.commits[1].items,first);
 h.channel.refresh();await h.tasks[1].publish({items});assert.equal(h.commits[2].items,first);
 h.owner.dispose();
});
test('a shallow freeze never caches mutable descendants and a consumer cannot poison retained snapshots',async()=>{
 const owner=createResourceOwner(),messages=[],tasks=[];
 const channels=createResourceChannels(owner,[{name:'r',keys:[],input:{record:{items:{array:{record:{name:'string'}}}}},handler:'r'}],()=>[],async()=>()=>{},async(run,data)=>{messages.push(data);return true;},()=>{});
 channels.get('r').subscribe(task=>{tasks.push(task);});await Promise.resolve();
 const row={name:'first'},items=Object.freeze([row]);
 await tasks[0].publish({items});row.name='second';await tasks[0].publish({items});
 assert.equal(messages[0].items[0].name,'first');assert.equal(messages[1].items[0].name,'second');assert.notEqual(messages[0].items,messages[1].items);
 Object.freeze(row);await tasks[0].publish({items});const cached=messages[2].items;
 assert.throws(()=>{cached[0].name='poison';},TypeError);assert.throws(()=>{cached.push({name:'poison'});},TypeError);
 await tasks[0].publish({items});assert.equal(messages[3].items,cached);assert.equal(cached[0].name,'second');owner.dispose();
});
