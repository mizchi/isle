import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compilePreview} from '../lib/compiler-browser.mjs';
import {prepareProgram} from '../lib/codegen.mjs';
import {createPreviewDocument} from '../lib/preview.mjs';
import {analyzeLayout} from '../lib/layout.mjs';

const source=`component Four(){<main class="row">
  <style>
    * { box-sizing:border-box; margin:0; }
    .row { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); }
    .cell { min-width:40px; background:#cde; }
  </style>
  <div class="cell"/><div class="cell"/><div class="cell"/><div class="cell"/>
</main>}`;

test('template style blocks compile to scoped CSS, with no style element or executable CSS in the view',()=>{
  const ir=requireIR(compile(source)),rendered=prepareProgram(ir).render('Four',{}, {mode:'ssr'});
  assert.ok(rendered.styles?.length);assert.match(rendered.styles[0].css,/min-width:40px/);
  assert.doesNotMatch(rendered.html,/<style|grid-template/);
  assert.match(rendered.html,/class="row i_[a-f0-9]+"/);
  assert.match(rendered.styles[0].css,/:is\(\.cell\)\.i_/);
  assert.equal(ir.components[0].root.children.length,4);
  const preview=compilePreview(source,{mode:'ssr'});assert.equal(preview.ok,true,JSON.stringify(preview));
  const document=createPreviewDocument(preview.preview);
  assert.match(document,/min-width:40px/);assert.doesNotMatch(document,/<script|data-isle-on/);
});

test('inline styles feed the same rational layout model as external CSS',()=>{
  const ir=requireIR(compile(source));
  assert.equal(analyzeLayout(ir,{css:'',viewport:{min:160,max:640}}).status,'verified');
  assert.equal(analyzeLayout(ir,{css:'',viewport:{min:100,max:640}}).status,'violated');
});

test('styles remain scoped across pure component expansion, client owners and repeated instances',()=>{
  const ir=requireIR(compile(`component Child(){<p><style>p{color:red}</style>Child</p>}
    component Unused(){<aside><style>aside{color:orange}</style>Unused</aside>}
    component Page(){<main><style>p{color:blue}</style><Child/><Child/><p>Parent</p></main>}`));
  const rendered=prepareProgram(ir).render('Page',{}, {mode:'ssr'});
  assert.equal(rendered.styles.length,2);assert.doesNotMatch(JSON.stringify(rendered.styles),/orange/);
  assert.equal(new Set(rendered.styles.map(s=>s.id)).size,2);
  assert.notEqual(ir.components[0].style.scope,ir.components[2].style.scope);
});

test('media/container blocks and CSS strings are raw CSS rather than template expressions',()=>{
  const css='@media (width < 160px){.row{grid-template-columns:repeat(2,minmax(0,1fr));}}';
  const ir=requireIR(compile(source.replace('  </style>',css+'  </style>')));
  assert.equal(analyzeLayout(ir,{css:'',viewport:{min:80,max:640}}).status,'verified');
  assert.equal(compile('component C(){<p><style>p{font-family:"event @if { }"}</style>Text</p>}').ok,true);
});

test('CSS errors point into authored source; global loaders and dynamic style blocks are rejected',()=>{
  for(const [style,code] of [
    ['<style>.x{ color: red;</style>','E_CSS_SYNTAX'],
    ['<style src="x.css">.x{color:red}</style>','E_CSS_SYNTAX'],
    ['<style>@import "https://outside.invalid/x.css";</style>','E_CSS_CAPABILITY'],
    ['<Show when={true}><style>p{color:red}</style></Show>','E_CSS_PLACEMENT'],
  ]) {
    const input=`component C(){<main>${style}<p>Text</p></main>}`,result=compile(input);
    assert.equal(result.ok,false,input);assert.equal(result.diagnostics[0].code,code,JSON.stringify(result));
    assert.ok(result.diagnostics[0].start>=input.indexOf('<style'));
    assert.ok(result.diagnostics[0].end<=input.length);
  }
});
