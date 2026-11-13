import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {init, killThreads} from 'z3-solver';
import {compile, requireIR} from '../lib/compiler.mjs';
import {compile as browserCompile, compilePreview} from '../lib/compiler-browser.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {declaredLayoutOptions} from '../lib/layout-declarations.mjs';
import {createLayoutIR, createDeclaredObligations, verifyObligationIR, createContractIR, createRefinementObligationIR} from '../lib/layout-contract.mjs';

const api = await init();
after(() => killThreads(api.em));
const declaration = `layout PositionedGrid {
  requires { inline-size: 320px..960px; block-size: 240px..720px; }
  space map = ".map";
  overlay ".controls" within map;
  ensures { overflow-inline: fit; overflow-block: fit; }
}`;
const css = `*{box-sizing:border-box;margin:0;padding:0}
.map{position:relative;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);height:240px;padding:16px;border:2px solid black}
.surface{min-width:0;min-height:0}
.controls{position:absolute;right:16px;bottom:16px;width:40px;height:40px}`;
const source = (sheet = css, body = '<div class="surface"/><div class="controls"/>', contract = declaration) =>
  `component Map(){${contract}<section class="map"><style>${sheet}</style>${body}</section>}`;
async function inspect(input = source(), options = {}) {
  const ir = requireIR(compile(input));
  const report = analyzeLayout(ir, declaredLayoutOptions(ir, {css: '', ...options}));
  const proofs = [];
  for (const obligation of createDeclaredObligations(createLayoutIR(report))) proofs.push(await verifyObligationIR(obligation, api));
  return {ir, report, proofs};
}
const status = result => result.proofs[0].status;

test('PositionedGrid lowers equally in Node/browser and erases from SSR and resume modules', () => {
  const input = source(), result = compile(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(browserCompile(input), result);
  const contract = result.ir.components[0].layout.contract;
  assert.equal(contract.profile.id, 'positioned-grid/1');
  assert.deepEqual(contract.spaces, [{name: 'map', selector: '.map'}]);
  assert.deepEqual(contract.overlays, [{selector: '.controls', within: 'map'}]);
  assert.ok(Object.isFrozen(createContractIR({component:'Map', profile:'positioned-grid/1', requires:{inlineSize:{min:320,max:960},blockSize:{min:240,max:720}}, spaces:contract.spaces, overlays:contract.overlays}).spaces));
  const plain = compilePreview(source(css, undefined, '')), checked = compilePreview(input);
  assert.equal(checked.ok, true);
  assert.equal(checked.preview.html, plain.preview.html);
  assert.deepEqual(checked.preview.modules, plain.preview.modules);
  const interactive=source(css,'<div class="surface"/><div class="controls"/><output>{count}</output>')
    .replace('component Map(){','client component Map(){state count=0;event add(e:EventSnapshot<MouseEvent>){count+=1;}')
    .replace('<section class="map"','<section on:click={add} class="map"');
  const active=compilePreview(interactive),without=compilePreview(interactive.replace(declaration,''));
  assert.equal(active.ok,true);assert.ok(active.preview.modules.length>0);
  assert.equal(active.preview.html,without.preview.html);
  assert.deepEqual(active.preview.modules,without.preview.modules);
});

test('closed grammar rejects invalid spaces, dangling bindings, effects and SafeGrid extensions', () => {
  for (const bad of [
    declaration.replace('space map = ".map";', 'space map = ".map"; space map = ".surface";'),
    declaration.replace('within map', 'within absent'),
    declaration.replace('".controls"', '".map .controls"'),
    declaration.replace('".map"', 'select()'),
    declaration.replace('space map = ".map";', ''),
    declaration.replace('overlay ".controls" within map;', ''),
    declaration.replace('PositionedGrid', 'SafeGrid'),
  ]) {
    const result = compile(source(css, undefined, bad));
    assert.equal(result.ok, false, bad);
    assert.match(result.diagnostics[0].code, /^E_LAYOUT_/);
  }
});

test('actual padding-box geometry is independent of the contract and excludes absolute Grid contributions', async () => {
  const {report, proofs} = await inspect();
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics));
  assert.equal(proofs[0].status, 'verified', JSON.stringify(proofs[0]));
  const control = report.sizes.find(box => box.path === 'Map/1');
  assert.equal(control.position, 'absolute');
  assert.equal(control.containingBlock.path, 'Map');
  assert.deepEqual(control.origin.inline, {coefficient:'1',constant:'-60'});
  assert.deepEqual(control.origin.block, {coefficient:'0',constant:'180'});
  assert.deepEqual(control.containingBlock.inline, {coefficient:'1',constant:'-4'});
  const plain = await inspect(source(css, undefined, declaration.replace('space map = ".map";', 'space map = ".surface";')));
  assert.deepEqual(plain.report.sizes, report.sizes, 'Contracts must not alter extracted geometry');
  assert.equal(status(plain), 'violated');
  const noHeight = await inspect(source(css.replace('height:240px;', '').replace('grid-template-rows:minmax(0,1fr);', 'grid-template-rows:none;'), '<div class="controls"/>'));
  assert.notEqual(status(noHeight), 'verified', 'absolute children cannot provide the parent auto height');
});

