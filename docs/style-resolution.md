# CodeRef と CSS の準備・適用

2026-11-06。Vite が非同期 chunk に抽出した CSS を manifest の依存として扱い、CSS-ready と owner の確認後に module 評価・setup・更新へ進む経路を実装した。専用 CSS DSL、class token の意味解析、未使用 selector の除去は後続である。

## 書き方

現在は resource module から通常の Vite CSS import を使う。

```js
// panel.resources.mjs
import './panel.css';

export function setup({ root, owner }) {
  // この時点では必要な stylesheet が適用されている。
  const observer = new ResizeObserver(() => {});
  owner.own(observer, value => value.disconnect());
  observer.observe(root);
}
```

```js
isle({
  entry,
  mounts,
  resources: { Panel: './panel.resources.mjs' },
  loading: 'auto',
  autoPreloadGzipBytes: 8192,
});
```

CSS Modules と Vite が扱う CSS preprocessors も同じ静的依存として収集する。`?inline` / `?raw` / `?url` の値は stylesheet と区別する。CodeRef の CSS は現在 `build.cssCodeSplit: true` が必要で、false は欠落を黙認せず build error にする。

初期 SSR の表示に必要な CSS は、index.html や client entry の通常の import で配布する。resource module の遅延 CSS だけへ依存させない。初期表示と将来の branch の CSS を自動分類する仕組みは、今後の template / class token IR で扱う。ここでの準備ゲートは production build の機能で、development は Vite の通常の CSS injection / HMR に従う。

## 解決の順序

```text
JS / CSS fetch（manifest の閉包を並列取得）
  → stylesheet の load / parse（まだ適用しない）
  → owner / generation / root の再確認
  → CSS の適用
  → CodeRef の export 解決・module 評価
  → resource setup
  → handler
  → owner と対象を再確認して state / DOM commit
```

auto / preload は `<link rel="preload" as="style">` で取得だけを前倒しする。CSS を取得しても module 評価、snapshot 復元、setup、CSS 適用を起こさない。操作時には inert な stylesheet metadata から native link を作り、`media="not all"` で準備する。必要な CSS の load が全て成功した後、まだ有効な owner からだけ適用する。module の評価を先に進めないため、CSS を前提にするコードも未準備のまま実行しない。

明示 eager は起動時の評価を許可する指定である。Document には eager CSS の stylesheet link を module script より前に準備し、通常の読み込み成功時は CSS の準備後に評価する。widget は自分の ShadowRoot の CSS を待ってから mount module を読み込む。ネットワーク失敗時を含め、DOM 計測や所有リソースの確保は setup に置く。handler / setup / commit の前には eager でも CSS ゲートを通す。

JS の取得は従来の modulepreload によって CSS と並行する。準備を待つための一般的な dependency graph interpreter を browser へ配布しない。適用済みの CSS は、後続イベントで Promise の待機や media の再設定を省く。

## 順序・失敗・破棄

- 1 root 内の同じ URL は一つの準備 Promise / stylesheet を共有する。別 widget の root には別 link を作る。
- compiler の依存順から stylesheet の挿入位置を先に確保する。後の entry が先に操作されても、framework が管理する CSS の cascade 順序を逆転させない。既存の無条件な stylesheet が既に ready の場合は、その位置を保って再利用する。
- CSS の失敗では setup と更新を行わず onError に通知する。失敗した link は除去し、次の操作で再試行できる。
- 待機中の dispose・DOM 削除・別 ShadowRoot への移動では、CSS の適用・setup・更新を行わない。
- root の close は CSS 待機を終了する。native の先読み要求まで中止できたという保証ではない。既に開始した native JS import は従来どおり独立した完了待ちを持つ。
- 適用済みの CSS は root の共有資産として保持する。component 一つの dispose で他の instance のスタイルを外さない。widget の切断ではその ShadowRoot 自体が片付けられる。

CSS-ready は stylesheet の準備を意味する。font / image の完了、layout の実時間、CSS の全意味保存まで保証するものではない。

## Manifest・widget・サイズ

manifest の `chunks[*].styles` は CSS asset のファイル名を持ち、`styles` 表は URL・raw / gzip bytes を持つ。`planCodeLoad()` は JS と静的な CSS 閉包を重複排除し、将来の dynamic import を含めない。auto の追加 gzip 予算は、生成された JS と CSS の両方を数える。`just chunks` の coldGzipBytes も両方を含み、styleGzipBytes を別に表示する。

HTML の stylesheet metadata は template に入れる。widget は descriptor-relative な URL を持ち、SDK が descriptor 自身を base として扱う。`preloadStyles` は provider 内の CSS 取得ヒントであり、host document への適用ではない。root の準備ゲートは `Symbol.for('isle.style.gate/1')` によって、別 bundle の SDK と engine からも共有する。

transport は `isle/widget/3`、共有 engine は `isle/client/7`、Custom Element の登録印も v3 にする。旧 transport / engine と混在させず、最初の静的 widget が後続の CSS 対応を欠落させないようにする。descriptor の wire version は2、snapshot は2、registry は従来の位置 ABI のままである。

CSS capability は CodeRef の静的 module graph を読み終えてから決め、AST の define pass と最終 minify で未使用経路を除去する。判定できなかった CSS 依存が最終 chunk に残る場合は build error にする。共有 widget の transport / engine は完全な CSS 機能を持つ。

低水準の `eagerLoad()` を browser 外から使う場合は、`loadStyle(url)` adapter を明示する。CSS 依存があるのに adapter がなければ、module を評価する前に拒否する。

## 検査範囲

```sh
just style-check
just verify
```

MoonBit / veri の [style_resolution](../models/style_resolution/model.mbt) は1 owner の cold 解決を30状態で完全探索する。CSS-ready と寿命を守る版の安全性と、setup・commit・破棄への到達性を検査する。CSS-ready を無視する版と owner を無視する版には、再生可能な反例が得られる。有限モデルから browser 実装全体への refinement 証明ではない。

実ブラウザでは CSS 応答を barrier で止め、module 評価・setup・更新・破棄を観測する。エラー後の再試行、手動 resource access、逆順の操作、eager、複数 ShadowRoot、取得完了前の widget close も検査する。詳細と測定条件は [評価記録](../evals/reports/style-resolution.md)へ保存する。

参考: [Vite CSS code splitting](https://vite.dev/guide/features#css-code-splitting)、[HTML stylesheet link](https://html.spec.whatwg.org/multipage/links.html#link-type-stylesheet)。
