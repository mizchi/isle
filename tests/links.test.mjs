import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';

test('static links accept relative and HTTPS URLs and escape attribute values', () => {
  const ir = requireIR(compile('component Link(url: string){<a href={url}>Guide</a>}'));
  const program = prepareProgram(ir);
  for (const url of ['/isle/docs/', '../guide.html', '#content', 'https://example.test/?x=1&y=2']) assert.match(program.render('Link', { url }).html, /href=/);
  assert.match(program.render('Link', { url: '?x=1&y=2' }).html, /x=1&amp;y=2/);
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'java\nscript:alert(1)', ' javascript:alert(1)']) assert.throws(() => program.render('Link', { url }), /link URL/);
});

test('unsafe literals and mutable destinations fail before code generation', () => {
  assert.equal(compile('component Bad(){<a href="javascript:alert(1)">Bad</a>}').ok, false);
  assert.equal(compile('client component Bad(){state url="/";<div><a href={url}>Bad</a><button>on click change {url="/other";}Change</button></div>}').ok, false);
  assert.equal(compile('component Bad(){<div href="/">Bad</div>}').ok, false);
});

test('static server list links are validated at SSR while client factory URLs stay literal', () => {
  const source = 'schema Entry {id:string; url:string;} server component Links(entries:Entry[]){<ul>@for(const entry of entries; key entry.id){<li><a href={entry.url}>Guide</a></li>}</ul>}';
  const program = prepareProgram(requireIR(compile(source)));
  assert.match(program.render('Links', { entries: [{ id: 'a', url: '/docs/' }] }).html, /href="\/docs\/"/);
  assert.throws(() => program.render('Links', { entries: [{ id: 'a', url: 'data:text/html,bad' }] }), /link URL/);
});
