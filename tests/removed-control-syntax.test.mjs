import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compilePreview} from '../lib/compiler-browser.mjs';
import {prepareProgram} from '../lib/codegen.mjs';

test('removed template directives fail at their original UTF-16 token with a migration hint',()=>{
  for(const directive of ['@if(true){<p>A</p>}','@if/* gap */(true){<p>A</p>}','@else{<p>B</p>}','@for(const x of xs;key x){<p>{x}</p>}','@empty{<p>Empty</p>}','@switch(1){@case 1:{<p>A</p>}}','@case 1:{<p>A</p>}','@default:{<p>B</p>}','@try{<p>A</p>}@catch(e){<p>B</p>}','@catch(e){<p>B</p>}','@pending{<p>Wait</p>}']) {
    const source=`component C(xs:number[]){<main><p>日本語🌊</p>${directive}</main>}`;
    const result=compile(source);assert.equal(result.ok,false,directive);
    const diagnostic=result.diagnostics[0];assert.equal(diagnostic.code,'E_CONTROL_REMOVED',JSON.stringify(result));
    assert.equal(diagnostic.start,source.indexOf('@'));assert.match(diagnostic.hint,/Show|For|Switch|ErrorBoundary/);
    assert.match(source.slice(diagnostic.start,diagnostic.end),/^@\w+$/);
    assert.equal(compilePreview(source).stage,'compile');
  }
});

test('removal applies inside new control bodies and fallback templates, without a legacy fast path',()=>{
  for(const body of ['<Show when={true}>@if(true){<p>A</p>}</Show>','<Show when={false} fallback={<div>@try{<p>A</p>}@catch(e){<p>B</p>}</div>}><p>B</p></Show>','<For each={xs}>{x=><div key={x}>@if(true){<p>A</p>}</div>}</For>']) {
    const result=compile(`component C(xs:number[]){<main>${body}</main>}`);
    assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,'E_CONTROL_REMOVED');
  }
});

test('email text, strings, comments and CSS-like data are not template directives',()=>{
  const source='component C(){derive text="@if(true){literal}";/* @for(x){} */<main><p>a@if.example / @for.example / @unknown</p><p>{text}</p><p>{"@media"}</p></main>}';
  const html=prepareProgram(requireIR(compile(source))).render('C',{}, {mode:'ssr'}).html;
  assert.match(html,/a@if\.example/);assert.match(html,/@if\(true\)\{literal\}/);assert.match(html,/@media/);
});

test('source cannot inject the private generated-control transport',()=>{
  const result=compile('component C(){<main>\u001fif(true){<p>A</p>}</main>}');
  assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,'E_CONTROL_INTERNAL');
});
