import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';

const source = 'export component Four() { <main class="row"><div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div></main> }';
const css = '*{box-sizing:border-box;margin:0}.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)}.cell{min-width:40px}';
const responsive = '@media(width < 160px){.row{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}';
const viewport = { min:80, max:300, height:{ min:200, max:600 } };
const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><!--isle:ssr--></body></html>';
const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-build-'));
  t.after(() => rm(directory, { recursive:true, force:true }));
  await Promise.all([
    writeFile(join(directory, 'app.isle'), overrides.source ?? source),
    writeFile(join(directory, 'app.css'), overrides.css ?? css + responsive),
    writeFile(join(directory, 'index.html'), overrides.html ?? html),
    writeFile(join(directory, 'package.json'), '{"type":"module"}'),
  ]);
  const options = { entry:join(directory, 'app.isle'), mounts:[{component:'Four',props:{}}], wrapMounts:false,
    layout:{css:'./app.css',viewport}, ...overrides.options };
  return () => build({configFile:false,root:directory,base:overrides.base ?? './',logLevel:'silent',plugins:[isle(options),...(overrides.plugins ?? [])],build:{write:false}});
}
const artifact = (output, name) => output.output.find(item => item.fileName === name);

test('checked build rejects the fractional responsive gap instead of sampling breakpoints', async t => {
  const run = await fixture(t, {css:css + responsive.replace('160px','159px')});
  await assert.rejects(run, error => /E_ISLE_LAYOUT/.test(error.message) && /159/.test(error.message) && /160/.test(error.message));
});

test('checked build owns delivered CSS and binds a two-axis certificate to final HTML', async t => {
  const output = await (await fixture(t))();
  const page = String(artifact(output, 'index.html').source);
  const certificate = JSON.parse(artifact(output, 'isle.layout.json').source);
  assert.equal(certificate.status, 'verified');
  assert.equal(certificate.report.scope.axis, 'both');
  assert.equal(certificate.report.scope.viewport.minExact, '80');
  assert.equal(certificate.report.scope.viewport.height.maxExact, '600');
  assert.equal(certificate.document.sha256, hash(page));
  assert.equal(certificate.component, 'Four');
  assert.ok(certificate.sources.every(row => !row.file.startsWith('/')), 'certificate paths are portable');
  assert.match(page, /<style data-isle-layout="1">/);
  assert.match(page, /min-width:40px/);
  assert.ok(certificate.report.sizes.some(row => row.box.startsWith('html@')));
  assert.ok(certificate.report.sizes.some(row => row.box.startsWith('body@')));
  assert.equal(output.output.filter(item => item.type === 'chunk').length, 0, 'static checks add no browser JS');
});

test('height and container branches remain coupled in production checks', async t => {
  const run = await fixture(t, {css:css+responsive+'.row{container:Row / inline-size;block-size:100px}@media(height >= 400px){@container Row (width >= 150px){.cell{min-width:80px}}}'});
  await assert.rejects(run, /E_ISLE_LAYOUT.*150/s);
});

test('unsupported CSS is a build error, even in an unmatched rule', async t => {
  const run = await fixture(t, {css:css+responsive+'.unused{float:left}'});
  // float is parsed but an unmatched rule cannot affect geometry; unknown syntax must still fail closed.
  const unknown = await fixture(t, {css:css+responsive+'.unused > div{display:grid}'});
  await run();
  await assert.rejects(unknown, /E_ISLE_LAYOUT.*unknown/s);
});

test('checked builds reject shorthand conflicts before solving, including paint-only resets',async t=>{
  for(const declarations of ['padding-left:0;\n  padding:0','font-weight:700;\n  font:16px sans-serif','border-image-source:none;\n  border:0']) {
    const run=await fixture(t,{css:css+responsive+'\n.unused {\n  '+declarations+';\n}'});
    await assert.rejects(run,error=>{
      assert.match(error.message,/E_CSS_SHORTHAND_CONFLICT/);
      assert.match(error.message,/app\.css:4:3/);
      assert.match(error.message,/app\.css:3:3/);
      assert.match(error.message,/separate rule/);
      return true;
    });
  }
});

