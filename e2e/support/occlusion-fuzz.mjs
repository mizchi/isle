// Seeded generator of card grids with absolutely positioned overlays (one or two insets per axis, px and %, sizes or
// inset-filled), z-index on the overlay or the button, pointer-events: none, and media branches that move, resize
// or hide them — for the occlusion harness: a button is covered where a later, hit-testable box overlaps it.
import {random} from './visibility-fuzz.mjs';

export function generateOcclusionCase(seed) {
  const r = random(seed + 104729), pick = list => list[Math.floor(r() * list.length)], int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const cards = int(2, 5), buttons = [], overlays = [];
  let css = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}body{margin:0;background:#fff;color:#000}';
  css += `.page{display:grid;grid-template-columns:${pick(['minmax(0,1fr)', 'repeat(2,minmax(0,1fr))', 'repeat(3,minmax(0,1fr))'])};column-gap:${pick([0, 8, 16])}px;row-gap:8px;padding:8px;background:#fff}`;
  let body = '<main class="page">';
  const inset = () => pick([`${int(0, 6) * 10}px`, `${int(0, 5) * 10}%`, '0']);
  for (let k = 0; k < cards; k++) {
    const b = `b${k}`, o = `o${k}`, card = `k${k}`;
    buttons.push(b);
    css += `.${card}{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:${int(4, 8) * 10}px;row-gap:8px;padding:8px;position:relative;background:#eef}`;
    css += `.${b}{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:${int(4, 16) * 10}px;height:${int(3, 5) * 10}px;background:#246${r() < 0.2 ? ';position:relative;z-index:1' : ''}}`;
    let overlay = '';
    if (r() < 0.8) {
      overlays.push(o);
      const inline = pick([`left:${inset()}`, `right:${inset()}`, `left:${inset()};right:${inset()}`]);
      const block = pick([`top:${inset()}`, `bottom:${inset()}`, `top:${inset()};bottom:${inset()}`]);
      const w = inline.includes(';') ? '' : `width:${int(3, 20) * 10}px;`, h = block.includes(';') ? '' : `height:${int(2, 8) * 10}px;`;
      css += `.${o}{position:absolute;${inline};${block};${w}${h}background:rgba(200,50,50,.5)${r() < 0.2 ? ';pointer-events:none' : ''}${r() < 0.15 ? ';z-index:-1' : ''}}`;
      overlay = `<div class="${o}"></div>`;
    }
    body += `<div class="${card}"><button class="${b}" aria-label="Action ${k}"></button>${overlay}</div>`;
  }
  body += '</main>';
  const conditions = [() => `(min-width: ${int(40, 90) * 10}px)`, () => `(max-width: ${int(40, 90) * 10}px)`, () => '(orientation: portrait)', () => `(min-height: ${int(55, 85) * 10}px)`];
  for (let i = 0; i < int(0, 3); i++) {
    const parts = Array.from({length: int(1, 2)}, () => { const kind = r();
      if (kind < 0.4 && overlays.length) return `.${pick(overlays)}{display:none}`;
      if (kind < 0.7 && overlays.length) { const o = pick(overlays); return `.${o}{${pick(['top', 'bottom'])}:${int(0, 6) * 10}px}`; }
      return `.${pick(buttons)}{width:${int(4, 16) * 10}px}`; });
    css += `@media ${pick(conditions)()}{${parts.join('')}}`;
  }
  return {seed, css, body, html: `<html lang="en"><body>${body}</body></html>`, buttons};
}
