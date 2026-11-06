import test from 'node:test';
import assert from 'node:assert/strict';
import {compile, requireIR} from '../lib/compiler.mjs';
import {compile as compileBrowser, compilePreview} from '../lib/compiler-browser.mjs';
import {prepareProgram} from '../lib/codegen.mjs';
import {readFile} from 'node:fs/promises';

const counter=`client component Counter(initial:number){
  state count=initial;
  event increment(e:EventSnapshot<MouseEvent>){count+=1;}
  <section><output>{count}</output><button type="button" on:click.preventDefault={increment}>Increment</button></section>
}`;
test('named events compile in Node and the browser, preserving declaration and binding locations',()=>{
  const result=compile(counter);assert.deepEqual(result,compileBrowser(counter));
  const ir=requireIR(result);assert.deepEqual(ir.components.map(c=>c.name),['Counter']);
  const handler=ir.components[0].root.children[1].handlers[0];
  assert.equal(handler.id,'increment');assert.equal(handler.preventDefault,true);
  assert.match(counter.slice(handler.source.start,handler.source.end),/^event increment/);
  assert.equal(counter.slice(handler.binding.start,handler.binding.end).trim(),'on:click.preventDefault={increment}');
  const program=prepareProgram(ir),render=program.render('Counter',{initial:5},{scopeId:'c'});
  assert.match(render.html,/data-isle-on-click="c\|Counter.increment\|p"/);
  assert.doesNotMatch(program.render('Counter',{initial:5},{mode:'ssr'}).html,/on:|data-isle-|event increment/);
  assert.equal(program.get('Counter').generate().handlers[0].preventDefault,true);
  assert.equal(compilePreview(counter,{props:{initial:5}}).ok,true);
});

test('typed snapshots support explicit aliases and void control elements',()=>{
  const ir=requireIR(compile(`client component Input(){state text="";state key="";
    event edit(e:EventSnapshot<InputEvent>){text=e.value;}
    event press(k:EventSnapshot<KeyboardEvent>){key=k.key;}
    <section><label for="field">Text</label><input id="field" type="text" on:input={edit} on:keydown={press}/><p>{text} / {key}</p></section>}`));
  assert.equal(ir.components[0].root.children[1].handlers.length,2);
  assert.match(prepareProgram(ir).render('Input',{}).html,/data-isle-on-input=/);
});

test('row capture arguments are explicit, typed, and never introduce compiler helpers into output',()=>{
  const source=`schema Item{id:string;title:string;} client component Rows(items:Item[]){state selected="";
    event select(e:EventSnapshot<MouseEvent>, id:string){selected=id;}
    <section><output>{selected}</output><ul><For each={items}>{(item)=><li key={item.id}><button type="button" on:click={(e)=>select(e,item.id)}>{item.title}</button></li>}</For></ul></section>}`;
  const ir=requireIR(compile(source)),program=prepareProgram(ir);
  assert.deepEqual(ir.components.map(c=>c.name),['Rows']);
  assert.doesNotMatch(JSON.stringify(ir),/IsleEventProof/);
  const generated=program.get('Rows').generate();assert.equal(generated.handlers.length,1);
  assert.match(generated.handlers[0].code,/\["id"\]/);
  assert.match(program.render('Rows',{items:[{id:'a',title:'A'}]}).html,/data-isle-on-click=/);
});

test('each binding has a unique entry while reading current owner slots',()=>{
  const ir=requireIR(compile(`client component C(){state n=0;
    event add(e:EventSnapshot<MouseEvent>, amount:number){n+=amount;}
    <section><button on:click={(e)=>add(e,1)}>One</button><button on:click={(e)=>add(e,2)}>Two</button><output>{n}</output></section>}`));
  const handlers=prepareProgram(ir).get('C').generate().handlers;
  assert.equal(handlers.length,2);assert.equal(new Set(handlers.map(h=>h.id)).size,2);
  assert.ok(handlers.every(h=>h.writes.includes('n')));
  assert.ok(handlers.every(h=>h.declaration==='add'));
  assert.doesNotMatch(JSON.stringify(ir),/IsleEventProof/);
});

