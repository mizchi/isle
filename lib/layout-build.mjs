// Build-only closed-document adapter. Nothing in this module is imported by browser code.
import { readFile } from 'node:fs/promises';
import { resolve, dirname, relative, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { parse, parseFragment } from 'parse5';
import postcss from 'postcss';
import { analyzeLayout } from './layout.mjs';
import { validateOptions, extractBoxes } from './layout/input.mjs';
import { parseLayoutCSS, matches } from './layout/css.mjs';

const shell = 'html,body{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);inline-size:100%;block-size:100%;min-inline-size:0;min-block-size:0;margin:0;padding:0}';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(`E_ISLE_LAYOUT: ${message}`); };
const attrs = node => Object.fromEntries((node.attrs ?? []).map(({name,value}) => [name,value]));
const children = node => (node.childNodes ?? []).filter(child => child.nodeName !== '#comment' && !(child.nodeName === '#text' && !child.value.trim()));
const inert = node => node.tagName === 'script' || node.tagName === 'template' && attrs(node)['data-isle-load'] === '1';
const renderChildren = node => children(node).filter(child => !inert(child));
function* walk(node) {
  yield node;
  for (const child of node.childNodes ?? []) yield* walk(child);
  if (node.content) yield* walk(node.content);
}
function document(html) {
  const errors = [];
  const tree = parse(html, {onParseError:error => errors.push(error.code)});
  if (errors.length) fail(`Invalid HTML: ${errors.join(', ')}`);
  const root = tree.childNodes.find(node => node.tagName === 'html');
  return {tree,root,body:root?.childNodes.find(node => node.tagName === 'body')};
}
function canonical(node) {
  if (node.nodeName === '#text') return ['text',node.value];
  return [node.tagName, Object.entries(attrs(node)).sort(([a],[b]) => a.localeCompare(b)), renderChildren(node).map(canonical)];
}
function compact(css, file) {
  const root = postcss.parse(css, {from:file});
  root.walkComments(comment => comment.remove());
  root.walk(node => { node.raws.before = ''; node.raws.after = ''; node.raws.between = node.type === 'decl' ? ':' : ''; });
  root.raws.after = '';
  return root.toString().replace(/<\/style/gi, '<\\/style');
}

export function checkedLayoutOptions(layout, {mounts,wrapMounts,clientEntry,resources,widget}) {
  if (layout === undefined) return;
  if (!layout || typeof layout !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(layout)) || Object.keys(layout).some(key => !['css','reset','viewport','boxes'].includes(key))) fail('Invalid checked layout options');
  if (typeof layout.css !== 'string' || !layout.css || (layout.reset !== undefined && (!Array.isArray(layout.reset) || layout.reset.length > 32 || layout.reset.some(file => typeof file !== 'string' || !file)))) fail('CSS and reset must be local stylesheet paths (at most 32 resets)');
  if (!layout.viewport?.height) fail('Checked document requires finite width and height intervals');
  try { validateOptions({css:'',viewport:layout.viewport,boxes:layout.boxes}); } catch (error) { fail(error.message); }
  if (Object.values(layout.boxes ?? {}).some(box => ['scroll','visible'].includes(box.overflow) || ['scroll','visible'].includes(box.overflowBlock))) fail('Unbounded visible overflow and scrollbar gutters need a size adapter; use fit or clip');
  if (wrapMounts || mounts.length !== 1 || clientEntry !== undefined || Object.keys(resources).length || widget !== undefined) fail('Checked document requires one unwrapped mount, the generated loader, and no resource/widget setup');
}

export async function loadCheckedStyles(layout, entry) {
  const files = [...(layout.reset ?? []), layout.css].map(file => resolve(dirname(entry),file));
  const sources = await Promise.all(files.map(async file => ({file:relative(dirname(entry),file).replaceAll('\\','/'),css:await readFile(file,'utf8')})));
  if (sources.reduce((bytes,sheet) => bytes + sheet.css.length,shell.length) > 1_000_000) fail('Reset and app CSS size limit exceeded');
  // Keep source/line diagnostics, while delivering the same cascade as one owned stylesheet.
  return {files,sources,css:compact([shell,...sources.map(sheet => sheet.css)].join('\n'),files.at(-1))};
}

export function validateCheckedHTML(html) {
  const {tree} = document(html);
  if ([...walk(tree)].some(node => node.tagName === 'script' && !['application/json','speculationrules'].includes(attrs(node).type))) fail('Authored executable scripts are outside the checked document');
  if ((html.match(/<!--isle:ssr-->/g) ?? []).length !== 1) fail('Checked document requires exactly one SSR marker');
}

export const injectCheckedStyles = (styles,nonce) => ({tag:'style',attrs:{'data-isle-layout':'1',...(nonce ? {nonce} : {})},children:styles.css,injectTo:'head'});

