export const code = `client component Counter() {
  state count = 5;

  <button type="button">
    on click increment { count += 1; }
    {count}
  </button>
}`;

export function content(lang, base) {
  const ja = lang === 'ja', prefix = ja ? 'ja/' : '';
  const copy = ja ? {
    eyebrow: 'コンパイラから考える UI', line1: 'まず HTML。', line2: '操作から再開。',
    lead: '状態・表示・イベントを宣言する。Isle が依存と更新先を解析し、必要な処理だけをブラウザーへ届けます。',
    guide: 'ガイドを読む', explore: 'デモを試す', preview: 'プレビュー版をダウンロード', file: '宣言する',
    live: 'この Counter は Isle で動きます', increment: 'カウンターを増やす', reset: '戻す', counterNote: '初期値は SSR。最初の操作で状態を復元し、表示を更新します。',
    sectionTitle: '境界を明示し、仕事を減らす。', sectionLead: '何を先に決め、何を操作まで待つか。専用の宣言で、その判断をコンパイラに伝えます。',
    pipeline: '宣言から、再開まで。', first: 'UI を宣言する', second: 'ビルドで分ける', third: '操作された UI を再開する',
    firstNote: '状態、表示、イベントと server action の境界を .isle に書きます。',
    secondNote: 'SSR の HTML、snapshot、分割された JS / CSS と manifest を生成します。',
    thirdNote: 'コードの取得と実行を分け、必要な状態を復元して動的な表示だけを更新します。',
    examplesTitle: '読んだら、触って確かめる。', examplesLead: '小さな例から、更新・読み込み・寿命の違いを見てみましょう。', allExamples: '18例をすべて見る',
  } : {
    eyebrow: 'A COMPILER-FIRST UI LANGUAGE', line1: 'HTML first.', line2: 'UI on demand.',
    lead: 'Declare state, views and event boundaries. Isle analyzes what depends on what, then ships the code your interactions need.',
    guide: 'Read the guide', explore: 'Explore demos', preview: 'Download the preview', file: 'DECLARE',
    live: 'This counter is built with Isle', increment: 'Increment counter', reset: 'Reset', counterNote: 'The initial value is server-rendered. Your first interaction resumes its saved state.',
    sectionTitle: 'Clear boundaries. Less work.', sectionLead: 'Decide what belongs in the page and what can wait. Give the compiler enough structure to make that separation.',
    pipeline: 'From declaration to interaction.', first: 'Declare the UI', second: 'Split at build time', third: 'Resume on interaction',
    firstNote: 'Write state, views, events and explicit server action boundaries in .isle.',
    secondNote: 'Generate SSR HTML, snapshots, split JS / CSS and a dependency manifest.',
    thirdNote: 'Separate fetching from execution. Restore needed state and update dynamic output.',
    examplesTitle: 'Read it. Then try it.', examplesLead: 'Small, focused examples make updates, loading and lifetimes visible.', allExamples: 'Explore all 18 examples',
  };
  Object.assign(copy, { guideURL: base + prefix + 'docs/quick-start.html', examplesURL: base + prefix + 'examples/', downloadURL: base + 'downloads/isle-prototype-0.0.1.tgz' });
  const features = ja ? [
    { id: '01', title: '初期化を繰り返さない', body: 'サーバーで作った HTML と保存した状態を使います。コンポーネント全体の初期化をブラウザーでやり直しません。' },
    { id: '02', title: '更新する場所を先に知る', body: '状態と表示の依存をビルド時に解析。変化に関係する DOM を更新するコードを生成します。' },
    { id: '03', title: 'Web のまま配る', body: 'ES2023、DOM、ES modules。通常ページにも、独立した Web Components widget にも。MoonBit / Wasm runtime の配布は不要です。' },
  ] : [
    { id: '01', title: 'Resume, without replay', body: 'Use the HTML and saved state from the server. Component initialization does not run all over again in the browser.' },
    { id: '02', title: 'Know what can change', body: 'Analyze state-to-view dependencies at build time. Generate update code for the DOM affected by each change.' },
    { id: '03', title: 'Ship the web platform', body: 'ES2023, DOM and ES modules. Build regular pages or independent Web Components widgets, without a MoonBit / Wasm runtime.' },
  ];
  const demos = (ja ? [
    ['hello', '最小の Counter', 'SSR からの再開と、独立した小さな handler。'],
    ['resources', '寿命のあるリソース', '操作で timer を取得し、unmount で一度だけ解放。'],
    ['styles', 'CSS を待ってから再開', '依存する CSS が適用されてから setup を実行。'],
  ] : [
    ['hello', 'A minimal counter', 'A server-rendered value and a small handler, ready to resume.'],
    ['resources', 'Resources with a lifetime', 'Acquire a timer on interaction. Dispose it once on unmount.'],
    ['styles', 'Wait for the stylesheet', 'Apply a component’s CSS before its setup is allowed to run.'],
  ]).map(([id, title, body]) => ({ id, title, body, href: base + 'demos/' + id + '/', action: ja ? title + 'を開く' : 'Try ' + title.toLowerCase() }));
  return { copy, features, demos, code };
}
