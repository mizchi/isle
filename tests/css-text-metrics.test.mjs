// Font-derived text contracts. Requires `just css-text-build` (run by `just test`).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile, writeFile, mkdtemp, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadTextMetrics, upperBound} from '../packages/css-verifier/src/text-node.mjs';
import {scriptRuns, scriptSegments} from '../packages/css-verifier/src/text.mjs';

const fixtures = new URL('../packages/css-verifier/text-metrics/fixtures/', import.meta.url).pathname;
const metrics = await loadTextMetrics({fonts: {'Noto Sans JP': {file: fixtures + 'japanese-variable.ttf'}, Roboto: {file: fixtures + 'roboto-variable.ttf'}}});
const jp = {family: 'Noto Sans JP', size: 16, lineHeight: 24, weight: 400};
const ro = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
const layout = (...args) => spawnSync(process.execPath, ['tools/isle.mjs', 'layout', ...args], {encoding: 'utf8'});

test('the bound snaps shaped advances to 1/64 px and adds one unit', () => {
  assert.equal(upperBound(0.5), 33 / 64);
  assert.equal(upperBound(16), 1025 / 64); // integral advances still get the unit
  assert.equal(upperBound(191.52), 12259 / 64);
  assert.equal(upperBound(16.0000000001), 1025 / 64); // float noise is not a unit
});

test('fixed content is collapsed like white-space: nowrap and measured with the CSS weight', () => {
  const plain = metrics.measureText({font: jp, text: '  日本語の\nテキスト  '});
  assert.equal(plain.text, '日本語の テキスト');
  assert.equal(scriptRuns(plain.text), 3); // 日本語 / の␠ / テキスト, each snapped on its own
  assert.ok(plain.bound > plain.width && plain.bound - plain.width <= (2 * 3) / 64);
  // Latin glyphs of the variable CJK font depend on the wght coordinate.
  assert.ok(metrics.measureText({font: {...jp, weight: 700}, text: 'ABC'}).width > metrics.measureText({font: jp, text: 'ABC'}).width);
  assert.deepEqual(metrics.measureText({font: jp, text: '   '}), {text: '', width: 0, bound: 0});
});

test('a character domain yields a monotone bound table with the widest character as witness', () => {
  const domain = metrics.domainBounds({font: jp, characters: '日本語ABC', maxLength: 8});
  assert.equal(domain.widest, '日');
  assert.equal(domain.perCharacter, 16);
  assert.equal(domain.bounds.length, 9);
  assert.equal(domain.bounds[8], upperBound(8 * 16 + 7 * domain.pairAdjustment));
  for (let i = 1; i < domain.bounds.length; i++) assert.ok(domain.bounds[i] >= domain.bounds[i - 1]);
});

test('inputs the model cannot cover are rejected instead of guessed', () => {
  for (const [input, pattern] of [
    [() => metrics.measureText({font: jp, text: '日本Ω'}), /lacks U\+03A9; fallback fonts are not modeled/],
    [() => metrics.measureText({font: {...jp, family: 'Unknown'}, text: '日本'}), /No font file is mapped/],
    [() => metrics.measureText({font: {...jp, weight: 950}, text: '日本'}), /outside the wght axis/],
    [() => metrics.domainBounds({font: jp, characters: '日\n', maxLength: 4}), /line breaks that are not modeled/],
    [() => metrics.domainBounds({font: jp, characters: 'é', maxLength: 4}), /clusters/],
    [() => metrics.domainBounds({font: jp, characters: '日', maxLength: 0}), /maxLength/],
    [() => metrics.resolveBoxes({'.a': {text: {font: jp, content: '日本'}, minInlineSize: 10}}), /derives its own sizes/],
    [() => metrics.resolveBoxes({'.a': {text: {font: jp, characters: '日本', maxLength: 4}, wrap: 'normal'}}), /fixed content/],
    [() => metrics.breakLines({font: jp, text: '日本$1'}), /\$ next to a non-ASCII character follows ICU's numeric rule/],
    [() => metrics.breakLines({font: ro, text: 'café, ok'}), /Latin-1 letter next to ASCII punctuation/],
    [() => metrics.breakLines({font: jp, text: '日本語。」'}), /Adjacent fullwidth punctuation 。」 is trimmed by text-spacing-trim/],
    [() => metrics.breakLines({font: jp, text: '日本', overflowWrap: 'break-all'}), /overflow-wrap/],
  ]) assert.throws(input, error => error.code === 'U_LAYOUT_TEXT_METRICS' && pattern.test(error.message));
});

test('resolved contracts keep overflow policies and record their provenance', () => {
  const {'.a': resolved} = metrics.resolveBoxes({'.a': {text: {font: jp, characters: '日本', maxLength: 3}, overflow: 'clip'}});
  assert.equal(resolved.overflow, 'clip');
  assert.equal(resolved.minInlineSize, resolved.textMetrics.bounds[3]);
  assert.equal(resolved.intrinsicBlockSize, 24);
  assert.equal(resolved.wrap, 'nowrap');
  assert.match(resolved.textMetrics.font.sha256, /^[0-9a-f]{64}$/);
  assert.equal(resolved.textMetrics.allowance, 'ceil to 1/64 px, then + 1/64 px');
});

test('the CLI example reports the overflow interval and how many characters still fit', () => {
  const result = layout('examples/layout-contracts/text-fonts.isle', 'examples/layout-contracts/text-fonts.json');
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'violated');
  const name = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.name');
  assert.equal(name.range.maxExact, '17921/64'); // 48 + 8 + 32 + 12 × 16 + 1/64
  assert.equal(name.text.maxLength, 12);
  assert.ok(name.text.fitsUpTo < 12);
  const summary = layout('examples/layout-contracts/text-fonts.isle', 'examples/layout-contracts/text-fonts.json', '--summary').stdout;
  assert.match(summary, /text: up to \d+ of 12 characters fit here \(widest "日"\)/);
  assert.match(summary, /derived from Noto Sans JP 16px\/400 12 × "日"/);
});

