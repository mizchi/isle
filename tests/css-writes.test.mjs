import test from 'node:test';
import assert from 'node:assert/strict';
import {findCSSWriteConflicts} from '../lib/css-writes.mjs';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compile as compileBrowser} from '../lib/compiler-browser.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {formatLayoutSummary} from '../lib/layout-summary.mjs';
import {readFile} from 'node:fs/promises';

test('shorthand write sets include omitted and reset-only longhands in either order',()=>{
  for(const [shorthand,longhand] of [
    ['padding','padding-left'],['padding-inline','padding-inline-start'],['margin','margin-block-end'],
    ['gap','column-gap'],['overflow','overflow-y'],['container','container-type'],
    ['border','border-image-source'],['border','border-left-color'],['border-inline','border-inline-end-width'],
    ['border-color','border-left-color'],['border-radius','border-top-left-radius'],
    ['background','background-size'],['background','background-position-x'],
    ['font','font-weight'],['font','line-height'],['font','font-variation-settings'],['font','font-variant-emoji'],
    ['font','font-stretch'],['font-variant','font-variant-caps'],['font-synthesis','font-synthesis-style'],
    ['outline','outline-width'],['grid','grid-auto-flow'],['grid-template','grid-template-areas'],
    ['grid-area','grid-column-start'],['place-items','align-items'],['flex','flex-basis'],
    ['text-decoration','text-decoration-color'],['transition','transition-duration'],
  ]) for(const props of [[shorthand,longhand],[longhand,shorthand]]) {
    const conflicts=findCSSWriteConflicts(props);
    assert.equal(conflicts.length,1,props.join(';'));
    assert.deepEqual([conflicts[0].earlier,conflicts[0].later],[0,1]);
    assert.ok(conflicts[0].longhands.length);
  }
});

test('logical/physical overlap considers writing modes without conflating disjoint logical axes',()=>{
  for(const props of [['padding-inline','padding-top'],['padding-block','padding-left'],['border-block','border-right-color']])
    assert.equal(findCSSWriteConflicts(props).length,1,props.join(';'));
  for(const props of [
    ['padding-inline','padding-block'],['padding-inline','padding-block-start'],
    ['border','border-radius'],['border-inline','border-block'],['outline','outline-offset'],
    ['font','font-palette'],['font','font-synthesis'],['padding','padding'],['color','color'],
  ]) assert.deepEqual(findCSSWriteConflicts(props),[],props.join(';'));
});

test('all excludes custom properties, direction and unicode-bidi; names decode CSS escapes',()=>{
  for(const props of [['all','color'],['unknown-future-property','all'],['PADDING','padding-left'],['p\\61 dding','padding-left']])
    assert.equal(findCSSWriteConflicts(props).length,1,props.join(';'));
  assert.deepEqual(findCSSWriteConflicts(['all','direction','unicode-bidi','--x','--X']),[]);
  assert.deepEqual(findCSSWriteConflicts(['--padding','padding','--Padding']),[]);
});

test('native and browser source compilers reject conflicts at both authored declarations',()=>{
  const source='component C(){<main><style>\n.box {\n  font-weight:700;\n  font:16px sans-serif;\n}\n</style>Text</main>}';
  for(const compiler of [compile,compileBrowser]) {
    const result=compiler(source);
    assert.equal(result.ok,false);
    const d=result.diagnostics[0];
    assert.equal(d.code,'E_CSS_SHORTHAND_CONFLICT');
    assert.equal(source.slice(d.start,d.end),'font:16px sans-serif');
    assert.equal(source.slice(d.related[0].start,d.related[0].end),'font-weight:700');
    assert.match(d.message,/font-weight/);assert.match(d.hint,/separate rule/i);
  }
});

test('strict intent checking is value/order independent but leaves explicit rule boundaries intact',()=>{
  const source=css=>`component C(){<main><style>${css}</style>Text</main>}`;
  for(const css of [
    '.x{padding-left:0!important;padding:var(--missing)}',
    '.x{padding:initial;padding-left:0}',
    '.x{background:var(--paint);background-color:red}',
    '@media(width < 500px){.x{gap:0;column-gap:2px}}',
    '.x{padding:0;padding-left:0}',
  ]) assert.equal(compile(source(css)).diagnostics[0]?.code,'E_CSS_SHORTHAND_CONFLICT',css);
  for(const css of [
    '.x{padding:0}.x{padding-left:24px}',
    '*{padding:0}@media(width < 500px){.x{padding-left:24px}}',
    '.x{padding:0;padding:var(--insets)}',
  ]) assert.equal(compile(source(css)).ok,true,css);
});

test('checked external and reset CSS reject conflicts with file, column and related location',()=>{
  const ir=requireIR(compile('component C(){<main class="box">Text</main>}'));
  const css='.box {\n  padding-left:24px;\n  padding:0;\n}';
  for(const options of [{css,cssFile:'app.css'},{css:'',reset:[{css,file:'reset.css'}]}]) {
    const report=analyzeLayout(ir,{...options,viewport:{min:320,max:320}});
    assert.equal(report.status,'violated');
    const d=report.diagnostics.find(d=>d.code==='E_CSS_SHORTHAND_CONFLICT');
    assert.equal(d.severity,'error');assert.deepEqual(d.css,{file:options.cssFile??'reset.css',line:3,column:3});
    assert.deepEqual(d.related[0].css,{file:options.cssFile??'reset.css',line:2,column:3});
    assert.deepEqual(d.conflict.longhands,['padding-left']);
    const summary=formatLayoutSummary(report,{file:'app.isle',source:''});
    assert.match(summary,/:3:3/);assert.match(summary,/:2:3/);
  }
});

test('shorthand examples show a rejected hidden reset and an explicit accepted override',async()=>{
  const accepted=await readFile(new URL('../examples/inline-css/shorthands.isle',import.meta.url),'utf8');
  const rejected=await readFile(new URL('../examples/inline-css/rejected/shorthand.isle',import.meta.url),'utf8');
  assert.equal(compile(accepted).ok,true);
  assert.equal(compile(rejected).diagnostics[0].code,'E_CSS_SHORTHAND_CONFLICT');
});
