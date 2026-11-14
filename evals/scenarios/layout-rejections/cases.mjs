// Each counterpart demonstrates a supported formulation or additional input.
// It is not a claim that arbitrary CSS rewrites preserve all browser semantics.
const card = 'component Card() { <main class="card"><p class="text">Content</p></main> }';
const baseCSS = `.card { display: grid; grid-template-columns: minmax(0, 1fr); font-family: system-ui; line-height: 24px; }\n`;
const options = {
  component: 'Card', viewport: { min: 320, max: 1000, height: { min: 200, max: 600 } },
  reset: [{ css: '* { box-sizing: border-box; margin: 0; }' }],
  boxes: { '.text': { minInlineSize: 100, minBlockSize: 24, intrinsicBlockSize: 24 } },
};
const cardExample = (css = '', extra = {}) => ({ source: card, options: { ...options, css: baseCSS + css, ...extra } });
const expected = (status, code, extra = {}) => ({ status, code, ...extra });
const inheritedReset = [{ css: 'html {box-sizing:border-box;} *, *::before, *::after {box-sizing:inherit;margin:0;}' }];
const panelSource = `component Panel() {
  <main class="shell"><section class="panel"><p class="a">A</p><p class="b">B</p></section></main>
}`;
const panelOptions = {
  component: 'Panel', viewport: { min: 432, max: 1000 },
  boxes: { '.a': { minInlineSize: 200 }, '.b': { minInlineSize: 400 } },
};
const panelCSS = `* {box-sizing:border-box;margin:0;}
.shell {display:grid;grid-template-columns:minmax(0,1fr);container:Shell/inline-size;padding:16px;}
.panel {display:grid;grid-template-columns:minmax(0,1fr);gap:16px;}
`;
const containerExample = threshold => ({ source: panelSource, options: { ...panelOptions,
  css: panelCSS + `@container Shell (width >= ${threshold}px) {.panel {grid-template-columns:200px minmax(0,1fr);}}`,
} });