test('CSS that does not use the measured font makes the result unknown, not verified', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-text-fonts-'));
  try {
    for (const file of ['text-fonts.isle', 'text-fonts.json']) await copyFile(`examples/layout-contracts/${file}`, join(directory, file));
    const config = JSON.parse(await readFile(join(directory, 'text-fonts.json'), 'utf8'));
    config.fonts['Noto Sans JP'].file = fixtures + 'japanese-variable.ttf';
    config.viewport.min = 300;
    await writeFile(join(directory, 'text-fonts.json'), JSON.stringify(config));
    const css = await readFile('examples/layout-contracts/text-fonts.css', 'utf8');
    await writeFile(join(directory, 'text-fonts.css'), css);
    const run = () => JSON.parse(layout(join(directory, 'text-fonts.isle'), join(directory, 'text-fonts.json')).stdout);
    assert.equal(run().status, 'verified');
    await writeFile(join(directory, 'text-fonts.css'), css.replace('font-size: 16px;', 'font-size: 18px;'));
    const report = run();
    assert.equal(report.status, 'unknown');
    assert.ok(report.diagnostics.some(d => d.code === 'U_LAYOUT_TEXT_FONT' && /font-size 18px differs/.test(d.message)));
  } finally { await rm(directory, {recursive: true, force: true}); }
});

// Line breaking (UAX #14 subset): spaces, CJK ideographs/kana, Latin words, 。、 before which no line starts.
const lineCount = (profile, width) => profile.filter(entry => entry.atLeastInlineSize <= width).at(-1).lines;
test('wrapping text yields an exact line-count profile over the content width', () => {
  const text = '日本語のテキスト幅検査。折り返しを確認します。';
  const lines = metrics.breakLines({font: jp, text});
  assert.equal(lines.text, text);
  assert.equal(lines.minContent, metrics.measureText({font: jp, text: '査。'}).bound); // 。 never starts a line
  assert.deepEqual(lines.profile[0], {atLeastInlineSize: 0, lines: lines.profile[0].lines});
  for (let i = 1; i < lines.profile.length; i++) {
    assert.ok(lines.profile[i].atLeastInlineSize > lines.profile[i - 1].atLeastInlineSize);
    assert.ok(lines.profile[i].lines < lines.profile[i - 1].lines);
  }
  assert.equal(lines.profile.at(-1).lines, 1);
  assert.equal(lines.profile.at(-1).atLeastInlineSize, metrics.measureText({font: jp, text}).bound);
  // The first sentence on one line, the second on the next, from the first sentence's bound on.
  const first = metrics.measureText({font: jp, text: '日本語のテキスト幅検査。'}).bound;
  assert.equal(lineCount(lines.profile, first), 2);
  assert.equal(lineCount(lines.profile, first - 1 / 64), 3);
});