test('two events on the same element retain distinct capture arguments',()=>{
  const source='client component C(){state selected="";event choose(e:EventSnapshot<Event>,id:string){selected=id;}<section><label for="t">Text</label><input id="t" type="text" on:input={(e)=>choose(e,"input")} on:change={(e)=>choose(e,"change")}/><output>{selected}</output></section>}';
  const ir=requireIR(compile(source)),handlers=ir.components[0].root.children[1].handlers;
  assert.deepEqual(handlers.map(h=>h.statements[0].value.value),['input','change']);
});

test('async declarations retain the explicit server boundary and async check',async()=>{
  const action=(await readFile(new URL('../examples/counter/app.isle',import.meta.url),'utf8')).split('export client component')[0];
  const source=`${action} client component Editor(id:string,initial:string){state title=initial;
    async event save(e:EventSnapshot<MouseEvent>){title=(await remote renameDocument({id,title:title+"!"})).title;}
    <button on:click={save}>{title}</button>}`;
  const ir=requireIR(compile(source)),handler=prepareProgram(ir).get('Editor').generate().handlers[0];
  assert.equal(handler.async,true);assert.deepEqual(handler.actions,['renameDocument']);
  assert.equal(ir.actions[0].policy.name,'policy.documentEditor');
  assert.equal(compile(source.replace('async event','event')).ok,false);
});

test('comments do not change the declaration phase or explicit parameter types',()=>{
  const source='client /* phase */ component C(){state n=0;event /* entry */ unused(e /* input */ : EventSnapshot<MouseEvent>){n+=1;}<p>Static</p>}';
  assert.equal(compile(source).ok,true,JSON.stringify(compile(source)));
});

test('destructured props remain available to typed event inputs and captured arguments',()=>{
  const source='client component C({initial}:{initial:string}){state text=initial;event edit(e:EventSnapshot<InputEvent>, suffix:string){text=e.value+suffix;}<section><label for="t">Text</label><input id="t" type="text" on:input={(e)=>edit(e,initial)}/><output>{text}</output></section>}';
  assert.equal(compile(source).ok,true,JSON.stringify(compile(source)));
});

test('the authoring evaluation fixture compiles and contains only consumer components',async()=>{
  const source=await readFile(new URL('../evals/scenarios/event-declarations/fixture.isle',import.meta.url),'utf8');
  const ir=requireIR(compile(source));assert.deepEqual(ir.components.map(c=>c.name),['Picker']);
  assert.equal(compilePreview(source,{props:{items:[{id:'a',title:'A'}]}}).ok,true);
});

test('event declarations have lexical scope even when attached within a For',()=>{
  const result=compile(`client component C(xs:string[]){state selected="";
    event choose(e:EventSnapshot<MouseEvent>){selected=item;}
    <ul><For each={xs}>{(item)=><li key={item}><button on:click={choose}>Choose</button></li>}</For></ul>}`);
  assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,'E_UNKNOWN_NAME');
});

test('unused declarations are checked and erased',()=>{
  const good=compile('client component C(){state n=0;event unused(e:EventSnapshot<MouseEvent>){n+=1;}<p>Static</p>}');
  assert.equal(good.ok,true,JSON.stringify(good));
  assert.equal(prepareProgram(good.ir).get('C').generate().handlers.length,0);
  const bad=compile('client component C(){state n=0;event unused(e:EventSnapshot<MouseEvent>){n=missing;}<p>Static</p>}');
  assert.equal(bad.ok,false);assert.equal(bad.diagnostics[0].code,'E_UNKNOWN_NAME');
});

