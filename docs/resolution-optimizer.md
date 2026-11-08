# コンパイラによる解決時期の最適化

2026-11-06。UI の依存・効果・寿命を解析し、再開可能なコードと状態遷移モデルを生成する言語を目指す。CodeRef の解決時期は compiler / build pass が計画する。現在はイベント種別と生成後の JS / CSS サイズによる `auto` 計画、CSS-ready と owner の確認後に評価・適用へ進む経路を実装した。型付き遷移・effect 推論・task policy・CSS の必要性解析からの統合計画は後続である。

## 四つの段階

| 段階 | 意味 | 前倒しできる条件 |
|---|---|---|
| fetch | module / asset を取得・準備する | manifest の依存閉包と取得予算に従う |
| evaluate | module のトップレベルを評価し export を解決する | auto/lazy は CSS-ready・適用後に解決する。明示 eager は起動時の評価を許可する |
| activate | handler / resource setup を対象 owner に結び付けて実行する | 操作または明示 resume、snapshot 検査、owner の生存確認 |
| commit | state と準備した DOM patch を反映する | owner generation と対象 DOM がまだ有効であること |

modulepreload は handler 呼び出しでも snapshot 復元でもない。取得が終わっても component と resource を一括初期化しない。setup と handler の code を並列取得し、setup の登録を先に行い、登録された非同期取得の完了は handler を待たせない。unmount 後の取得完了は公開せず cleanup へ回す。これらの実行規則は既存の owner / resource kernel が担う。

**コードの取得時期と、生リソースの取得開始は別の計画にする。** fetchUser のコードを先読みしても API request は開始しない。resource / server action の実行を前倒しするには、認可・引数の確定・effect・scope の契約が別途必要になる。

## 実装済みの auto 計画

```js
isle({
  entry,
  mounts,
  loading: 'auto',            // 既定値
  autoPreloadGzipBytes: 8192, // 自動で追加する JS / CSS 取得の予算
});
```

通常のアプリは境界ごとに QRL の URL や先読み時期を書かない。DSL の名前付き event と resource 設定から CodeRef を生成し、Vite / Rolldown が物理 chunk を決定した後、次の pass を実行する。

1. 明示した `lazy` / `preload` / `eager` を保持する。同じ component の複数 mount は明示 policy を auto より優先し、明示 policy 同士は既存の強い指定を採る。
2. auto の `input` / `change`、次いで `submit` / `invalid` を先読み候補にする。他のイベントと単独の resource は操作時の取得を保つ。
3. 各候補の runtime・resource CodeRef・静的 import の閉包を求める。無関係な dynamic import と子 component の entry へは広げない。
4. 明示 preload / eager と選択済み候補が取得する URL を差し引き、追加の gzip bytes を算出する。
5. 予算に収まる候補のうち、イベント優先度、追加 bytes の小ささ、境界 ID の順で選ぶ。共有依存が増えるたびに追加費用を再計算する。
6. サイズ不明・外部 import のある追加依存は `unknown-size`、予算外は `budget` として lazy に残す。
7. 選択した閉包を HTML の modulepreload、widget では descriptor の preload に下げる。未選択の操作では、既存の inert template から依存を並列取得する。

予算は生成された各 JS / CSS file の gzip level 6 を、物理 URL ごとに一度だけ合計する。bootstrap、HTML、font / image、API response、明示 preload / eager はこの「自動で追加する資産」の予算へ含めない。0 なら新しい資産を自動追加しないが、明示指定で既に準備する閉包を再利用できる。先読みはブラウザーへのヒントで、未取得でも通常の import / stylesheet load で解決する。HTTP cache・転送時間・イベント完了時間の上限ではない。

小さい handler の packing も auto のイベント優先度ごとに分ける。非連続の click sibling は同じ group にできるが、input の先読みに巻き込まない。schema Form は独立した境界を維持する。budget が小さく先読みされなかった場合も、この group 分けは維持する。これは一つの決定的な greedy 戦略で、最適な分割・配置を証明したものではない。

development は最終 gzip サイズが未確定なので、auto 候補を保守的に lazy とする。明示 preload / eager は使用できる。production build と `just chunks` で最終判断を確認する。

## 説明と検証

`isle.manifest.json` の `resolution` は strategy、budget、追加 bytes、各境界の要求・結果・理由・依存 URL を保存する。`initialBy` は、その境界の物理 module を初期取得する entry ID を示す。例えば resource 自体が lazy でも、input handler の依存として取得されることを区別できる。`just chunks` も同じ判断を返す。実行時 registry は従来の CodeRef のままで、ブラウザへ planner や費用表を import しない。snapshot / registry は同じ形式を保ち、CSS 対応の共有 engine は ABI 7、transport は ABI 3にする。

```sh
just loading-check
just chunks dist/isle.manifest.json
```

Node は予算、共有依存、手動指定、サイズ不明、将来 dynamic chunk の除外、packing を検査する。Chromium は予算8192 / 0の双方で、実際の request・module 評価・snapshot 復元・setup・unmount を区別して観測する。SSR 専用では resource module を解決せず JS / preload / planner を出力しない。

## 次の段階

Qwik 2との照合と生成物の監査を踏まえ、[resume意味論の実装順](resume-semantics.md)を具体化した。通常templateとregionで共通の依存解決・値phase IRを実装し、regionでも未使用入力とSSR初期化専用入力をsnapshotから除去する。次はguard付きconsumer、regionのCodeRef分割、read-only live入力へ進む。入口ごとのregion captureなど、未達の条件は `just resume-semantics-audit` で再現する。

採用した方向性は、型付き状態・遷移、effect / capability、競合方針と scope、差分 collection、操作と accessibility の契約、外部 DOM の所有境界、IR からのモデル抽出である。最初に状態・遷移と task scope の意味を定義し、その IR を実行コードと検証へ接続する。

- **解決の制約グラフ**: export / capture / setup / handler / CSS-ready / commit の前後関係を生成し、並列に準備できる依存を compiler がまとめる。既存の JS 実行順からこの IR への対応も検査する。
- **CSS**: [CodeRef の CSS 依存と準備ゲート](style-resolution.md)は実装した。初期 SSR と将来 region の CSS の分類、class token の意味解析・不要規則の除去を次の対象にする。
- **より早い評価・実行**: pure / effect summary と明示的な契約がある場合だけ検討する。opaque な TS の top-level effect を auto が安全と推定しない。
- **profile による計画改善**: build ID と境界 ID の付いた測定から頻度・cold cost を受け取り、次回 build の判断材料にする。現在は profile 入力や online 学習を使わない。
- **検証**: source の閉じた状態・event・effect から有限モデルを抽出し、fetch / evaluate / activate / commit の反例を生成コードへ再生する。現在の owner / resource の参照モデルと browser tests は、この変換全体の refinement 証明ではない。

参考: [Qwik QRL](https://qwik.dev/docs/advanced/qrl/) は symbol と capture を伴う遅延参照、[Vite の async chunk 最適化](https://vite.dev/guide/features#async-chunk-loading-optimization)は共有依存の並列取得、[SSR manifest](https://vite.dev/guide/ssr#generating-preload-directives)は module ID から配信ファイルへの対応として参照した。Isle はこれらを DSL の境界と owner の実行規則に結び付ける。