test('percentages use each containing-block axis; affine calc, negative starts and end overflow have witnesses', async () => {
  const percent = await inspect(source(css.replace('right:16px;bottom:16px;', 'left:25%;top:25%;')));
  assert.equal(status(percent), 'verified');
  const control = percent.report.sizes.find(box => box.position === 'absolute');
  assert.deepEqual(control.origin.inline, {coefficient:'1/4',constant:'-1'});
  assert.deepEqual(control.origin.block, {coefficient:'0',constant:'59'});
  for (const offsets of ['left:-8px;top:16px;', 'left:calc(100% - 20px);top:16px;']) {
    const bad = await inspect(source(css.replace('right:16px;bottom:16px;', offsets)));
    assert.equal(status(bad), 'violated');
    assert.match(bad.proofs[0].proof.witness.code, /E_LAYOUT_ABSOLUTE/);
  }
});

test('binding validation detects an intervening positioned parent even when the box fits', async () => {
  const body = '<div class="frame"><div class="controls"/></div>';
  const result = await inspect(source(css + '.frame{position:relative;display:grid;width:180px;height:120px}', body));
  assert.equal(result.report.status, 'verified');
  assert.equal(status(result), 'violated');
  assert.equal(result.proofs[0].proof.witness.code, 'E_LAYOUT_SPACE_BINDING');
  assert.equal(result.report.sizes.find(box => box.position === 'absolute').containingBlock.path, 'Map/0');
  const inherited = await inspect(source(css + '.frame{display:grid;width:180px;height:120px}', body));
  assert.equal(status(inherited), 'verified', 'a static intermediary does not create a positioning space');
  const explicit = await inspect(source(css + '.frame{position:relative;display:grid;width:180px;height:120px}', body, declaration.replace('space map = ".map"','space map = ".frame"')));
  assert.equal(status(explicit),'verified','an explicitly named inner coordinate space is supported');
});

test('peer separation is solved at fractional responsive widths without weakening containment', async () => {
  const sheet = css.replace('right:16px;bottom:16px;', 'left:16px;top:16px;') + '.other{position:absolute;right:16px;top:16px;width:40px;height:40px}';
  const contract = declaration.replace('320px..960px', '115.5px..960px').replace('overlay ".controls" within map;', 'overlay ".controls" within map; overlay ".other" within map;');
  const body = '<div class="surface"/><div class="controls"/><div class="other"/>';
  const bad = await inspect(source(sheet, body, contract));
  assert.equal(bad.report.status, 'verified');
  assert.equal(status(bad), 'violated');
  assert.equal(bad.proofs[0].proof.witness.code, 'E_LAYOUT_OVERLAY_OVERLAP');
  assert.ok(bad.proofs[0].proof.witness.viewport < 116);
  assert.equal(status(await inspect(source(sheet, body, contract.replace('115.5px', '116px')))), 'verified');
  const responsive = sheet + '@media(width < 116px){.other{top:72px}}';
  assert.equal(status(await inspect(source(responsive, body, contract))), 'verified');
});

test('missing, ambiguous, undeclared and non-absolute bindings cannot verify vacuously', async () => {
  for (const input of [
    source(css, undefined, declaration.replace('".map"', '".missing"')),
    source(css, undefined, declaration.replace('".controls"', '".missing"')),
    source(css, '<div class="surface map"/><div class="controls"/>'),
    source(css + '.extra{position:absolute;left:0;top:0;width:20px;height:20px}', '<div class="surface"/><div class="controls"/><div class="extra"/>'),
    source(css.replace('position:absolute;', 'position:static;')),
  ]) assert.notEqual(status(await inspect(input)), 'verified');
});

