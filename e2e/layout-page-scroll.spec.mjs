// Checklist E1: a state change that makes the page overflow the viewport shows the page scrollbar, which narrows the
// page (where scrollbars are classic): the verifier's pageScroll says which states fit and which overflow, as the
// browser scrolls, and W_LAYOUT_SCROLLBAR_SHIFT holds exactly where html's inline size changes between the states.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
import {analyzeStates} from '../packages/adapter-core/src/index.mjs';

const css = '*{margin:0}.short{height:100px}.long{height:900px}';
const viewport = {min: 400, max: 400, height: {min: 600, max: 600}};
const states = [{html: '<div class="short"></div>', choices: {open: false}}, {html: '<div class="long"></div>', choices: {open: true}}];
const variants = ['', 'html{scrollbar-gutter:stable}', 'html{overflow-y:scroll}', 'html{overflow:hidden}'];

test('pageScroll and W_LAYOUT_SCROLLBAR_SHIFT agree with the browser\'s page width across the states', async ({playwright}) => {
  // Headless Chromium hides scrollbars by default; without --hide-scrollbars and overlay scrollbars it draws classic ones.
  const browser = await playwright.chromium.launch({ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--disable-features=OverlayScrollbar,OverlayScrollbars,FluentOverlayScrollbar']});
  const page = await browser.newPage({viewport: {width: 400, height: 600}});
  for (const extra of variants) {
    const widths = [], scrolls = [];
    for (const state of states) {
      await page.setContent(`<!doctype html><html lang="en"><head><style>${css}${extra}</style></head><body>${state.html}</body></html>`);
      const b = await page.evaluate(() => ({width: document.body.getBoundingClientRect().width, scrolls: document.documentElement.scrollHeight > innerHeight}));
      widths.push(b.width); scrolls.push(b.scrolls);
      const r = analyzeHTML(`<html lang="en"><body>${state.html}</body></html>`, {name: 'P', css: css + extra, viewport, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
      // (html's clientWidth leaves the stable gutter in until the scrollbar shows: the body's box is what moves.)
      if (!extra.includes('hidden')) expect(r.pageScroll?.overflows, `${extra} ${state.html}`).toBe(b.scrolls);
    }
    const shift = analyzeStates({states, css: css + extra}, {viewport, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]}).findings.some(f => f.code === 'W_LAYOUT_SCROLLBAR_SHIFT');
    expect(shift, `${extra}: widths ${widths}`).toBe(widths[0] !== widths[1]);
  }
  await browser.close();
});
