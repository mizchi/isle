// @supports table soundness (checklist C1): for valid values and for values broken on purpose (unknown words,
// malformed functions, repeated keywords, swapped axes), whatever the table decides agrees with CSS.supports in this
// browser — true only where the browser parses the declaration, false only where it does not. Undecided is allowed.
import {test, expect} from '@playwright/test';
import {supportsCondition} from '../packages/css-verifier/src/layout/supports.mjs';

const values = {
  color: ['red', 'foo', '#abc', '#abcd', '#abcde', 'rgb(0 0 0 / 50%)', 'rgb(0, 0, 0)', 'rgb(0 0)', 'oklch(70% 0.1 200)', 'oklch(a b c)', 'color-mix(in srgb, red, blue)', 'color-mix(in srgb, red 30%, #00f)', 'color-mix(red, blue)', 'color-mix(in srgb, foo, blue)', 'hsl(120deg 50% 50%)', 'currentcolor', 'rebeccapurple'],
  width: ['10px', 'calc(100% - 1rem)', 'calc(100%-1rem)', 'calc(foo)', 'min(100%, 40rem)', 'min(100%)', 'clamp(1rem, 2vw, 2rem)', 'clamp(1rem, 2vw)', 'max(10px, 1em)', '50cqi', '100svw', 'fit-content', 'auto', '10 px'],
  'font-size': ['clamp(1rem, 2vw, 2rem)', 'clamp(1rem 2vw 2rem)', '1.5rem'],
  transform: ['translate3d(0, 0, 0)', 'translatexyz(1px)', 'translate(foo)', 'rotate(45deg) scale(2)', 'skewx(10deg)', 'scale3d(1, 2, 3)', 'none', 'rotate(45)'],
  contain: ['layout', 'layout layout', 'layout paint', 'size inline-size', 'content', 'strict paint'],
  'touch-action': ['manipulation', 'manipulation pan-x', 'pan-x pan-y', 'pan-x pan-x', 'none'],
  'object-position': ['center', 'top left', 'left left', 'left top', '10% 20px', 'top top', 'right'],
  'backdrop-filter': ['blur(4px)', 'blur(foo)', 'brightness(50%) blur(2px)', 'hue-rotate(10deg)', 'none'],
  'accent-color': ['auto', 'red', 'notacolor', '#c00'],
  'grid-template-rows': ['masonry', 'subgrid'], 'line-clamp': ['3'],
  'scroll-snap-type': ['x mandatory', 'x x', 'both proximity'], 'scrollbar-gutter': ['stable', 'stable both-edges', 'both-edges stable'],
  display: ['inline flex', 'flex inline', 'block flow', 'grid'], 'aspect-ratio': ['auto 4 / 3', '4 / 3 auto', '16 / 9'],
};
const selectors = [':has(> img)', ':is(.a, .b)', ':nth-child(2 of .a)', ':user-valid', '::marker', ':popover-open', ':foo', '::bar', ':hover:focus-visible', 'a > b ~ c + d', ':dir(rtl)', '&'];

test('decisions of the @supports table agree with CSS.supports, on valid and broken values', async ({page}) => {
  await page.setContent('<!doctype html><html lang="en"><body></body></html>');
  const conditions = [...Object.entries(values).flatMap(([p, vs]) => vs.map(v => `(${p}: ${v})`)), ...selectors.map(s => `selector(${s})`)];
  let decided = 0;
  for (const c of conditions) {
    const d = supportsCondition(c);
    if (d === undefined) continue;
    decided++;
    expect(await page.evaluate(c => CSS.supports(c), c), `${c}: the table says ${d}`).toBe(d);
  }
  expect(decided).toBeGreaterThan(40);
});
