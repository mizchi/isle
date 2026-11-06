import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compilePreview} from '../lib/compiler-browser.mjs';
import {prepareProgram} from '../lib/codegen.mjs';
import {analyzeLayout} from '../lib/layout.mjs';

const header='schema Item { id: string; title: string; } component Row(item: Item) { <li data-key={item.id}>{item.title}</li> }';
const source=`${header}
client component List(initial: Item[]) {
  state items: Item[] = initial;
  state visible = true;
  state mode = "list";
  <section>
    <button type="button">on click hide { visible = false; }Hide</button>
    <button type="button">on click reverse { items = [items[1], items[0]]; }Reverse</button>
    <Show when={visible} fallback={<p>Hidden</p>}><p>Visible</p></Show>
    <Switch fallback={<p>Other</p>}>
      <Match when={mode === "list"}><p>List</p></Match>
      <Match when={mode === "summary"}><p>Summary</p></Match>
    </Switch>
    <ul><For each={items} fallback={<li>No rows</li>}>{(item) => <Row key={item.id} item={item} />}</For></ul>
    <ErrorBoundary fallback={(error) => <p>{error}</p>}><p>{items[0].title}</p></ErrorBoundary>
  </section>
}`;
test('control components lower to checked regions without runtime wrappers',()=>{
  const ir=requireIR(compile(source));
  assert.equal(ir.components.at(-1).root.children.filter(node=>node.kind==='select').length,1,'the immutable mode branch is folded');
  assert.equal(ir.components.at(-1).root.children.at(-1).kind,'boundary');
  for(const initial of [[{id:'a',title:'First'},{id:'b',title:'Second'}],[]]) {
    const html=prepareProgram(ir).render('List',{initial},{mode:'ssr'}).html;
    assert.match(html,/>Visible<\/p><p>List<\/p>/);
    assert.match(html,initial.length ? /data-key="a">First/ : /No rows<\/li><\/ul><p>Render failed/);
    assert.doesNotMatch(html,/<(?:For|Show|Fragment|Switch|Match|ErrorBoundary)\b|\skey=/);
  }
  assert.ok(compilePreview(source,{props:{initial:[]}}).ok);
});

test('a keyed Fragment groups multiple row roots without a DOM wrapper or forwarded key prop',()=>{
  const source=`${header} component List(items:Item[]){<ul><For each={items}>{(item,index) => (
    <Fragment key={item.id}><Row item={item}/><li data-extra={item.id}>{index}</li></Fragment>
  )}</For></ul>}`;
  const ir=requireIR(compile(source)),each=ir.components.at(-1).root.children[0];
  assert.equal(each.kind,'each');assert.equal(each.index,'index');assert.equal(each.children.length,2);
  const html=prepareProgram(ir).render('List',{items:[{id:'a',title:'A'}]},{mode:'ssr'}).html;
  assert.equal(html,'<ul><li data-key="a">A</li><li data-extra="a">0</li></ul>');
});

test('all branches are checked and inactive fallback templates are lazy',()=>{
  const good='component Page(items:number[]){<main><Show when={true} fallback={<p>{items[100]}</p>}><p>Ready</p></Show></main>}';
  assert.equal(prepareProgram(requireIR(compile(good))).render('Page',{items:[]},{mode:'ssr'}).html,'<main><p>Ready</p></main>');
  for(const [input,code] of [
    ['component C(){<main><Show when={true} fallback={<p>{missing}</p>}><p>OK</p></Show></main>}','E_UNKNOWN_NAME'],
    ['component C(){<main><Show when={1}><p>OK</p></Show></main>}','E_CONTROL_TYPE'],
    ['component C(xs:number[]){<main><For each={xs}>{(x,index) => <p key={index}>{x}</p>}</For></main>}','E_CONTROL_KEY'],
  ]) {const result=compile(input);assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,code,JSON.stringify(result));}
});

