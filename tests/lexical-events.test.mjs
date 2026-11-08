import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compilePreview} from '../lib/compiler-browser.mjs';
import {prepareProgram} from '../lib/codegen.mjs';
import {readFile} from 'node:fs/promises';
import {childrenOf} from '../lib/template.mjs';

const source = await readFile(new URL('../evals/scenarios/lexical-events/fixture.isle',import.meta.url),'utf8');
const all = node => [node,...childrenOf(node).flatMap(all)];

test('parent-owned buttons project through conditional universal children inside For', () => {
  const ir=requireIR(compile(source)),program=prepareProgram(ir),owner=ir.components.find(c=>c.name==='Reviews');
  assert.equal(all(owner.root).some(n=>n.kind==='slot'),false);
  assert.deepEqual(all(owner.root).filter(n=>n.handlers?.length).map(n=>n.tag),['button']);
  const generated=program.get('Reviews').generate();
  assert.deepEqual(generated.handlers.map(h=>h.id),['Reviews.toggle']);
  assert.deepEqual(generated.fields.map(f=>f.name),['reviews','clicks']);
  assert.deepEqual(program.reachable('Reviews'),['Reviews']);
  const preview=compilePreview(source);
  assert.equal(preview.ok,true,JSON.stringify(preview.diagnostics));
  const resume=program.render('Reviews',{});
  assert.equal((resume.html.match(/data-isle-root=/g) ?? []).length,1);
  assert.equal((resume.html.match(/data-isle-on-click=/g) ?? []).length,2);
  assert.doesNotMatch(resume.snapshotHtml,/RenderFragment|children|toggle/);
  const ssr=program.render('Reviews',{}, {mode:'ssr'});
  assert.match(ssr.html,/<p>Open<\/p>/);
  assert.doesNotMatch(ssr.html,/data-isle-|<script|<!--[rte]:/);
  // An unprovided fragment remains empty, including a standalone pure render.
  assert.equal(program.render('ReviewCard',{id:'x',title:'X',done:true}).html,'<article data-review="x"><h2>X</h2><p>Done</p></article>');
});

test('projection cannot pass an owner event into another client or server boundary', () => {
  for (const target of [
    'client component Target(children:RenderFragment){<section>{children}</section>}',
    'server component Target(children:RenderFragment){<section>{children}</section>}',
  ]) {
    const result=compile(`${target} component Wrap(children:RenderFragment){<Target>{children}</Target>}
      client component C(){state n=0;event add(e:EventSnapshot<MouseEvent>){n+=1;}
      <main><Wrap><button type="button" on:click={add}>{n}</button></Wrap></main>}`);
    assert.equal(result.ok,false);
    assert.equal(result.diagnostics[0].code,'E_COMPONENT_PHASE');
  }
  const crossing=compile(`client component Target(children:RenderFragment){<section>{children}</section>}
    client component C(){state n=0;event add(e:EventSnapshot<MouseEvent>){n+=1;}
    <main><Target><button type="button" on:click={add}>Add</button></Target></main>}`);
  assert.equal(crossing.ok,false);
  assert.equal(crossing.diagnostics[0].code,'E_COMPONENT_CAPTURE');
});

test('universal projection preserves caller locals across receiver loops and lambdas', () => {
  const nested=`schema Row{id:string;}
    component Card(rows:Row[],label:string,children:RenderFragment){
      derive labels=rows.map(row=>({id:label+row.id}));
      <article><For each={labels}>{(row)=><section key={row.id}><h2>{row.id}</h2>{children}</section>}</For></article>
    }
    client component C(rows:Row[]){state selected="";
      event choose(e:EventSnapshot<MouseEvent>,id:string){selected=id;}
      <main><For each={rows}>{(row)=><Card key={row.id} rows={rows} label={row.id}>
        <button type="button" data-caller={row.id} on:click={(e)=>choose(e,row.id)}>Choose</button>
      </Card>}</For><output>{selected}</output></main>}`;
  const ir=requireIR(compile(nested)),program=prepareProgram(ir);
  const html=program.render('C',{rows:[{id:'a'},{id:'b'}]},{mode:'ssr'}).html;
  assert.deepEqual([...html.matchAll(/<h2>(.*?)<\/h2>/g)].map(m=>m[1]),['aa','ab','ba','bb']);
  assert.deepEqual([...html.matchAll(/data-caller="(.*?)"/g)].map(m=>m[1]),['a','a','b','b']);
  const loops=all(ir.components.find(c=>c.name==='C').root).filter(n=>n.kind==='each');
  assert.notEqual(loops[0].item,loops[1].item);
});

test('receiver error binders cannot capture a caller prop or its projected event argument',()=>{
  const text=`component Card(xs:number[],children:RenderFragment){
    <article><ErrorBoundary fallback={(error)=><section><p>{error}</p>{children}</section>}><p>{xs[0]}</p></ErrorBoundary></article>
  }
  client component C(error:string){state selected="";event choose(e:EventSnapshot<MouseEvent>,id:string){selected=id;}
    <main><Card xs={[]}><button type="button" data-caller={error} on:click={(e)=>choose(e,error)}>Choose</button></Card><output>{selected}</output></main>
  }`;
  const program=prepareProgram(requireIR(compile(text)));
  const rendered=program.render('C',{error:'caller'}, {mode:'ssr'});
  assert.match(rendered.html,/<p>Render failed<\/p>/);
  assert.match(rendered.html,/data-caller="caller"/);
});

test('projected async entries retain row captures and the explicit authorized server action',async()=>{
  const action=(await readFile(new URL('../examples/counter/app.isle',import.meta.url),'utf8')).split('export client component')[0];
  const text=`${action}
    component Card(title:string,children:RenderFragment){<article><h2>{title.trim()}</h2>{children}</article>}
    client component Editor(ids:string[],initial:string){state title=initial;
      async event save(e:EventSnapshot<MouseEvent>,id:string){title=(await remote renameDocument({id,title:title+"!"})).title;}
      <main><For each={ids}>{(id)=><Card key={id} title={title}>
        <button type="button" on:click={(e)=>save(e,id)}>Save</button>
      </Card>}</For></main>
    }`;
  const ir=requireIR(compile(text)),handler=prepareProgram(ir).get('Editor').generate().handlers[0];
  assert.equal(handler.id,'Editor.save');
  assert.equal(handler.async,true);
  assert.deepEqual(handler.actions,['renameDocument']);
  assert.equal(ir.actions[0].policy.name,'policy.documentEditor');
  assert.deepEqual(handler.writes,['title']);
});