export const cases = [
  {
    id: 'float', title: 'float の禁止',
    reject: cardExample('.text {float:left;}'), accept: cardExample('.text {float:none;}'),
    expected: expected('violated', 'E_LAYOUT_FLOAT'),
    note: 'Grid item の float を browser が無視する場合も、言語の禁止規則として検査する。',
  },
  {
    id: 'flex', title: 'flex のサブセット外の item',
    reject: cardExample('.card {display:flex;}'), accept: cardExample('.card {display:flex;}\n.text {flex:1 1 0;min-width:0;}'),
    expected: expected('unknown', 'U_LAYOUT_FLEX'),
    note: '初期値の flex: 0 1 auto は内容サイズと縮小に依存する。row・nowrap で、固定(flex:none と px 幅)または伸縮(flex:1 1 0 と min-width:0)の item に書く。',
  },
  {
    id: 'content-box', title: 'reset の上書きによる幅超過',
    reject: cardExample('.text {width:100%;padding:16px;box-sizing:content-box;}'),
    accept: cardExample('.text {width:100%;padding:16px;box-sizing:border-box;}'),
    expected: expected('violated', 'E_LAYOUT_ITEM_SIZE', { axis: 'inline', box: '.text' }),
    note: 'content-box の幅100%に padding が32px追加され、割当を越える。',
  },
  {
    id: 'block-height', title: '必要高さを満たさない row',
    reject: cardExample('.card {height:100px;grid-template-rows:minmax(0,1fr);}', {
      boxes: { '.text': { minInlineSize: 100, minBlockSize: 200, intrinsicBlockSize: 200 } },
    }),
    accept: cardExample('.card {height:200px;grid-template-rows:minmax(0,1fr);}', {
      boxes: { '.text': { minInlineSize: 100, minBlockSize: 200, intrinsicBlockSize: 200 } },
    }),
    expected: expected('violated', 'E_LAYOUT_CONTENT', { axis: 'block', box: '.text' }),
    note: '宣言した必要高さ200pxに対し、row が100pxしか提供しない。',
  },
  {
    id: 'wrapping', title: '折り返し契約との矛盾',
    reject: cardExample('.text {white-space:nowrap;}', {
      boxes: { '.text': { ...options.boxes['.text'], wrap: 'anywhere' } },
    }),
    accept: cardExample('.text {white-space:normal;overflow-wrap:anywhere;}', {
      boxes: { '.text': { ...options.boxes['.text'], wrap: 'anywhere' } },
    }),
    expected: expected('violated', 'E_LAYOUT_WRAP'),
    note: 'wrap:anywhere の契約を保ち、CSS を一致させる。',
  },
  {
    id: 'container-breakpoint', title: '狭い区間だけ破綻する container query',
    reject: containerExample(600), accept: containerExample(616),
    expected: expected('violated', 'E_LAYOUT_CONTENT', { axis: 'inline', box: '.b',
      range: { minExact: '632', maxExact: '648', minInclusive: true, maxInclusive: false } }),
    note: '200px + gap16px + 本文400pxが必要。viewport には padding32px も含まれる。',
  },
  {
    id: 'intrinsic-fr', title: '未対応の intrinsic minimum',
    reject: cardExample('.card {grid-template-columns:1fr;}'), accept: cardExample(),
    expected: expected('unknown', 'U_LAYOUT_GEOMETRY'),
    note: '対応版は minmax(0,1fr)。一般の1frと常に同じ意味だとは仮定しない。',
  },
  {
    id: 'css-variable', title: '値域不明の CSS variable',
    reject: cardExample('.text {width:var(--size);}'), accept: cardExample('.text {width:320px;}'),
    expected: expected('unknown', 'U_LAYOUT_VARIABLE'),
    note: '未解決の継承元を推測しない。対応版は値を明示する。有限に解決できる var() は解析可能。',
  },
  {
    id: 'inherit-boundary', title: '継承元の情報不足',
    reject: cardExample('', { reset: inheritedReset }),
    accept: cardExample('', { reset: inheritedReset, ancestors: [{ tag: 'html' }, { tag: 'body' }] }),
    expected: expected('unknown', 'U_LAYOUT_GEOMETRY'),
    note: 'CSS を変えず、実在する html/body の祖先情報を補う。ShadowRoot へ存在しない祖先を入力しない。',
  },
  {
    id: 'generated-content', title: '生成 pseudo box の未対応',
    reject: cardExample('.text::before {content:"*";}'),
    accept: {
      source: 'component Card() { <main class="card"><span class="marker">*</span><p class="text">Content</p></main> }',
      options: { ...options, css: baseCSS, boxes: { ...options.boxes, '.marker': { minInlineSize: 8, minBlockSize: 24, intrinsicBlockSize: 24 } } },
    },
    expected: expected('unknown', 'U_LAYOUT_PSEUDO'),
    note: '対応版は実 DOM の leaf として表す。配置や accessibility まで同値という主張ではない。',
  },
  {
    id: 'nested-layer', title: 'nested layer の未対応',
    reject: cardExample('@layer outer {@layer inner {.text {box-sizing:border-box;}}}'),
    accept: cardExample('@layer outer-inner {.text {box-sizing:border-box;}}'),
    expected: expected('unknown', 'U_LAYOUT_LAYER'),
    note: 'この小例を flat layer として書く。任意の layer 階層の平坦化ではない。',
  },
  {
    id: 'revert-layer', title: 'layer rollback の未対応',
    reject: cardExample('.text {box-sizing:revert-layer;}'),
    accept: cardExample('.text {box-sizing:border-box;}'),
    expected: expected('unknown', 'U_LAYOUT_CSS'),
    note: 'この例の意図する値を明示する。revert-layer 一般の意味保存変換ではない。',
  },
  {
    id: 'missing-auto-height', title: '自動高さの契約不足',
    reject: cardExample('', { boxes: { '.text': { minInlineSize: 100 } } }), accept: cardExample(),
    expected: expected('unknown', 'U_LAYOUT_GEOMETRY'),
    note: '対応版では呼出し側の責任で exact な intrinsicBlockSize を宣言する。',
  },
  {
    id: 'percentage-height-cycle', title: 'percentage と自動高さの循環',
    reject: cardExample('.text {height:50%;}'),
    accept: cardExample('.card {height:200px;grid-template-rows:minmax(0,1fr);} .text {height:50%;}'),
    expected: expected('unknown', 'U_LAYOUT_GEOMETRY'),
    note: '対応版では親と row の definite な高さを与える。元の自動高さと同じ配置とは限らない。',
  },
];