test('control contracts reject ambiguous keys, arbitrary render functions and malformed builtins',()=>{
  for(const [template,code] of [
    ['<For each={xs}>{(x) => <p>{x}</p>}</For>','E_CONTROL_KEY'],
    ['<For each={xs}>{(x) => <div><p key={x}>{x}</p></div>}</For>','E_CONTROL_KEY'],
    ['<For each={xs}>{renderRow}</For>','E_CONTROL_CHILDREN'],
    ['<For each={xs}>{(x) => { return <p key={x}>{x}</p>; }}</For>','E_CONTROL_CHILDREN'],
    ['<For each={xs}>{(x) => <><p key={x}>{x}</p></>}</For>','E_CONTROL_KEY'],
    ['<For each={xs} keyBy="id">{(x) => <p key={x}>{x}</p>}</For>','E_CONTROL_PROP'],
    ['<For each={xs}>{(x) => <p key={x} key={x}>{x}</p>}</For>','E_CONTROL_KEY'],
    ['<p key={1}>Outside row</p>','E_CONTROL_KEY'],
    ['<Fragment key={1}><p>Outside row</p></Fragment>','E_CONTROL_KEY'],
    ['<Match when={true}><p>Outside switch</p></Match>','E_CONTROL_CONTEXT'],
    ['<Switch><p>Not a Match</p></Switch>','E_CONTROL_CHILDREN'],
    ['<Show when={true} when={false}><p>Duplicate</p></Show>','E_CONTROL_PROP'],
    ['<Show when={true} keyed><p>Unsupported identity contract</p></Show>','E_CONTROL_PROP'],
  ]) {const result=compile(`component C(xs:number[]){<main>${template}</main>}`);assert.equal(result.ok,false,template);assert.equal(result.diagnostics[0].code,code,JSON.stringify(result));}
});

test('handler and element spans still point at original UTF-16 source after control lowering',()=>{
  const input='client component C(){state n=0;<main><Show when={n===0}><p>日本語🌊</p></Show><button type="button">on click add { n += 1; }Add</button></main>}';
  const ir=requireIR(compile(input)),button=ir.components[0].root.children.at(-1);
  assert.equal(input.slice(button.source.start,button.source.end),'<button');
  const span=button.handlers[0].source;assert.equal(input.slice(span.start,span.end),'on click add { n += 1; }');
});

test('Fragments are transparent to label ownership and reserved intrinsic names cannot be shadowed',()=>{
  const input='component C(xs:number[]){<main><For each={xs}>{(x) => <Fragment key={x}><label for="field">Value</label><Fragment><input id="field" type="text" /></Fragment></Fragment>}</For></main>}';
  assert.equal(compile(input).ok,true,JSON.stringify(compile(input)));
  assert.equal(compile('component Show(){<p>Shadow</p>}').diagnostics[0].code,'E_CONTROL_RESERVED');
});

test('layout checking still enumerates every bounded row count, including the empty fallback',()=>{
  const source='client component C(){state items=[0];<main class="root">on click {items=items.length<4 ? items.concat([items.length]) : items;}on dblclick {items=[];}<For each={items} fallback={<div class="wide"/>}>{(item) => <div key={item} class="cell"/>}</For></main>}';
  const ir=requireIR(compile(source));
  const css='*{box-sizing:border-box;margin:0}.root{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:40px}.cell{min-width:40px}.wide{min-width:140px}';
  const report=analyzeLayout(ir,{css,viewport:{min:100,max:300,height:{min:200,max:600}}});
  assert.equal(report.status,'violated');assert.equal(report.structure.complete,true);
  assert.deepEqual(report.structure.bounds.find(row=>row.state==='items').length,{min:0,max:4});
  assert.equal(report.structure.variants.length,5);
  assert.equal(analyzeLayout(ir,{css,viewport:{min:140,max:300,height:{min:200,max:600}}}).status,'verified');
});

test('quoted markup is unchanged and nested controls preserve transparent fragments',()=>{
  const input='client component C(){state label="<For each={xs}>";state n=0;<main>on click {n+=1;}<Show when={n>0}><Show when={n>1} fallback={"Waiting"}><Fragment><p>{label}</p><><p>Nested</p></></Fragment></Show></Show></main>}';
  const ir=requireIR(compile(input));assert.equal(ir.components[0].states[0].initial.value,'<For each={xs}>');
  assert.equal(prepareProgram(ir).render('C',{}, {mode:'ssr'}).html,'<main></main>');
  assert.equal(compile('component C(){<Show when={true}><p>Missing owner</p></Show>}').diagnostics[0].code,'E_CONTROL_ROOT');
  const constant='component C(){<main><Fragment><p>A</p><p>B</p></Fragment></main>}';
  assert.equal(prepareProgram(requireIR(compile(constant))).render('C',{}, {mode:'ssr'}).html,'<main><p>A</p><p>B</p></main>');
});