test('the real document host is checked rather than trusting a caller inset', async t => {
  const run = await fixture(t, {css:css+responsive+'body{padding:1px}'});
  await assert.rejects(run, /E_ISLE_LAYOUT.*E_LAYOUT_ITEM_SIZE/s);
});

for (const [name, extra] of [
  ['external stylesheet', '<link rel="stylesheet" href="https://example.com/extra.css">'],
  ['extra inline stylesheet', '<style>.row{width:1px}</style>'],
  ['inline style', '<div style="width:1px"></div>'],
  ['extra unmodeled content', '<aside>outside</aside>'],
  ['script', '<script>document.body.style.width="1px"</script>'],
  ['CSP that can disable the owned stylesheet', '<meta http-equiv="Content-Security-Policy" content="style-src &apos;none&apos;">'],
]) test(`checked document rejects ${name}`, async t => {
  const run = await fixture(t, {html:html.replace('</body>',extra+'</body>')});
  await assert.rejects(run, /E_ISLE_LAYOUT/);
});

test('late plugin changes to owned CSS and rendered structure cannot retain verification', async t => {
  for (const mutate of [page => page.replace('min-width:40px','min-width:400px'), page => page.replace('class="row"','class="different"'), page => page.replace('data-isle-layout="1"','data-isle-layout="1" media="print"')]) {
    const run = await fixture(t, {plugins:[{name:'late-change',transformIndexHtml:{order:'post',handler:mutate}}]});
    await assert.rejects(run, /E_ISLE_LAYOUT/);
  }
});

test('an external script cannot impersonate an emitted chunk by filename', async t => {
  const source = 'export client component Four() { state n = 0; <a class="counter" href="#">on click { n += 1; }{n}</a> }';
  const layout = {css:'./app.css',viewport,boxes:{'.counter':{minInlineSize:40,minBlockSize:20}}};
  const run = await fixture(t, {source,css:'*{margin:0;box-sizing:border-box}',options:{layout},plugins:[{
    name:'external-script',transformIndexHtml:{order:'post',handler(_html,{bundle}) {
      const chunk = Object.values(bundle).find(item => item.type === 'chunk');
      return [{tag:'script',attrs:{type:'module',src:`https://unowned.test/${chunk.fileName}`},injectTo:'body'}];
    }},
  }]});
  await assert.rejects(run,/E_ISLE_LAYOUT.*Unowned executable script/);
});

test('noscript cannot introduce another stylesheet when scripting is disabled', async t => {
  const run = await fixture(t, {html:html.replace('</head>','<noscript><style>.row{width:1px}</style></noscript></head>')});
  await assert.rejects(run,/E_ISLE_LAYOUT.*noscript/);
});

test('dynamic structure is certified across both structural states', async t => {
  const run = await fixture(t, {source:'export client component Four() { state show = true; <main class="row">on click { show = false; }<Show when={show}> <div class="cell"></div> </Show></main> }'});
  const output=await run();
  assert.equal(JSON.parse(artifact(output,'isle.layout.json').source).report.structure.variants.length,2);
});

test('checked options require one owned document and a closed height domain', () => {
  const base = {entry:'/app.isle',mounts:[{component:'Four',props:{}}],wrapMounts:false,layout:{css:'./app.css',viewport}};
  for (const options of [
    {...base,wrapMounts:true}, {...base,mounts:[...base.mounts,...base.mounts]}, {...base,clientEntry:'./app.js'},
    {...base,resources:{Four:'./setup.js'}}, {...base,widget:{}},
    {...base,layout:{...base.layout,viewport:{min:80,max:300}}},
    {...base,layout:{...base.layout,hostInset:0}},
  ]) assert.throws(() => isle(options), /E_ISLE_LAYOUT/);
});

