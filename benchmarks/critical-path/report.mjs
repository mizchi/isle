import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory = new URL('../results/critical-path/', import.meta.url);
const report = JSON.parse(await readFile(new URL('latest.json', directory), 'utf8'));
const before = JSON.parse(await readFile(new URL('before.json', directory), 'utf8'));
const profile = JSON.parse(await readFile(new URL('../todomvc/profiling/latest.json', directory), 'utf8'));
const production = profile.graphs.todomvc;
const first = profile.coverage.find(row => row.case === 'production').network.find(row => row.phase === 'first-input');
const called = mode => profile.workloads.find(row => row.mode === mode && row.coverage).coverage.flatMap(file => file.functions).filter(row => row.name === 'each').reduce((sum, row) => sum + row.calls, 0);
assert.ok(production.js.gzip <= before.allJSGzip, 'Total JS must stay below the pre-optimization baseline');
assert.ok(first.gzip <= before.firstInputAdditionalGzip, 'First-input JS must stay below the pre-optimization baseline');
assert.equal(called('keyboard'), 1, 'Only Enter should reconcile the list');
assert.equal(called('input'), 1, 'Input alone must not reconcile the list');
const productionURLs = new Set(Object.values(production.chunks).map(chunk => chunk.url));
for (const script of report.results.flatMap(row => row.scripts).filter(path => path.startsWith('/todomvc/isle/'))) {
  assert.ok(productionURLs.has(script), `CLS and profiler runs must use the same production chunks: ${script}`);
}
const patterns = [...new Set(report.results.map(row => row.pattern))];
const lines = patterns.map(pattern => {
  const rows = report.results.filter(row => row.pattern === pattern);
  return `| ${pattern} | ${rows.map(row => row.width).join(' / ')} | ${Math.max(...rows.map(row => row.initial.cls)).toFixed(6)} | ${Math.max(...rows.map(row => row.initial.rawShift)).toFixed(6)} | ${Math.max(...rows.map(row => row.final.cls)).toFixed(6)} | ${rows[0].negative ? '検出成功（旧 CSS）' : rows.every(row => row.pass) ? 'PASS' : 'FAIL'} |`;
});
await writeFile(new URL('latest.md', directory), `# 初回描画のクリティカルパスと CLS

測定 ${report.measuredAt}、${report.browser}。${report.results.filter(row => !row.negative).length} ケース + ${report.results.filter(row => row.negative).length} 対照実験。全 JS を FCP 後まで停止し、その後もリクエストごとに 650ms 遅らせた。route-split は route だけ 1900ms。slow-css は render-blocking stylesheet をさらに 400ms 遅らせた。低速処理を最初の描画より前や入力後500ms以内に収めて隠す検査ではない。

| パターン | viewport 幅 px | 初期 CLS 最大 | 初期 raw shift 最大 | 操作後までの CLS 最大 | 判定 |
|---|---|---:|---:|---:|---|
${lines.join('\n')}

初期 raw shift は入力除外を適用しない全シフトの合計。操作後 CLS は recent input を除外した最大セッション（間隔1秒未満・長さ5秒未満）。操作によるリスト再配置の raw shift も JSON に残す。初期 raw shift = 0、操作後 CLS = 0、説明文の y 座標不変、SSR owner の DOM 同一性、横方向のはみ出しなしを要求した。複数 owner は状態を独立に更新し、2つ目の resume で追加 JS を取得しない。静的・SSR-only は JS 要求0件。

TodoMVC は CSS Grid の明示トラックでリストとフッターの領域を SSR 時点から予約し、長いリストには native scroll と scrollbar-gutter: stable を使う。空の時も領域を残す交換条件がある。新規挿入だけでなく、非同期で復元された既存行が後から動く問題を避けるため、URL の絞り込みを保存データの復元より先にキューへ入れる。route-split の変更前は375pxで CLS 0.064785 を検出した。

親の予約だけで、親の中にある行の移動まで防げるわけではない。初期データ・URL・CSS の適用順も契約の一部として検査する。この結果はこの fixture と3幅の Chromium 計測であり、任意 CSS・外部フォント・全ブラウザーの CLS を保証しない。FCP/LCP と要因ノードの矩形も JSON に残すが、人工的な遅延下の時間を実環境の速度と解釈しない。

## 生成コードの最適化

| 指標 | 変更前 | 変更後 |
|---|---:|---:|
| 全生成 JS gzip B | ${before.allJSGzip} | ${production.js.gzip} |
| 初回 input の追加 JS gzip B | ${before.firstInputAdditionalGzip} | ${first.gzip} |
| 500件・64文字+Enter の一覧照合回数 | ${before.keyboardEach} | ${called('keyboard')} |
| input のみ+Enter の一覧照合回数 | ${before.inputEach} | ${called('input')} |

SSR 済みの親の HTML factory は browser bundle に生成しない。子 range の factory は新規行・分岐のため保持する。同一値の代入は型検査・dirty 登録・DOM 更新を省き、実際の変更は従来の検証付き setter を通す。共通の write 処理と使用する helper だけの import により、小さな handler の重複を減らす。CPU 時間の倍率ではなく、別試行の V8 coverage による呼出回数で比較した。

サイズと CPU の[基準データ](before.json)・[更新後の詳細プロファイル](../todomvc/profiling/latest.md)・[CLS 原本](latest.json)。サイズはファイルごとの gzip level 6、production build。診断 observer はテスト専用で配布 runtime に含めない。

再実行: \`just critical-path-check\`（CLS）→ \`just todomvc-profile\`（CPU/チャンク）→ \`just critical-path-report\`。スクリーンショットは \`.critical-path/screenshots/\`。単一再現は \`node benchmarks/critical-path/run.mjs --pattern=route-split --smoke\`。部分実行の JSON は \`.critical-path/latest.json\` に保存し、全件の結果を上書きしない。

仕様の参照: [CLS のセッションと入力除外](https://web.dev/articles/cls)、[Layout Instability API](https://wicg.github.io/layout-instability/)。
`);
console.log('Wrote critical-path report');
