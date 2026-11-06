import test from 'node:test';
import assert from 'node:assert/strict';
import {compilePreview} from '../lib/compiler-browser.mjs';
import {parse} from 'parse5';

test('preview documents escape stylesheet/script boundaries and restrict network access',async()=>{
  const {createPreviewDocument}=await import('../lib/preview.mjs');
  const compiled=compilePreview('component Hello(){<p>Hello</p>}');
  const html=createPreviewDocument(compiled.preview,{css:'p{color:red}/* </style><script>alert(1)</script> */'});
  assert.match(html,/connect-src &#39;none&#39;/);
  const scripts=node=>Number(node.tagName==='script')+(node.childNodes ?? []).reduce((n,child)=>n+scripts(child),0);
  assert.equal(scripts(parse(html)),0);
  assert.match(html,/<\\\/style>/);
});
test('interactive documents require a self-contained runtime and SSR never includes it',async()=>{
  const {createPreviewDocument}=await import('../lib/preview.mjs');
  const source='client component C(){state n=0;<button>on click {n+=1;}{n}</button>}';
  const compiled=compilePreview(source);
  assert.throws(()=>createPreviewDocument(compiled.preview),/runtime/i);
  const html=createPreviewDocument(compiled.preview,{runtimeSource:'export const x="</script>";',token:'test'});
  assert.equal((html.match(/<script type="module">/g) ?? []).length,1);
  assert.match(html,/\\u003c\/script>/);
  const ssr=createPreviewDocument(compilePreview(source,{mode:'ssr'}).preview,{runtimeSource:'throw Error("must not run")'});
  assert.doesNotMatch(ssr,/must not run|<script/);
});
test('mounting always sets an opaque sandbox before changing srcdoc',async()=>{
  const {mountPreview}=await import('../lib/preview.mjs');
  const calls=[],frame={setAttribute(name,value){calls.push([name,value]);},set srcdoc(value){calls.push(['srcdoc',value]);}};
  const token=mountPreview(frame,compilePreview('component C(){<p>Hi</p>}').preview);
  assert.equal(typeof token,'string');
  assert.deepEqual(calls[0],['sandbox','allow-scripts allow-forms']);
  assert.ok(!calls[0][1].includes('allow-same-origin'));
  assert.equal(calls.at(-1)[0],'srcdoc');
});
test('module linking changes import declarations, never application string literals',async()=>{
  const {rewritePreviewImports}=await import('../runtime/preview.mjs');
  const source='import { prepare } from "virtual:isle-regions/C";\nexport const label="virtual:isle-regions/C";';
  const rewritten=rewritePreviewImports(source,()=> 'blob:null/test');
  assert.match(rewritten,/from "blob:null\/test"/);
  assert.match(rewritten,/label="virtual:isle-regions\/C"/);
});
