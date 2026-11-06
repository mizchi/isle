# リジェクト例と対応版の CLI 評価

2026-11-06。直前に説明した拒否例を、実行可能な14組のシナリオとして保存した。[使い方](../../docs/layout-rejections.md)、[生成した一覧](../results/layout-rejections/index.md)、[シナリオ正本](../scenarios/layout-rejections/cases.mjs)を参照。

```sh
just layout-rejections
just layout-rejections container-breakpoint
```

各側の source / CSS / reset / layout.json を生成し、実際の `tools/isle.mjs layout` を別 process で実行する。reject は期待する status・診断・軸・対象・区間と exit 1、accept は verified と exit 0を要求する。suite の成功を、拒否コードの成功と混同しない。

## 検査対象

violated は float、Flex container、content-box による幅超過、高さ不足、折り返し契約との矛盾、container breakpoint の6例。unknown は通常の1fr、値域不明のCSS variable、祖先不足、生成pseudo box、nested layer、revert-layer、自動高さの契約不足、percentage height の循環の8例である。

container breakpoint は `[632, 648)` の反例と開いた上端を照合する。対応版では検査する viewport 範囲を狭めない。対応版は書き方や情報の補い方の例であり、任意のCSSの意味保存変換ではない。各シナリオにその差を記録した。

## TDD と回帰検査

先に実行サンプルと runner の未実装による Red を確認した。Green では全14組を実CLIで実行し、28入力の分類と終了コードを確認した。生成一覧には期待値だけを表示せず、実際の診断とPASS / FAILも表示する。

負例の制御として、期待するstatusの変更、期待codeの変更、対応版を拒否版へ差し替える変更、sourceを構文エラーへ差し替える変更をそれぞれ検査し、suiteが失敗することを確認した。構文エラーや入力設定の失敗を、期待したレイアウト拒否として数えない。重複IDと出力先の外へ出るIDも入力エラーにする。

`just ci` は MoonBit 53、Node 294、browser 123、既存形式検査92ケース・想定反例35件を通過した。layout対象はNode46、browser10。型契約と評価corpus、Form a11y 2 suite・各8 gateも通過した。[検証記録](../results/layout-rejections/validation.json)。今回の追加はCLI評価で、browserでの意味の同値性を新たに検証したものではない。

`just layout-rejections` の全件実行は28回のCLI実行で成功した。IDを指定した個別実行も成功し、存在しないIDは非0で拒否した。最終的な一覧は全14例で再生成した。[機械結果](../results/layout-rejections/report.json)。

レイアウト解析器とruntimeの対応機能は変更していない。production counter の生成JSも前段とhashまで一致し、raw / gzipの増分0 Bだった。[サイズ記録](../results/layout-rejections/size.json)。

[読解・記述課題](../scenarios/layout-rejections/brief.md)と `layout-rejections-intent` grader を追加した。unknownと不正なCSSの混同、一般的な意味保存の過大主張、構文エラーによる偽の再現をgraderの負例で検査する。独立した参加者の書きやすさ・読解評価は未実施である。