test('Latin words break at spaces; trailing spaces hang and the widest word is the minimum', () => {
  const lines = metrics.breakLines({font: ro, text: 'Hello world office'});
  assert.equal(lines.minContent, Math.max(...['Hello', 'world', 'office'].map(word => metrics.measureText({font: ro, text: word}).bound)));
  const two = metrics.measureText({font: ro, text: 'Hello world'}).bound;
  assert.equal(lineCount(lines.profile, two), 2);
  assert.equal(lineCount(lines.profile, two - 1 / 64), 3);
  // overflow-wrap: anywhere breaks inside a word that does not fit and lowers the minimum to one letter.
  const anywhere = metrics.breakLines({font: ro, text: 'office', overflowWrap: 'anywhere'});
  assert.equal(anywhere.minContent, Math.max(...[...'office'].map(c => metrics.measureText({font: ro, text: c}).bound)));
  assert.equal(lineCount(anywhere.profile, metrics.measureText({font: ro, text: 'ice'}).bound), 2); // off / ice
});

test('a wrapping text contract resolves to the line profile and its block heights', () => {
  const {'.a': resolved} = metrics.resolveBoxes({'.a': {text: {font: jp, content: '日本語のテキスト'}, wrap: 'normal'}});
  assert.equal(resolved.wrap, 'normal');
  assert.equal(resolved.textMetrics.kind, 'lines');
  assert.equal(resolved.textMetrics.overflowWrap, 'normal');
  assert.equal(resolved.minInlineSize, resolved.textMetrics.minContent);
  assert.deepEqual(resolved.intrinsicBlockSize, resolved.textMetrics.profile.map(entry => ({atLeastInlineSize: entry.atLeastInlineSize, blockSize: entry.lines * 24})));
  assert.equal(resolved.intrinsicBlockSize.at(-1).blockSize, 24);
});

test('the wrapping CLI example reports where the body needs a third line', () => {
  const result = layout('examples/layout-contracts/text-wrap.isle', 'examples/layout-contracts/text-wrap.json');
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  const body = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.body');
  assert.equal(body.axis, 'block');
  assert.equal(body.range.maxExact, '14247/64');
  assert.deepEqual(body.text, {lines: 3, fitsLines: 2});
  assert.equal(report.diagnostics.filter(d => d.severity === 'error').length, 1); // the auto title row grows with its lines
  assert.match(layout('examples/layout-contracts/text-wrap.isle', 'examples/layout-contracts/text-wrap.json', '--summary').stdout, /text: wraps into 3 lines at this width; 2 fit/);
});

test('fullwidth brackets never end a line and closing marks never start one; small kana and ー break like kana', () => {
  const quoted = metrics.breakLines({font: jp, text: '日本「語」です'});
  // Narrowest: 日 / 本 / 「語」 / で / す — the brackets stay with 語.
  assert.equal(quoted.profile[0].lines, 5);
  assert.equal(quoted.minContent, metrics.measureText({font: jp, text: '「語」'}).bound);
  const kana = metrics.breakLines({font: jp, text: 'ショッピング'});
  assert.equal(kana.profile[0].lines, 6); // every kana, small ones and ー included, may start a line
  const marks = metrics.breakLines({font: jp, text: '日々、確認'});
  assert.equal(marks.minContent, metrics.measureText({font: jp, text: '日々、'}).bound); // 々 and 、 never start a line
});

test('script runs follow Script_Extensions: ー joins the kana after a kanji, punctuation and digits join any run', () => {
  assert.deepEqual(scriptSegments('日ーア'), ['日', 'ーア']);
  assert.deepEqual(scriptSegments('「日本」と123ABC'), ['「日本」', 'と123', 'ABC']);
  // Shaped run by run, so ー and ア kern as in Chromium (16 + 15.36).
  assert.equal(metrics.measureText({font: jp, text: '日ーア'}).width, 16 + metrics.measureText({font: jp, text: 'ーア'}).width);
});

test('ASCII punctuation follows Chromium: hyphens break before letters, and before digits only inside a word', () => {
  const pieces = text => metrics.breakLines({font: ro, text}).profile[0].lines; // narrowest: one piece per line
  assert.equal(pieces('well-known'), 2);  // well- / known
  assert.equal(pieces('ABCD-1234'), 2);   // ABCD- / 1234
  assert.equal(pieces('x -1'), 2);        // x / -1: a minus sign stays with its number
  assert.equal(pieces('(Hello)'), 1);     // brackets stay with the word
  assert.equal(pieces('a/b?c'), 2);       // a/b? / c: Chromium breaks after ? before a letter
  assert.equal(pieces('Hello, world!'), 2);
  assert.equal(metrics.breakLines({font: jp, text: '日本(ABC)です'}).profile[0].lines, 5); // 日 / 本 / (ABC) / で / す
});