test('unsupported coordinate semantics and weakened profiles stay Unknown or rejected', async () => {
  for (const extra of [
    '.map{transform:translateX(1px)}', '.map{will-change:transform}', '.map{contain:layout}',
    '.map{overflow:auto}', '.controls{margin:auto}', '.controls{left:8px}',
    '.controls{grid-column:1}', '.controls{width:auto}', '.controls{height:auto}',
    '.map{left:8px}', '.controls{position:fixed}', '.controls{left:var(--unknown)}',
  ]) {
    const result = await inspect(source(css + extra));
    assert.equal(status(result), 'unknown', extra);
  }
  const safe = await inspect(source(css, undefined, declaration.replace('PositionedGrid', 'SafeGrid').replace(/  (?:space|overlay)[^\n]+\n/g, '')));
  assert.notEqual(status(safe), 'verified');
  const positioned = (await inspect()).ir.components[0].layout.contract;
  assert.throws(() => createRefinementObligationIR(positioned, {...positioned, spaces:[{name:'map',selector:'.other'}]}), /refinement|binding/i);
});

test('conformance checks position facts and coverage, independently from cached geometry checks', async () => {
  const {report,ir}=await inspect();
  const layout=createLayoutIR(report),contract=ir.components[0].layout.contract;
  const {createObligationIR}=await import('../lib/layout-contract.mjs');
  const changed={...layout,boxes:layout.boxes.map(box=>box.position!=='absolute' ? box : {...box,origin:{...box.origin,inline:{coefficient:'0',constant:'1000'}}})};
  assert.equal((await verifyObligationIR(createObligationIR(contract,changed),api)).status,'violated');
  const missing={...layout,boxes:layout.boxes.map(box=>box.position!=='absolute' ? box : {...box,origin:undefined})};
  assert.equal((await verifyObligationIR(createObligationIR(contract,missing),api)).status,'unknown');
});

test('finite Show cases and CSS-hidden overlays remain covered without inventing active boxes',async()=>{
  const hidden=await inspect(source(css+'@media(width < 480px){.controls{display:none}}'));
  assert.equal(status(hidden),'verified');
  const input=source(css,'<div class="surface"/><Show when={visible}><div class="controls"/></Show>')
    .replace('component Map(){','client component Map(){state visible=true;event hide(e:EventSnapshot<MouseEvent>){visible=false;}')
    .replace('<section class="map"','<section on:click={hide} class="map"');
  const result=await inspect(input);
  assert.equal(result.report.structure.variants.length,2);
  assert.equal(status(result),'verified');
});

test('bounded For overlays check every live instance, including the empty case',async()=>{
  const input=source(css,'<div class="surface"/><For each={items}>{(item)=><Fragment key={item}><div class="controls"/></Fragment>}</For>')
    .replace('component Map(){','client component Map(){state items=[0];event add(e:EventSnapshot<MouseEvent>){items=items.length<2 ? items.concat([items.length]) : items;}event clear(e:EventSnapshot<MouseEvent>){items=[];}')
    .replace('<section class="map"','<section on:click={add} on:dblclick={clear} class="map"');
  const result=await inspect(input);
  assert.equal(result.report.structure.variants.length,3);
  assert.equal(status(result),'violated');
  assert.equal(result.proofs[0].proof.witness.code,'E_LAYOUT_OVERLAY_OVERLAP');
});

test('container conditions use content size while absolute percentages use padding size',async()=>{
  const sheet=css+'.map{container:map / size}@container map (width < 400px){.controls{right:25%}}';
  const result=await inspect(source(sheet));
  assert.equal(status(result),'verified');
  const positions=result.report.sizes.filter(box=>box.position==='absolute');
  assert.ok(positions.some(box=>box.range.max===436 && !box.range.maxInclusive));
  assert.ok(positions.some(box=>box.origin.inline.coefficient==='3/4' && box.origin.inline.constant==='-43'));
});

test('absolute geometry from a separate component owner is not silently exempted',async()=>{
  const child='component Child(){<div class="controls"><style>.controls{box-sizing:border-box;position:absolute;right:16px;bottom:16px;width:40px;height:40px}</style></div>}';
  const result=await inspect(child+source(css,'<div class="surface"/><Child/>'),{component:'Map'});
  assert.equal(status(result),'unknown');
  assert.equal(result.proofs[0].coverage.witness.code,'U_LAYOUT_POSITIONED_OWNER');
});
