// Seeded generator of nested backgrounds for the contrast harness: opaque and translucent backgrounds, group opacity,
// text colours (some translucent) at normal and large sizes, and media branches on width and prefers-color-scheme.
import {random} from './visibility-fuzz.mjs';

export function generateContrastCase(seed) {
  const r = random(seed + 15485863), pick = list => list[Math.floor(r() * list.length)], int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const hex = () => '#' + [0, 0, 0].map(() => pick(['00', '33', '55', '77', '99', 'bb', 'dd', 'ff'])).join('');
  const color = () => r() < 0.3 ? `rgba(${int(0, 255)},${int(0, 255)},${int(0, 255)},${pick([0.4, 0.6, 0.8])})` : hex();
  let css = '*{box-sizing:border-box;margin:0}html,body,.page{display:grid;grid-template-columns:minmax(0,1fr)}body{margin:0}';
  css += `.page{background:${hex()};padding:8px;row-gap:8px}`;
  const texts = [];
  let body = '<main class="page">';
  for (let k = 0; k < int(2, 4); k++) {
    const depth = int(1, 3);
    let open = '', close = '';
    for (let d = 0; d < depth; d++) {
      const w = `w${k}_${d}`;
      css += `.${w}{display:grid;grid-template-columns:minmax(0,1fr);padding:6px;${r() < 0.75 ? `background:${color()};` : ''}${r() < 0.1 ? `opacity:${pick([0.6, 0.75, 0.9])};` : ''}}`;
      open += `<div class="${w}">`; close = '</div>' + close;
    }
    const t = `t${k}`, size = pick([14, 16, 19, 24]), bold = r() < 0.3;
    texts.push(t);
    // Text colours lean to the ends (near black or white) so that both passing and failing contrasts are common.
    const ink = r() < 0.6 ? pick(['#000', '#111', '#222', '#fff', '#eee', '#ddd']) : color();
    css += `.${t}{display:block;color:${ink};font:${bold ? 700 : 400} ${size}px/24px sans-serif;height:24px}`;
    body += `${open}<p class="${t}">Text ${k}</p>${close}`;
  }
  body += '</main>';
  for (let i = 0; i < int(1, 3); i++) {
    const cond = pick(['(prefers-color-scheme: dark)', `(min-width: ${int(40, 90) * 10}px)`, `(max-width: ${int(40, 90) * 10}px)`]);
    const target = r() < 0.5 ? `.${pick(texts)}{color:${color()}}` : `.page{background:${hex()}}`;
    css += `@media ${cond}{${target}}`;
  }
  return {seed, css, body, html: `<html lang="en"><body>${body}</body></html>`, texts};
}
