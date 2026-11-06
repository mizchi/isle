import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
const directory = fileURLToPath(new URL('../results/todomvc/profiling/', import.meta.url));
let report = JSON.parse(await readFile(directory + 'latest.json', 'utf8'));
if (report.detail === 'summary') report = JSON.parse(gunzipSync(await readFile(directory + 'raw/full.json.gz')));
report.baselineRevision ??= report.revision; delete report.revision;
Object.assign(report.conditions, { quietWindowMs: 250, cpuNetworkLatencyMs: 0,
  cpuWeighting: 'Sort absolute sample timestamps; attribute each interval to its starting sample; tail ends at profile.endTime. No missing-sample repair.' });
const round = value => value.toFixed(1);
const trial = id => report.coverage.find(row => row.case === id);
const stage = (id, phase) => trial(id).network.find(row => row.phase === phase);
const shared = trial('production').checkpoints.find(row => row.phase === 'first-input').files.find(row => /\/TodoMVC-[^/]+\.js$/.test(row.url));
const sharedChunk = Object.values(report.graphs.todomvc.chunks).find(row => row.url === shared.url);
const base = report.graphs.todomvc;
const runtimeChunk = Object.values(base.chunks).find(row => /\/isle-resume-/.test(row.url));
assert.ok(runtimeChunk && shared && sharedChunk, 'Missing measured runtime or renderer');
const first = stage('production', 'first-input');
const initial = stage('production', 'initial');
const totalBeforeAdd = initial.gzip + first.gzip;
const restoredJS = report.workloads.find(row => row.mode === 'keyboard' && row.coverage).initialNetwork.reduce((sum, phase) => sum + phase.gzip, 0);
const timing = id => report.evaluations.find(row => row.case === id).checkpoints.find(row => row.phase === 'first-input').measures.filter(row => row.detail.handlerId === 'TodoMVC.draftChanged');
const ms = (id, phase) => timing(id).find(row => row.detail.phase === phase)?.duration ?? 0;
const called = (mode, name) => report.workloads.find(row => row.mode === mode && row.coverage)?.coverage.flatMap(row => row.functions).filter(row => row.name === name).reduce((sum, row) => sum + row.calls, 0) ?? 0;
const cpu = mode => report.workloads.find(row => row.mode === mode && row.cpu).cpu;
const groups = base.groups.map(row => `| ${row.chunk.split('/').at(-1)} | ${row.ids.map(id => id.replace('TodoMVC.', '')).join(' / ')} | ${row.gzipBytes} |`).join('\n');
const network = ['production', 'no-hints', 'ungrouped', 'auto'].map(id => {
  const target = id === 'auto' ? 'todomvc-auto' : id === 'ungrouped' ? 'todomvc-ungrouped' : 'todomvc';
  const graph = report.graphs[target], begin = stage(id, 'initial'), input = stage(id, 'first-input'), add = stage(id, 'first-add');
  return `| ${id} | ${graph.groups.length} | ${graph.js.gzip} | ${begin.gzip} | ${input?.gzip ?? 0} / ${input?.requests.length ?? 0} | ${input ? round(input.fetchSpanMs) : '取得済み'} | ${add?.gzip ?? 0} |`;
}).join('\n');
const reference = path => `../../../../${path}`;
const hotFunctions = cpu('keyboard').functions.slice(0, 8).map(row => `| ${row.originalName || row.functionName || '(anonymous)'} | ${row.originalSource ?? row.url.split('/').at(-1)}${row.originalLine ? ':' + row.originalLine : ''} | ${round(row.selfMs)} |`).join('\n');
const text = `# TodoMVC のチャンク分割をプロファイラで検証

測定: ${report.generatedAt}。対象アプリの基準 commit: \`${report.baselineRevision.slice(0, 7)}\`、production manifest: \`${base.buildId}\`。

**イベントの遅延と依存チャンクの並列取得は機能している。一方、共通描画モジュールが大きく、通常キー入力にも不要な配列検査・一覧更新候補の処理が残る。** ファイル数を増やすことより、生成コードの用途を分ける方を優先したい。

## 取得と評価

空の localStorage では初期取得は bootstrap / browser host の ${initial.gzip} B gzip、1ファイルだけ。未操作の handler・region runtime は評価されなかった。最初の input で次の4ファイルを取得する。

| 役割 | gzip B |
|---|---:|
| runtime / registry | ${runtimeChunk.gzipBytes} |
| 値・key の検査 | ${Object.values(base.chunks).find(row => /\/value-/.test(row.url)).gzipBytes} |
| 共通描画 + region kernel | ${sharedChunk.gzipBytes} |
| draftChanged / add | ${base.groups.find(row => row.ids.includes('TodoMVC.draftChanged')).gzipBytes} |
| 追加合計 | ${first.gzip} |

この時点で全生成 JS の **${round(100 * totalBeforeAdd / base.js.gzip)}%**（${totalBeforeAdd} / ${base.js.gzip} B gzip）が到着する。編集・フィルターの handler ファイルすべてが来るわけではないが、それらの表示を扱う共通描画コードは来る。

500件を保存済みの別試行では、host の restore が起動時に走り、初期外部 JS は ${restoredJS} B gzip だった。空の localStorage の値を再訪ユーザーへそのまま一般化しない。

実線は操作時に有効化する並列取得、破線は静的 import。後続 handler の dynamic import は省略した。

\`\`\`mermaid
flowchart LR
  input["first input"] --> runtime["runtime / registry"]
  input --> value["value / key checks"]
  input --> renderer["shared renderer + region kernel"]
  input --> handler["draftChanged / add"]
  runtime -.-> value
  handler -.-> renderer
  handler -.-> value
  renderer -.-> value
\`\`\`

80 ms のレスポンス遅延、1 MiB/s、同じ Node HTTP/1.1 server で比較した。標準構成では4リクエストの開始差が **${round(first.requestStartSpreadMs)} ms**、最初の開始から最後の完了まで **${round(first.fetchSpanMs)} ms**。HTML 内の並列取得用 template を取り除く対照実験では開始差 ${round(stage('no-hints', 'first-input').requestStartSpreadMs)} ms、取得区間 **${round(stage('no-hints', 'first-input').fetchSpanMs)} ms** となった。manifest から生成した inert modulepreload を操作時に移す処理は有効である。

module body の先頭に診断用 mark を置いた別試行でも確認した。\`auto\` は先読みした依存を初期に評価せず、最初の操作で評価した。**fetch と evaluate は分離されている。** この mark は配布コードやサイズ比較には含めていない。

## 7ファイル、13ファイル、auto の比較

数字は gzip level 6 をファイルごとに圧縮した合計。初期 = load + 2秒 idle + 操作後の新しい250ms quiet window。JS は URL ごとに重複排除する。未要求の manifest / cost report と HTTP header は含めない。

| 構成 | handlerファイル数 | 全JS B | 初期外部JS B | 初回input追加 B / 件 | input取得区間 ms | 次のEnter追加 B |
|---|---:|---:|---:|---:|---:|---:|
${network}

- 1 handler / file では初回 input が ${first.gzip - stage('ungrouped', 'first-input').gzip} B 小さくなるが、次の Enter に ${stage('ungrouped', 'first-add').gzip} B の追加取得が発生する。全 JS は ${report.graphs['todomvc-ungrouped'].js.gzip - base.js.gzip} B 増える。現在の小さい handler の結合には意味がある。
- \`auto\` は初期に ${stage('auto', 'initial').gzip} B を先読みし、input の追加取得をなくす。これは初期取得量との交換条件であり、初期ペイロードを最優先する現在のデモでは \`lazy\` を保つ根拠になる。
- 別出力 URL の名前による微小なサイズ差も含む。1回の診断であり、実ネットワークや HTTP/2 / HTTP/3 の速度差を代表しない。

現在の物理グループは以下。source byte budget と宣言順でまとまり、\`lazy\` 指定時にはイベントの優先度を使わない。\`remove / editChanged\`、\`editBlur / clear\` は操作の関連よりサイズで相乗りしている。

| 物理ファイル | 論理境界 | gzip B |
|---|---|---:|
${groups}

## 大きいのは共通描画モジュール

共通モジュールは **${shared.bytes} B raw / ${sharedChunk.gzipBytes} B gzip**。V8 の block coverage では、最初の input までの実行範囲が ${shared.cumulativeUsedBytes} B、**${round(100 * (1 - shared.cumulativeUsedBytes / shared.bytes))}% がその時点で未実行**だった。この割合をそのまま削除可能量とは解釈しない。追加・編集等で後から使う処理や、エラー経路も含む。

コードからも、全 handler が同じ \`virtual:isle-regions/TodoMVC\` を静的 import し、全 block factory を共有していることが分かる。さらに root 用 HTML factory と更新関数の両方を生成している。root の既存 SSR DOM には更新関数（spec[1]）を使い、fresh は子 block を生成するので、**SSR と重複する root HTML factory は除去候補**である。これは coverage だけでなく呼び出し経路を読んだ判断。

参照: [生成する block factory](${reference('lib/region-codegen.mjs')})、[region の初回接続と fresh](${reference('runtime/regions.mjs')})。

## CPU と通常キー入力

CPU は production の JS を変更せず、V8 の最適化を許した別試行で採取した。1 ms 間隔のサンプリングなので、ごく短い処理で sample が0でも CPU が0とはいえない。Chrome trace と \`.cpuprofile\` の原本を保存した。

500件を localStorage から復元し、64文字を入力して最後に Enter で確定する。両方式とも最終結果は同じ501件と同じ追加文字列で検査した。

| 入力方式 | region.prepare 呼出 | region.each 呼出 | app URL の sampled self ms（参考） |
|---|---:|---:|---:|
| 通常キー（keydown + input） | ${called('keyboard', 'prepare')} | ${called('keyboard', 'each')} | ${round(cpu('keyboard').appSampledMs)} |
| input イベントだけ | ${called('input', 'prepare')} | ${called('input', 'each')} | ${round(cpu('input').appSampledMs)} |

input だけなら一覧の照合は最後の Enter の1回。通常キーでは64回の非 Enter でも余分に照合している。原因は \`TodoMVC.add\` が全 keydown に結び付き、非 Enter では \`items = items\` となることと、生成 code が実際の変化によらず \`items / draft\` を dirty として渡すこと。setter は同じ配列でも型を再検査する。CPU サンプルには値検査と region 処理が現れた。

| keyboard 試行の関数 | source map で対応した場所 | sampled self ms |
|---|---|---:|
${hotFunctions}

呼出回数は別の coverage 試行で数えた正確な回数。CPU は少ないサンプルの推計なので、上の時間比を性能倍率として断定しない。待機・Playwright の操作処理を app CPU に足していない。native 側の処理時間や描画全体を網羅した数値でもない。

## 診断 build の User Timing

profile 有効 + module mark の別試行。以下は入力から transaction 完了までの経過時間で、CPU 時間・INP ではない。

| 構成 | interaction ms | runtime ms | code ms | restore ms | run ms |
|---|---:|---:|---:|---:|---:|
${['profile', 'profile-no-hints'].map(id => `| ${id} | ${['interaction', 'runtime', 'code', 'restore', 'run'].map(phase => round(ms(id, phase))).join(' | ')} |`).join('\n')}

## 改善の優先順

1. SSR と重複する root の HTML factory を browser code から落とす。単なるファイル分割より総量を減らせる可能性がある。
2. コンパイラで非 Enter の no-op を検出し、キー条件を取得・復元の前で判定する。実際に変わった slot だけを dirty にし、同一配列の再検査・一覧照合を避ける。
3. 入力だけの scalar patch と、一覧の生成・照合、編集 UI の更新依存を分ける。renderer を分けるには、handler の import だけでなく region factory の依存単位も変える必要がある。
4. 1 handler / file を既定にする変更は後回し。現在の7分割と並列取得を基準に、初回・後続・総量を同時に比較する。

本分析では production の compiler / runtime / loading 方針は変更していない。既存ビルド設定の共通化は、hidden source map を作っても production manifest と JS サイズが変わらないことを deepEqual で確認した。

## 再現と原本

\`just todomvc-profile\`。Node ${report.environment.node}、Chromium ${report.environment.chromium}、${report.environment.platform}。CPU と詳細 coverage は別 context。coverage は V8 の最適化を無効にするため、そこで得た時間を production CPU として使わない。module 評価 mark と User Timing も独立した試行。

- [CPU: cold input](raw/cold-input.cpuprofile)、[CPU: 通常キー入力](raw/warm-keyboard.cpuprofile)、[CPU: input のみ](raw/warm-input.cpuprofile)。DevTools の Performance に読み込める。
- [Chrome trace: cold](raw/cold.trace.json.gz)、[通常キー入力](raw/warm-keyboard.trace.json.gz)。必要なら gzip を展開して読み込む。
- [要約 JSON](latest.json)、[全結果 JSON gzip](raw/full.json.gz)、[V8 coverage 詳細](raw/production.coverage.json.gz)。相互に重なる範囲は最も内側の count を使い、UTF-16 offset から UTF-8 bytes を計算している。
- CPU の negative time delta は捨てず、絶対 timestamp を復元して順序を直す。sample 間を開始側の関数へ配分し、最後は recording end までとした推計。missing sample の補間は行わない。通常 JS は診断用 source map で追える。compiler 生成の virtual JS は map がなく、直前の native module の末尾へ誤帰属させず chunk の場所を示した。生成コードから .isle への CPU source map も未実装で、イベント位置は manifest の CodeRef から辿れる。

方法の参照: [CDP Profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/)、[DevTools coverage](https://developer.chrome.com/docs/devtools/coverage/)、[DevTools の timestamp 並べ替え](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/cpu_profile/CPUProfileDataModel.ts)。
`;
await writeFile(directory + 'latest.md', text);
await writeFile(directory + 'raw/full.json.gz', gzipSync(JSON.stringify(report)));
const compactFunctions = rows => rows.filter(row => row.calls).map(({ source, url, ...row }) => row);
const summary = { ...report, detail: 'summary',
  coverage: report.coverage.map(row => ({ ...row, checkpoints: row.checkpoints.map(point => ({ ...point, files: point.files.map(({ functions, ...file }) => file) })) })),
  evaluations: report.evaluations.map(row => {
    let marks = 0, measures = 0;
    return { ...row, checkpoints: row.checkpoints.map(point => {
      const delta = { ...point, marks: point.marks.slice(marks), measures: point.measures.slice(measures) };
      marks = point.marks.length; measures = point.measures.length; return delta;
    }) };
  }),
  workloads: report.workloads.map(row => row.coverage ? { ...row, coverage: row.coverage.map(file => ({ ...file, functions: compactFunctions(file.functions) })) } : row),
};
await writeFile(directory + 'latest.json', JSON.stringify(summary, null, 2) + '\n');
console.log(`Wrote ${directory}latest.md and compact JSON; full evidence retained in raw/full.json.gz`);