test('stable resumable text uses the same JS chunks with or without layout checks', async t => {
  const source = 'export client component Four() { state n = 0; <a class="counter" href="#">on click { n = n < 3 ? n + 1 : 0; }{n}</a> }';
  const layout = {css:'./app.css',viewport,boxes:{'.counter':{minInlineSize:40,minBlockSize:20}}};
  const chunks = output => output.output.filter(item => item.type === 'chunk').map(({fileName,code}) => [fileName,code]).sort(([a],[b]) => a.localeCompare(b));
  for (const loading of ['auto','lazy','preload','eager']) for (const base of ['./','/isle/demo/']) {
    const checked = await (await fixture(t, {source,base,css:'*{box-sizing:border-box;margin:0}',options:{layout,loading}}))();
    const unchecked = await (await fixture(t, {source,base,options:{layout:undefined,loading}}))();
    assert.deepEqual(chunks(checked),chunks(unchecked), `${loading}/${base}: checking adds no JS or runtime metadata`);
    assert.ok(chunks(checked).length > 0);
  }
});

test('parser repairs cannot replace the template tree being proved', async t => {
  const run = await fixture(t, {source:'export component Four() { <p class="row"><div class="cell"></div></p> }'});
  await assert.rejects(run, /E_COMPONENT_HTML|E_ISLE_LAYOUT.*(?:tree|structure)/s);
});

test('CSS cannot render the omitted head, snapshot or loader nodes', async t => {
  const run = await fixture(t, {css:css+responsive+'head{display:block}'});
  await assert.rejects(run, /E_ISLE_LAYOUT.*unmodeled head/);
});

test('unmodeled scrollbar gutters and native popovers are rejected', async t => {
  for (const extra of ['.row{overflow:auto}', '.row{overflow-y:scroll}']) {
    const run = await fixture(t, {css:css+responsive+extra});
    await assert.rejects(run, /E_ISLE_LAYOUT.*scrollbar/s);
  }
  const run = await fixture(t, {html:html.replace('<body>','<body popover="auto">')});
  await assert.rejects(run, /E_ISLE_LAYOUT.*rendering attribute/);
});

test('nested stable client components remain checkable without treating snapshots as boxes', async t => {
  const source = `client component Cell() { state n = 0; <a class="counter" href="#">on click { n = n < 3 ? n + 1 : 0; }{n}</a> }
    export client component Four() { <main class="row"><Cell/><Cell/></main> }`;
  const css = '*{margin:0;box-sizing:border-box}.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr)}';
  const layout = {css:'./app.css',viewport,boxes:{'.counter':{minInlineSize:40,minBlockSize:20}}};
  const run = await fixture(t, {source,css,options:{layout}});
  const output = await run();
  assert.equal(JSON.parse(artifact(output,'isle.layout.json').source).status,'verified');
  assert.match(String(artifact(output,'index.html').source),/data-isle-snapshot/);
});

test('bounded dynamic regions and scrollbar proofs add no browser code',async t=>{
  const source=await readFile(new URL('../examples/responsive-dynamic/app.isle',import.meta.url),'utf8');
  const css=await readFile(new URL('../examples/responsive-dynamic/app.css',import.meta.url),'utf8');
  const {layout}=await import('../examples/responsive-dynamic/vite.config.mjs');
  const options={mounts:[{component:'DynamicBoard',props:{}}],layout};
  const checked=await (await fixture(t,{source,css,options}))();
  const unchecked=await (await fixture(t,{source,css,options:{...options,layout:undefined}}))();
  const chunks=result=>result.output.filter(f=>f.type==='chunk').map(f=>[f.fileName,f.code]).sort(([a],[b])=>a.localeCompare(b));
  assert.deepEqual(chunks(checked),chunks(unchecked));
  const certificate=JSON.parse(artifact(checked,'isle.layout.json').source);
  assert.equal(certificate.report.structure.complete,true);
  assert.equal(certificate.report.structure.bounds.find(b=>b.state==='items').length.max,4);
  assert.equal(certificate.report.scope.scrollbarProfiles.length,2);
});

test('a later HTML transform cannot change the initial snapshot used by the bound proof',async t=>{
  const source='export client component Four(){state items=[0];<main class="row">on click {items=items.length<4 ? items.concat([items.length]):items;}<For each={items}>{(item) => <Fragment key={item}><div class="cell"></div></Fragment>}</For></main>}';
  const run=await fixture(t,{source,plugins:[{name:'change-state',transformIndexHtml:{order:'post',handler(html){
    return html.replace(/(<script[^>]*data-isle-snapshot[^>]*>)([^<]+)(<\/script>)/,(_all,start,text,end)=>{
      const snapshot=JSON.parse(text);snapshot[3][0]=[0,1,2,3,4];return start+JSON.stringify(snapshot)+end;
    });
  }}}]});
  await assert.rejects(run,/E_ISLE_LAYOUT.*snapshot/i);
});

