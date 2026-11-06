# 配信するレスポンシブ UI を build で検査する

[サンプル](../../../examples/responsive-checked/)を読み、Vite plugin を使うアプリとして次を実施する。API は `@isle/prototype/vite` の `layout` だけを利用し、ランタイムの resize listener は追加しない。

1. 幅320〜1280px、高さ240〜900pxを宣言し、640pxを境に4列/2列を切り替える。reset の box-sizing を実配信と一致させる。
2. tile の `min-width` を160pxへ変え、ビルドが失敗する理由を親の padding/gap も含めて説明する。
3. `overflow:auto`、外部 stylesheet、動的 class を一つずつ追加する。未知を成功扱いする設定を探さず、なぜ現在の保証に必要な前提を満たさないか説明する。
4. `isle.layout.json` の配信 HTML ハッシュ、範囲、前提を読み、内容/font の上界を誰が保証するか答える。

合格条件: 通る例と拒否例を実行でき、指定 CSS の配信が自動であること、CSS のパスの基準、unknown の扱い、サンプル点と連続領域の違いを読み取れる。判定器の機械証明や全 Web 入力への保証を主張しない。

実装回帰: `tests/layout-build.test.mjs`。ブラウザー照合: `e2e/layout-build.spec.mjs`。読み書きの独立した利用者評価は今後この課題で行う。
