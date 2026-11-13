import '../packages/css-verifier/test/target-ids.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compile as browserCompile,compilePreview} from '../lib/compiler-browser.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {declaredLayoutOptions} from '../lib/layout-declarations.mjs';
import {verifyDeclaredNoShift} from '../lib/layout-noshift-node.mjs';
import {tokenize} from '../playground/highlight.mjs';

const legacy=await readFile(new URL('../examples/layout-contracts/noshift.isle',import.meta.url),'utf8');
const source=legacy.replace('noshift ".action";','').replace('<button class="action"','<button @noshift class="action"');
const run=async text=>{const ir=requireIR(compile(text));return verifyDeclaredNoShift(ir,analyzeLayout(ir,declaredLayoutOptions(ir,{component:'Panel',css:''})));};

test('DOM requirements retain exact source identity and erase from all executable output',()=>{
  assert.ok(tokenize(source,'isle').some(token=>token.kind==='attribute' && token.text==='@noshift'));
  const result=compile(source);assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(browserCompile(source),result);
  const requirement=result.ir.components[0].layout.noshift[0];
  assert.equal(source.slice(requirement.source.start,requirement.source.end),'@noshift');
  assert.equal(typeof requirement.nodeId,'string');
  const checked=compilePreview(source),plain=compilePreview(source.replace('@noshift',''));
  assert.equal(checked.ok,true);
  for(const key of ['html','snapshotHtml','modules','entries','schemas','events']) assert.deepEqual(checked.preview[key],plain.preview[key]);
  assert.deepEqual(checked.preview.styles.map(row=>row.css),plain.preview.styles.map(row=>row.css));
  assert.doesNotMatch(JSON.stringify(checked.preview),/@noshift|data-compiler-requirement|noshift\.\d/);
});

test('DOM requirements use stable IDs rather than class selectors',async()=>{
  assert.equal((await run(source)).status,'verified');
  const rename=source.replace('class="action"','class={expanded ? "action changed" : "action"}');
  assert.equal((await run(rename)).status,'verified');
  const moved=await run(source.replace('height:80px;display:grid','display:grid'));
  assert.equal(moved.status,'violated');assert.equal(moved.checks.find(row=>row.change).change.delta.exact,'56');
});

test('a replacement element cannot satisfy another source site requirement',async()=>{
  const a='<button @noshift class="action" type="button" aria-label="Toggle panel" on:click={toggle}/>';
  const b='<button class="action" type="button" aria-label="Toggle panel" on:click={toggle}/>';
  const text=source.replace(a,`<Show when={expanded} fallback={${b}}>${a}</Show>`);
  const result=await run(text);
  assert.equal(result.status,'violated');
  assert.equal(result.checks.find(row=>row.status==='violated').proof.witness.code,'E_NOSHIFT_PRESENCE');
});

test('multiple identical classes can carry separate element requirements',async()=>{
  const text=source.replace('<button @noshift','<div class="action" @noshift/><button @noshift');
  const result=await run(text);
  assert.equal(result.status,'verified');assert.equal(result.checks[0].targets.length,2);
});

test('annotations reject computed, duplicate, foreign and undeclared requirements',()=>{
  for(const annotation of ['@noshift={true}','@noshift="true"','@noshift @noshift','@unknown','data-compiler-requirement="fake"']) {
    const result=compile(source.replace('@noshift',annotation));
    assert.equal(result.ok,false);assert.match(result.diagnostics[0].code,/^E_LAYOUT_/);
  }
  assert.equal(compile('component C(){<div @noshift/>}').ok,false);
  assert.equal(compile(source.replace('<button @noshift','<Fragment @noshift').replace('on:click={toggle}/>','on:click={toggle}/>')).ok,false);
});

test('repeated DOM requirements verify with an exact key correspondence',async()=>{
  const button='<button @noshift class="action" type="button" aria-label="Toggle panel" on:click={toggle}/>';
  const text=source.replace(button,`<For each={[1]}>{item=><div key={item} @noshift class="action"/>}</For>`);
  const result=await run(text);
  assert.equal(result.status,'verified');
  assert.equal(result.checks[0].identities[0].keys[0].value,1);
});

test('requirements survive pure and client composition with instance-local ID scopes',async()=>{
  for(const side of ['', 'client ']) {
    const child=`${side}component Child(){layout SafeGrid{requires{inline-size:320px..960px;block-size:32px..720px;}}
      <div @noshift><style>*{box-sizing:border-box;margin:0;padding:0}div{height:32px}</style></div>}`;
    let parent=source.replace(' @noshift','').replace('<button class="action"','<Child/><button class="action"');
    if(side) parent=parent.replace('state expanded=false;','').replace('event toggle(e:EventSnapshot<MouseEvent>){expanded=!expanded;}','').replace('class={expanded ? "content expanded" : "content"}','class="content"').replace(' on:click={toggle}','');
    const stable=await run(child+parent);
    assert.equal(stable.status,'verified');assert.ok(stable.checks.length>0);
    if(side) continue; // Client islands inside For are rejected by the existing region backend.
    const repeated=parent.replace('<Child/>','<For each={[1]}>{item=><Child key={item}/>}</For>');
    const result=await run(child+repeated);
    assert.equal(result.status,'verified');
    assert.equal(result.checks[0].identities[0].keys[0].value,1);
  }
});

test('private requirement transport is rejected even without other extended syntax',()=>{
  const result=compile('component C(){<div data-compiler-requirement="forged"/>}');
  assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,'E_LAYOUT_INTERNAL');
  const many=source.replace('<button @noshift','<div @noshift/>'.repeat(32)+'<button @noshift');
  assert.equal(compile(many).ok,false);
});