test('checked builds can enforce the integrity rules and record them in the certificate', async t => {
  const toolbar = 'export component Four() { <main class="bar"><button class="b">Go</button></main> }';
  const style = size => `*{box-sizing:border-box;margin:0}.bar{display:grid;grid-template-columns:${size}px;grid-template-rows:${size}px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0}`;
  const boxes = {'.b':{minInlineSize:1,minBlockSize:1}};
  // Without integrity, a 20px button is a valid layout.
  await (await fixture(t, {source:toolbar, css:style(20), options:{mounts:[{component:'Four',props:{}}],wrapMounts:false,layout:{css:'./app.css',viewport,boxes}}}))();
  const small = await fixture(t, {source:toolbar, css:style(20), options:{mounts:[{component:'Four',props:{}}],wrapMounts:false,layout:{css:'./app.css',viewport,boxes,integrity:true}}});
  await assert.rejects(small, error => /E_ISLE_LAYOUT/.test(error.message) && /E_LAYOUT_TARGET_SIZE/.test(error.message));
  const output = await (await fixture(t, {source:toolbar, css:style(24), options:{mounts:[{component:'Four',props:{}}],wrapMounts:false,layout:{css:'./app.css',viewport,boxes,integrity:{targetSize:24,protrusion:'painted'}}}}))();
  const certificate = JSON.parse(artifact(output, 'isle.layout.json').source);
  assert.deepEqual(certificate.contracts.integrity, {targetSize:24,protrusion:'painted'});
  assert.equal(certificate.report.integrity.protrusion, 'painted');
  assert.deepEqual(certificate.report.integrity.warnings, []);
});

test('integrity warnings are reported by the build without failing it', async t => {
  const strip = 'export component Four() { <main class="frame"><div class="wide"></div></main> }';
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-integrity-'));
  t.after(() => rm(directory, { recursive:true, force:true }));
  await Promise.all([writeFile(join(directory, 'app.isle'), strip), writeFile(join(directory, 'index.html'), html), writeFile(join(directory, 'package.json'), '{"type":"module"}'),
    writeFile(join(directory, 'app.css'), '*{box-sizing:border-box;margin:0}.frame{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:20px;overflow:hidden}.wide{inline-size:250px}')]);
  const warnings = [];
  const customLogger = {info() {}, warn: message => warnings.push(message), warnOnce: message => warnings.push(message), error() {}, clearScreen() {}, hasErrorLogged: () => false, hasWarned: false};
  await build({configFile:false,root:directory,base:'./',customLogger,plugins:[isle({entry:join(directory, 'app.isle'),mounts:[{component:'Four',props:{}}],wrapMounts:false,
    layout:{css:'./app.css',viewport,boxes:{'.frame':{overflow:'clip'}},integrity:true}})],build:{write:false}});
  assert.ok(warnings.some(message => /W_LAYOUT_CLIPPED/.test(message) && /80\.\.250/.test(message)), warnings.join('\n'));
});

// Font-derived text contracts (ADR-0010) in the checked build: `layout.fonts`
// maps CSS families to font files next to the entry, as layout.json does.
const fontFile = new URL('../packages/css-verifier/text-metrics/fixtures/japanese-variable.ttf', import.meta.url);
const jp = {family:'Noto Sans JP', size:16, lineHeight:24, weight:400};
async function textFixture(t, {viewport:range, boxes, fonts = {'Noto Sans JP':{file:'./jp.ttf'}}, plugins = [], lang = 'en'}) {
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-fonts-'));
  t.after(() => rm(directory, { recursive:true, force:true }));
  await Promise.all([
    writeFile(join(directory, 'app.isle'), 'export component Four() { <main class="card"><p class="title">日本語のテキスト幅検査</p></main> }'),
    writeFile(join(directory, 'app.css'), '*{box-sizing:border-box;margin:0;padding:0}.card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:24px;font-family:"Noto Sans JP",sans-serif;font-size:16px;line-height:24px}.title{white-space:'+(Object.values(boxes).some(b=>b.wrap) ? 'normal' : 'nowrap')+'}'),
    writeFile(join(directory, 'index.html'), html.replace('lang="en"', `lang="${lang}"`)), writeFile(join(directory, 'package.json'), '{"type":"module"}'),
    writeFile(join(directory, 'jp.ttf'), await readFile(fontFile)),
  ]);
  return () => build({configFile:false,root:directory,base:'./',logLevel:'silent',plugins:[isle({entry:join(directory, 'app.isle'),mounts:[{component:'Four',props:{}}],wrapMounts:false,
    layout:{css:'./app.css',viewport:range,boxes,...(fonts ? {fonts} : {})}}),...plugins],build:{write:false}});
}
const title = {'.title':{text:{font:jp, content:'日本語のテキスト幅検査'}}};