test('capture aliases cannot hide computations that may throw before the body',()=>{
  const result=compile('client component C(xs:number[]){state n=0;derive first=xs[0];event pick(e:EventSnapshot<MouseEvent>, value:number){n+=1;}<button on:click={(e)=>pick(e,first)}>{n}</button>}');
  assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,'E_EVENT_CAPTURE');
});

test('capture substitution avoids collection variable capture',()=>{
  const source=`schema Item{id:string;} client component Rows(items:Item[]){state values:Item[]=[];
    event choose(e:EventSnapshot<MouseEvent>, id:string){values=items.map(item=>({id:id+item.id}));}
    <ul><For each={items}>{(item)=><li key={item.id}><button on:click={(e)=>choose(e,item.id)}>Choose</button></li>}</For></ul>}`;
  const ir=requireIR(compile(source)),handler=ir.components[0].root.children[0].children[0].children[0].handlers[0];
  assert.equal(handler.statements[0].value.kind,'collection');
  const collection=handler.statements[0].value;
  assert.notEqual(collection.parameter,'item');
  assert.equal(collection.body.fields[0].value.left.object.name,'item');
  assert.equal(collection.body.fields[0].value.right.object.name,collection.parameter);
});

test('row bindings cannot shadow owner dependencies hidden behind a derive',()=>{
  const result=compile(`client component C(xs:number[]){state n=1;derive doubled=n*2;
    event add(e:EventSnapshot<MouseEvent>){n=doubled;}
    <ul><For each={xs}>{(n)=><li key={n}><button on:click={add}>Add</button></li>}</For></ul>}`);
  assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,'E_DUPLICATE');
});

test('invalid event contracts report located diagnostics',()=>{
  const cases=[
    ['event add(){n+=1;}','on:click={add}','E_EVENT_SIGNATURE'],
    ['event add(e:MouseEvent){n+=1;}','on:click={add}','E_EVENT_SIGNATURE'],
    ['event add(e:Event Snapshot<MouseEvent>){n+=1;}','on:click={add}','E_EVENT_SIGNATURE'],
    ['event add(e:EventSnapshot<KeyboardEvent>){n+=1;}','on:click={add}','E_EVENT_TYPE'],
    ['event add(e:EventSnapshot<MouseEvent>){e.preventDefault();}','on:click={add}','E_EVENT_PHASE'],
    ['event add(e:EventSnapshot<MouseEvent>){n+=1;}','on:click.stopPropagation={add}','E_EVENT_MODIFIER'],
    ['event add(e:EventSnapshot<MouseEvent>){n+=1;}','on:click={missing}','E_EVENT_REFERENCE'],
    ['event add(e:EventSnapshot<MouseEvent>){n+=1;}','on:click={(e)=>{add(e);}}','E_EVENT_BINDING'],
    ['event add(e:EventSnapshot<MouseEvent>, amount:number){n+=amount;}','on:click={(e)=>add(e,"wrong")}','E_EVENT_ARGUMENT'],
    ['event add(e:EventSnapshot<MouseEvent>, amount:number){n+=1;}','on:click={(e)=>add(e,"wrong")}','E_EVENT_ARGUMENT'],
    ['event add(e:EventSnapshot<MouseEvent>, amount:number){n+=amount;}','on:click={(e)=>add(e,n)}','E_EVENT_CAPTURE'],
    ['event add(e:EventSnapshot<MouseEvent>, amount:number){amount=1;}','on:click={(e)=>add(e,1)}','E_EVENT_READONLY'],
    ['event add(e:EventSnapshot<MouseEvent>){n+=1;}','on:click={add} on:click={add}','E_EVENT_DUPLICATE'],
  ];
  for(const [declaration,binding,code] of cases){
    const source=`client component C(){state n=0;${declaration}<button ${binding}>Go</button>}`;
    const result=compile(source);assert.equal(result.ok,false,source);
    assert.equal(result.diagnostics[0].code,code,JSON.stringify(result));
    assert.ok(result.diagnostics[0].start>=0 && result.diagnostics[0].end<=source.length);
  }
});
