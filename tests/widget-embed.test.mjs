import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWidgetEmbed } from '../lib/widget.mjs';

const options = { src: 'https://widget.example/', title: 'Work planner', width: 640, height: 640 };
test('custom element reserves dimensions before definition and loads a CORS module', () => {
  const html = renderWidgetEmbed(options);
  assert.match(html, /^<isle-widget /); assert.match(html, / width="640" height="640"/);
  assert.match(html, /width:640px/); assert.match(html, /height:640px/);
  assert.match(html, /display:block/); assert.match(html, /max-width:100%/);
  assert.match(html, /border:0/); assert.match(html, /box-sizing:border-box/);
  assert.match(html, /loading="lazy"/); assert.match(html, /aria-label="Work planner"/);
  assert.match(html, /overflow:auto/); assert.match(html, /contain:layout paint style/);
  assert.match(html, /<script type="module" src="https:\/\/widget.example\/widget.js" crossorigin="anonymous"><\/script>/);
  assert.ok(!/<iframe|onload=|onerror=|postMessage/.test(html));
  assert.match(html, /Open Work planner/);
  assert.match(renderWidgetEmbed({ ...options, loading: 'eager' }), /loading="eager"/);
  const standalone = renderWidgetEmbed({ ...options, src: 'https://widget.example/standalone/', runtime: 'standalone' });
  assert.match(standalone, /^<isle-widget-standalone /);
  assert.match(standalone, /src="https:\/\/widget.example\/standalone\/widget.js"/);
  assert.match(standalone, /height:640px/);
});

test('embed dimensions are explicit finite integer pixels and cannot be automatic', () => {
  for (const dimension of ['width', 'height']) for (const invalid of [undefined, 0, -1, 1.5, 8193, NaN, Infinity, '640', '100%', 'auto']) {
    assert.throws(() => renderWidgetEmbed({ ...options, [dimension]: invalid }), new RegExp(dimension));
  }
});

test('URLs and titles cannot inject markup or bypass the document origin boundary', () => {
  const html = renderWidgetEmbed({ ...options, src: 'https://widget.example/?a=1&b=2', title: '"><img src=x onerror=alert(1)>' });
  assert.ok(html.includes('?a=1&amp;b=2'));
  assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img'));
  for (const src of ['javascript:alert(1)', 'data:text/html,hello', '/relative', 'https://user:password@widget.example/']) {
    assert.throws(() => renderWidgetEmbed({ ...options, src }), /URL/);
  }
  assert.throws(() => renderWidgetEmbed({ ...options, title: ' ' }), /title/);
  assert.throws(() => renderWidgetEmbed({ ...options, loading: 'auto' }), /loading/);
  assert.throws(() => renderWidgetEmbed({ ...options, runtime: 'fallback' }), /runtime/);
});

test('explicit descriptor and loader paths support a different app, tag and deployment prefix', () => {
  const html = renderWidgetEmbed({ descriptorURL: 'https://cdn.example/pkg/components/counter.json', loaderURL: 'https://cdn.example/pkg/sdk/counter.js', tagName: 'demo-counter', title: 'Counter', width: 320, height: 180 });
  assert.match(html, /^<demo-counter /); assert.match(html, /descriptor="https:\/\/cdn.example\/pkg\/components\/counter.json"/);
  assert.match(html, /src="https:\/\/cdn.example\/pkg\/sdk\/counter.js"/);
  assert.ok(!html.includes('widget.json')); assert.ok(!html.includes('widget.js'));
  for (const tagName of ['div', 'Bad-Name', 'x"><script', 'annotation-xml']) assert.throws(() => renderWidgetEmbed({ ...options, tagName }));
});
