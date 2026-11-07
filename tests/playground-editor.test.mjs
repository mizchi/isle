import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenize} from '../playground/highlight.mjs';

test('Isle highlighting preserves source and distinguishes DSL, types, tags and embedded CSS',()=>{
  const source=`client component Counter(initial: number) {
  // <style> inside a comment is not a stylesheet
  state count = initial;
  event increment(e: EventSnapshot<MouseEvent>) { count += 1; }
  <button class="counter" on:click={increment}>
    <style>.counter { color: #1747a6; width: 40px; } @media (width < 160px) { button { display: grid; } }</style>
    日本語 {count}
  </button>
}\n`;
  const tokens=tokenize(source,'isle');
  assert.equal(tokens.map(t=>t.text).join(''),source);
  const has=(kind,text)=>tokens.some(t=>t.kind===kind && t.text===text);
  for(const word of ['client','component','state','event']) assert.ok(has('keyword',word),word);
  assert.ok(has('type','MouseEvent'));assert.ok(!has('tag','<MouseEvent'));
  assert.ok(has('tag','<button'));assert.ok(has('attribute','on:click'));
  assert.ok(has('property','color'));assert.ok(has('number','40px'));assert.ok(has('at-rule','@media'));
});

test('CSS and JSON distinguish properties, strings, numbers and literals without reformatting',()=>{
  for(const [language,source] of [
    ['css','/* 日本語 */\n.row { display: grid; gap: 12px; color: #cde; }\n'],
    ['json','{ "viewport": {"min": 160, "max": 640}, "enabled": true, "value": null, "label": "hello" }\n'],
  ]) {
    const tokens=tokenize(source,language);
    assert.equal(tokens.map(t=>t.text).join(''),source);
    assert.ok(tokens.some(t=>t.kind==='property'));
    assert.ok(tokens.some(t=>t.kind==='number'));
    if(language==='json') {assert.ok(tokens.some(t=>t.kind==='string'));assert.ok(tokens.some(t=>t.kind==='keyword' && t.text==='true'));}
  }
});

test('incomplete edits, empty lines, tabs, CRLF and HTML payloads remain literal text',()=>{
  for(const language of ['isle','css','json']) for(const source of [
    '', '\n\n', '\t日本語\r\n\n', '/* unfinished', '"unfinished\\',
    '<style>p { color: red; }', '</textarea><img src=x onerror="alert(1)"><script>alert(2)</script>',
    '"<style>not CSS</style>"', '// comment\n'.repeat(10000),
  ]) assert.equal(tokenize(source,language).map(t=>t.text).join(''),source);
});
