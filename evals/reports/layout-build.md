# レスポンシブ検査付き production build

2026-11-06。Vite の `layout` 設定を追加し、解析を配信する HTML/CSS と接続した。違反と unknown をともにビルドエラーにし、成功時だけ `isle.layout.json` を出力する。これは解析モデルの判定結果であり、判定器の健全性の機械証明ではない。

```sh
just layout-build
just layout-check
just layout-build-quality
```

[実装](../../lib/layout-build.mjs)・[型](../../lib/vite.d.mts)・[サンプル](../../examples/responsive-checked/)・[仕様と制約](../../docs/layout-checking.md)・[利用者の記述/読解課題](../scenarios/responsive-build/brief.md)。

追記: [動的構造と scrollbar の対応](layout-dynamic.md)を追加した。以下は初期の静的 profile の実装時点の記録であり、現在の対応範囲は新しいレポートと仕様を参照。

## 確認したこと

最終回帰: Node 378件、MoonBit 54件、レイアウト Playwright 13件、Pages Playwright 23件が成功。TypeScript の公開契約と `moon check --deny-warn` も成功した。build 専用21テストでは次を確認する。

- 4つの `min-width:40px` の box を、159pxで4列へ切り替える故障版は `[159,160)` の連続領域で拒否される。160pxで切り替える対応版は幅80〜300px・高さ200〜600pxで verified。整数の breakpoint だけを調べていない。
- media の高さ条件と container の横幅条件を組み合わせた違反を production build でも検出する。html/body は実際の属性・reset・padding を持つ box として解析し、仮の hostInset に置き換えない。
- 外部/追加 CSS、style の内容改変・`media=print` の後付け、実行 script、外部 origin にある同名 chunk、native tree の改変、動的分岐、scrollbar、popover、noscript、CSP meta 等は通さない。native tree の HTML nesting 違反は既存の frontend 検査でも拒否される。
- auto/lazy/preload/eager と相対 base/Pages subpath の8構成で、検査あり/なしの **全 JS チャンクのファイル名・内容が一致**する。
- 入れ子の二つの client component は snapshot をレイアウト box と誤認せずに検査できる。ブラウザーで一方をクリックし、他方を Enter キーで操作して、0〜3の値が独立に更新されることも確認した。

## 実ブラウザー照合

[画面のサンプル](../../examples/responsive-checked/)は幅320〜1280px・高さ240〜900pxの全宣言領域で verified。Chromium で幅320/375/639/640/641/1280px × 高さ240/400/900pxの **18通り**を測定し、各 box の両軸サイズが有理数の解析式と0.04 CSS px以内で一致した。

全18通りで document の縦横 overflow がなく、初期描画の raw layout-shift entry は空、script 取得と page error は0。CSS は head の所有する inline style として配信するため、外部 stylesheet の取得待ちは発生しない。JS は0で、解析器・レポートはブラウザーへ送らない。HTML の実バイト数と gzip サイズは[最新値](../results/layout-build/latest.json)に保存する。

375×900pxでは A/B・C/D の2×2、1280×900pxでは A〜D の横4列を screenshot で確認した。見出しと説明文が見え、全 tile が viewport 内にあり、重なりや欠落はなかった。画像は再実行時に `.responsive-checked/screenshots/` へ出力する。

vlmkit 0.24.0 の固定7 gate（integrity、copy、scroll、handlers、interactions、breakpoints sweep、responsive）は全て pass、suspect/warn 0。[gate 結果](../results/layout-build/quality.json)、[全解析と18サンプル](../results/layout-build/full.json.gz)、[独立 resume の取得順と寸法](../results/layout-build/client.json)を参照。サンプル計測と UI gate は受入検査であり、連続領域の証明の代用ではない。

## 残る制約

内容/font のサイズ上界は caller の信頼する契約である。browser のピクセル丸めと ink overflow、判定器の健全性や CSSOM への refinement は未証明。Vite/Rolldown の生成コードと build toolchain、stylesheet の適用を許可する HTTP 配信 policy も前提となる。後続 plugin やデプロイが HTML を書き換えた場合、ハッシュを再確認し、再検査する必要がある。

最初の profile は単一 document・静的構造/class・標準 loader・fit/clip に制限する。次の拡張候補は、全状態を列挙できる分岐の union、scrollbar gutter と可変 content のサイズ adapter、複数 mount / widget の host contract。いずれも現在の unknown を成功扱いに変えて対応するものではない。