export function certifyLayout({html,file,documentId,base,ir,component,rendered,layout,styles,bundle,runtimeDirectory}) {
  const {tree,root,body} = document(html);
  const nodes = [...walk(tree)], elements = nodes.filter(node => node.tagName);
  const owned = elements.filter(node => node.tagName === 'style' && attrs(node)['data-isle-layout'] === '1');
  if (owned.length !== 1 || Object.keys(attrs(owned[0])).some(key => !['data-isle-layout','nonce'].includes(key)) || owned[0].childNodes.map(node => node.value ?? '').join('') !== styles.css) fail('Delivered checked stylesheet was changed, disabled or removed');
  const scriptSources = new Set(Object.values(bundle).filter(item => item.type === 'chunk').map(item => {
    const relativeFile = posix.relative(posix.dirname(file),item.fileName);
    return base === './' || base === '' ? relativeFile.startsWith('.') ? relativeFile : './' + relativeFile : base + item.fileName;
  }));
  for (const node of elements) {
    const a = attrs(node);
    if (Object.keys(a).some(key => ['style','hidden','dir','contenteditable','popover','is'].includes(key) || key.startsWith('on'))) fail(`Unmodeled rendering attribute on ${node.tagName}`);
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml') fail('Foreign markup is outside the checked document');
    if (node.tagName === 'style' && node !== owned[0] || node.tagName === 'link' && /(?:^|\s)stylesheet(?:\s|$)/i.test(a.rel ?? '')) fail('Additional stylesheet is outside the checked cascade');
    if (node.tagName === 'base' || node.tagName === 'meta' && a['http-equiv']?.toLowerCase() === 'refresh') fail('Document navigation overrides are outside the checked document');
    if (node.tagName === 'meta' && a['http-equiv']?.toLowerCase() === 'content-security-policy') fail('CSP meta needs a stylesheet activation adapter; HTTP deployment policy must allow the owned stylesheet');
    if (node.tagName === 'noscript') fail('noscript fallback requires a separate rendering profile');
    if (node.tagName === 'a' && /^\s*javascript:/i.test(a.href ?? '')) fail('Executable URLs are outside the checked document');
    if (node.tagName === 'script' && !['application/json','speculationrules'].includes(a.type)) {
      if (a.type !== 'module' || !scriptSources.has(a.src) || node.childNodes.some(child => child.value?.trim())) fail('Unowned executable script');
    }
  }
  // Catch executable modules added by other HTML transforms before they merge with the loader.
  for (const output of Object.values(bundle)) if (output.type === 'chunk') {
    if ([...output.imports,...output.dynamicImports].some(file => bundle[file]?.type !== 'chunk')) fail('External client imports are outside the checked module closure');
    for (const id of Object.keys(output.modules)) {
      const normalized = id.replaceAll('\\','/');
      if (normalized.startsWith(runtimeDirectory) || id.startsWith('\0isle:') || id.startsWith('\0virtual:isle-') || normalized === documentId || id === '\0vite/modulepreload-polyfill.js') continue;
      fail(`Unowned client module: ${id}`);
    }
  }
  const actual = renderChildren(body);
  const expected = renderChildren(parseFragment(rendered));
  if (JSON.stringify(actual.map(canonical)) !== JSON.stringify(expected.map(canonical))) fail('Delivered body differs from the compiled component tree');
  // Non-rendered head/snapshot/loading nodes must not become additional CSS boxes.
  const {rules} = parseLayoutCSS([{css:styles.css,file:'<delivered>'}], () => {});
  if (rules.some(rule => rule.declarations.some(declaration => ['overflow-x','overflow-y'].includes(declaration.property) && ['auto','scroll'].includes(declaration.value)))) fail('Unmodeled scrollbar gutters require a size adapter');
  const modeled = new Set();
  const mark = node => { modeled.add(node); for (const child of renderChildren(node)) mark(child); };
  actual.forEach(mark);
  const omitted = elements.filter(node => node !== root && node !== body && !modeled.has(node));
  for (const node of omitted) {
    const a = attrs(node), box = {tag:node.tagName,id:a.id,classes:(a.class ?? '').split(/\s+/),documentRoot:false};
    if (rules.some(rule => rule.selectors.some(selector => matches(selector,box)) && rule.declarations.some(declaration => declaration.property === 'display' && declaration.value !== 'none'))) fail(`CSS can render an unmodeled ${node.tagName} element`);
  }
  const element = (node, nested) => ({kind:'element',tag:node.tagName,attributes:(node.attrs ?? []).map(({name,value}) => ({name,value:{kind:'string',value}})),handlers:[],children:nested});
  const selected = ir.components.find(definition => definition.name === component);
  const documentIR = {...ir,components:ir.components.map(definition => definition !== selected ? definition : {...definition,root:element(root,[element(body,[selected.root])])})};
  const sheets = [{file:'<isle:document-shell>',css:shell},...styles.sources];
  let report;
  try { report = analyzeLayout(documentIR,{component,css:sheets.at(-1).css,cssFile:sheets.at(-1).file,reset:sheets.slice(0,-1),viewport:layout.viewport,boxes:layout.boxes}); }
  catch (error) { fail(error.message); }
  if (!report.ok) {
    const details = report.diagnostics.map(row => `${row.code}: ${row.message}${row.range ? `; width ${row.range.minExact}..${row.range.maxExact}${row.range.maxInclusive ? ']' : ')'}` : ''}${row.heightRange ? `; height ${row.heightRange.minExact}..${row.heightRange.maxExact}` : ''}`).join('\n');
    fail(`${report.status}\n${details}`);
  }
  const shape = node => [node.tag ?? node.tagName,(node.children ?? renderChildren(node).filter(child => child.tagName)).map(shape)];
  const expectedBox = extractBoxes(ir,component,(code,message) => fail(`${code}: ${message}`));
  if (actual.length !== 1 || JSON.stringify(shape(actual[0])) !== JSON.stringify(shape(expectedBox))) fail('Parsed HTML structure differs from the analyzed template tree');
  return {version:1,status:'verified',profile:'closed-document',component,document:{file,sha256:hash(html)},stylesheet:{sha256:hash(styles.css)},
    sources:styles.sources.map(({file,css}) => ({file,sha256:hash(css)})),contracts:{viewport:layout.viewport,boxes:layout.boxes ?? {}},report};
}