test('checked builds resolve font-derived text contracts and record the font in the certificate', async t => {
  const output = await (await textFixture(t, {viewport:{min:200,max:400,height:{min:200,max:600}}, boxes:title}))();
  const certificate = JSON.parse(artifact(output, 'isle.layout.json').source);
  const contract = certificate.contracts.boxes['.title'];
  assert.equal(contract.textMetrics.kind, 'content');
  assert.equal(contract.font.family, 'Noto Sans JP');
  assert.ok(contract.minInlineSize > 150 && contract.minInlineSize < 200, String(contract.minInlineSize));
  assert.deepEqual(certificate.contracts.fonts, [{family:'Noto Sans JP', file:'jp.ttf', sha256:hash(await readFile(fontFile))}]);
  assert.equal(contract.textMetrics.font.sha256, certificate.contracts.fonts[0].sha256);
});

test('checked builds reject text that the font makes wider than the narrowest viewport', async t => {
  const run = await textFixture(t, {viewport:{min:120,max:400,height:{min:200,max:600}}, boxes:title});
  await assert.rejects(run, error => /E_ISLE_LAYOUT/.test(error.message) && /width 120\.\./.test(error.message));
});

test('a text contract without layout.fonts is a configuration error', async t => {
  await assert.rejects(textFixture(t, {viewport:{min:200,max:400,height:{min:200,max:600}}, boxes:title, fonts:null}).then(run => run()), /E_ISLE_LAYOUT.*layout\.fonts/);
  await assert.rejects(textFixture(t, {viewport:{min:200,max:400,height:{min:200,max:600}}, boxes:title, fonts:{'Noto Sans JP':{path:'./jp.ttf'}}}).then(run => run()), /E_ISLE_LAYOUT.*fonts/);
});

test('checked builds measure wrapping text into a line profile', async t => {
  const wrap = {'.title':{wrap:'normal', text:{font:jp, content:'日本語のテキスト幅検査'}}};
  // The single 24px row holds one line only from the full width on.
  const run = await textFixture(t, {viewport:{min:100,max:400,height:{min:200,max:600}}, boxes:wrap});
  await assert.rejects(run, error => /E_LAYOUT_CONTENT/.test(error.message) && /block axis/.test(error.message));
  const output = await (await textFixture(t, {viewport:{min:200,max:400,height:{min:200,max:600}}, boxes:wrap}))();
  const contract = JSON.parse(artifact(output, 'isle.layout.json').source).contracts.boxes['.title'];
  assert.equal(contract.textMetrics.kind, 'lines');
  assert.equal(contract.intrinsicBlockSize.at(-1).blockSize, 24);
});

test('a text contract measured for a lang must match the delivered document language', async t => {
  const measured = {'.title':{text:{font:jp, content:'日本語のテキスト幅検査', lang:'ja'}}};
  const range = {min:200,max:400,height:{min:200,max:600}};
  const output = await (await textFixture(t, {viewport:range, boxes:measured, lang:'ja'}))();
  assert.equal(JSON.parse(artifact(output, 'isle.layout.json').source).contracts.boxes['.title'].textMetrics.lang, 'ja');
  await assert.rejects(await textFixture(t, {viewport:range, boxes:measured, lang:'en'}), error => /E_ISLE_LAYOUT/.test(error.message) && /lang en differs from the measured ja/.test(error.message));
});
