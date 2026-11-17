// The smallest CSS reset that makes form controls start from the same box in the chosen browsers: one rule for each
// profile value the browsers disagree on (ua-profile.mjs), written the way current resets are (font: inherit,
// margin: 0, logical properties, :where() so the reset adds no specificity). Values the browsers already share get no
// rule. Differences a reset should not decide for the design (colors, the focus ring) are returned as notes.
//
//   suggestReset({ browsers: ['chromium', 'firefox', 'webkit'], target: 'chromium' })
//     → { css, rules: [{ selector, declarations, reason }], notes: [...] }
//
// target is the browser whose values the reset keeps where it has to pick one (padding, sizes): the static checks'
// reference (chromium) by default, so an analysis with ua: target describes every browser once the reset applies.
import { uaProfiles, resolveUAProfile } from './ua-profile.mjs';

const same = values => new Set(values.map(v => JSON.stringify(v))).size <= 1;
const box = ([t, r, b, l]) => t === b && r === l ? (t === r ? t : `${t} ${r}`) : `${t} ${r} ${b} ${l}`;
const logical = (property, [t, r, b, l]) => t === b && r === l ? [`${property}-block: ${t}`, `${property}-inline: ${r}`] : [`${property}: ${box([t, r, b, l])}`];
const per = (browsers, get) => browsers.map(b => `${b} ${typeof get(b) === 'string' ? get(b) : box(get(b))}`).join(', ');

const textFields = ':where(input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="password"], input[type="tel"], input[type="url"], input[type="number"])';
const buttons = ':where(button, input[type="button"], input[type="submit"], input[type="reset"])';

export function suggestReset({ browsers = Object.keys(uaProfiles), target = 'chromium' } = {}) {
  const profiles = Object.fromEntries(browsers.map(b => [b, resolveUAProfile(b)]));
  const goal = resolveUAProfile(target);
  const P = b => profiles[b];
  const rules = [], notes = [];
  const rule = (selector, declarations, reason) => rules.push({ selector, declarations, reason });

  // Fonts: controls take the platform control font (family and size differ per browser), not the page's.
  const fonts = browsers.map(b => P(b).controlFont);
  if (!same(fonts)) rule(':where(button, input, select, textarea)', ['font: inherit', 'letter-spacing: inherit', 'word-spacing: inherit'],
    `the control font differs (${per(browsers, b => `${P(b).controlFont.family} ${P(b).controlFont.size}`)}; textarea ${per(browsers, b => `${P(b).controlFont.textareaFamily} ${P(b).controlFont.textareaSize}`)}); inheriting the page font also lets its text be measured`);
  // Checkbox and radio margins: the current resets' margin: 0.
  if (!same(browsers.map(b => [P(b).checkbox.margin, P(b).radio.margin]))) rule(':where(input[type="checkbox"], input[type="radio"])', ['margin: 0'],
    `the UA margins differ (checkbox ${per(browsers, b => P(b).checkbox.margin)}; radio ${per(browsers, b => P(b).radio.margin)})`);
  if (!same(browsers.map(b => P(b).checkbox.size))) rule(':where(input[type="checkbox"], input[type="radio"])', [`inline-size: ${goal.checkbox.size}px`, `block-size: ${goal.checkbox.size}px`],
    `the default size differs (${per(browsers, b => `${P(b).checkbox.size}px`)})`);
  // Boxes: padding and borders where they differ, at the target's values.
  if (!same(browsers.map(b => P(b).button.padding))) rule(buttons, logical('padding', goal.button.padding), `the button padding differs (${per(browsers, b => P(b).button.padding)})`);
  if (!same(browsers.map(b => P(b).button.border))) rule(buttons, [`border-width: ${box(goal.button.border)}`], `the button border differs (${per(browsers, b => P(b).button.border)})`);
  if (!same(browsers.map(b => P(b).textField.padding))) rule(textFields, logical('padding', goal.textField.padding), `the text field padding differs (${per(browsers, b => P(b).textField.padding)})`);
  if (!same(browsers.map(b => P(b).textField.border))) rule(textFields, [`border-width: ${box(goal.textField.border)}`], `the text field border differs (${per(browsers, b => P(b).textField.border)})`);
  if (!same(browsers.map(b => P(b).textarea.padding))) rule(':where(textarea)', logical('padding', goal.textarea.padding), `the textarea padding differs (${per(browsers, b => P(b).textarea.padding)})`);
  if (!same(browsers.map(b => P(b).textarea.border))) rule(':where(textarea)', [`border-width: ${box(goal.textarea.border)}`], `the textarea border differs (${per(browsers, b => P(b).textarea.border)})`);
  if (!same(browsers.map(b => P(b).select.padding))) rule(':where(select)', logical('padding', goal.select.padding), `the select padding differs (${per(browsers, b => P(b).select.padding)})`);
  if (!same(browsers.map(b => P(b).select.border))) rule(':where(select)', [`border-width: ${box(goal.select.border)}`], `the select border differs (${per(browsers, b => P(b).select.border)})`);
  if (!same(browsers.map(b => P(b).range.margin))) rule(':where(input[type="range"])', ['margin: 0'], `the range margin differs (${per(browsers, b => P(b).range.margin)})`);
  // The placeholder: its color is part of the contrast checks (Firefox dims it with opacity).
  if (!same(browsers.map(b => P(b).placeholder))) rule('::placeholder', [`color: ${goal.placeholder}`, 'opacity: 1'], `the placeholder color differs (${per(browsers, b => P(b).placeholder)})`);
  // Left to the design: one value would be arbitrary.
  if (!same(browsers.map(b => [P(b).button.background, P(b).button.color]))) notes.push(`button colors differ (${per(browsers, b => `${P(b).button.color} on ${P(b).button.background}`)}): set background-color and color on your buttons`);
  // What the controls inherit and size from, once the reset makes them inherit the page font (measured with the reset
  // applied in each browser: these are the differences it leaves open).
  if (browsers.length > 1) notes.push('the default font differs (Chromium "Times New Roman", Firefox serif, WebKit -webkit-standard): set font-family on html (the controls inherit it with this reset)');
  notes.push('a field\'s default width (its size attribute) and a range\'s default size come from the font and the browser: give them an inline-size (and block-size)');
  if (!same(browsers.map(b => P(b).focusRing))) notes.push(`the focus ring width differs (${per(browsers, b => P(b).focusRing)}): give :focus-visible an outline of your own`);

  // One rule per selector, declarations merged in order.
  const merged = [];
  for (const r of rules) {
    const m = merged.find(x => x.selector === r.selector);
    if (m) { m.declarations.push(...r.declarations); m.reason.push(r.reason); } else merged.push({ selector: r.selector, declarations: [...r.declarations], reason: [r.reason] });
  }
  const css = [`/* The smallest reset for ${browsers.join(', ')} (values kept from ${target} where one has to be picked). */`,
    ...merged.map(r => `${r.reason.map(x => `/* ${x} */`).join('\n')}\n${r.selector} {\n${r.declarations.map(d => `  ${d};`).join('\n')}\n}`)].join('\n\n') + '\n';
  return { css, rules: merged, notes };
}
