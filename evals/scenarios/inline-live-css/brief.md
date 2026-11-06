# inline / live / CSS を読む・書く

状態: 次段階 DSL の設計評価。fixture.isle.next は v0 compiler の実行対象ではありません。意図の読解は採点できます。parser / optimizer / browser の受入条件は未実装です。

## 読解課題

docs/design.md の §2.1〜2.3 と、このディレクトリの fixture.isle.next を読んでください。expect、solutions、実装、過去の attempts は読まないでください。

Counter を resume する構成と、同じ初期 HTML を SSR 専用で出す構成を想定します。stylesheet は local で、外部 DOM、global CSS、CSSOM の参照はありません。loading の指定は既定値です。次のキーを `evals/attempts/<run>/inline-live-css-answers.json` に保存します。

- `entry`: クリックで再開する論理 entry の完全名。
- `inlineForcesEager`: inline(ts) の記述自体が eager loading を要求するか。boolean。
- `doubledType`: Value<Float64> / State<Float64> / Live<Float64> の一つ。
- `dependencyTracking`: static / runtime の一つ。
- `writableNames`: event から更新できる state 名の配列。
- `retainedClasses`: 保持する local class 名の配列。
- `removedClasses`: 削除可能な local class 名の配列。
- `keepHoverRule`: 初期画面で hover していなくても button:hover を保持するか。boolean。
- `keepUnusedPulse`: この閉じた fixture で unusedPulse を保持する必要があるか。boolean。
- `ssrOnlyHasCss`: SSR 専用出力にも必要な CSS を含めるか。boolean。
- `ssrOnlyHasBrowserJs`: SSR 専用出力にも browser 用の更新 JS が必要か。boolean。

`node tools/eval.mjs inline-live-css-intent <answers.json>` で採点します。記号から別の意味を推測した箇所、state/live の混同、inline の解釈を log.md に記録してください。正答は設計の意味と一致したことを表し、実装がその契約を満たす証拠にはなりません。

## 記述課題

同じ Counter を本文が inline(moonbit) の版で書いてください。増分は +3、live の表示は count × 2 とし、button の基本色と hover 色も指定します。使わない internal event、live 計算、local class を一つずつ加え、どの成果物から消えるべきかを説明してください。本文以外の契約を変えずに書けるか、reads/writes の重複、CSS token 参照の迷いを記録します。記述の compiler grader と参加者評価はまだありません。

## 実装時の Red と受入条件

| ID | 入力・操作 | 最適化後に確認すること |
|---|---|---|
| I01 | ts / moonbit の文字列・comment・template literal に brace がある | inline の終端と原文診断が正しい |
| L01 | state→live→text/CSS value の diamond | 一つの commit で最終値だけを観測し、未影響の binding は更新しない |
| L02 | live cycle、state writes / suspend / 未承認 capability を live 内に置く | 原文位置で拒否する。局所変数だけの更新とは区別する |
| L03 | await 中に dispose、CSS の読み込みも後から完了 | state/DOM/CSS のいずれも適用しない |
| D01 | fixture の unused / unusedPulse と未接続 event/live | 該当 CSS・関数・専用 capture が成果物から消える |
| D02 | SSR 専用で fixture を出力 | 必要 CSS と初期値を保持し、browser JS/snapshot/marker はゼロ |
| C01 | 後の操作で class を追加、hover/focus、media/container の切替 | 必要 rule が残り、computed style が非最適化版と一致する |
| C02 | :is(#never, .button) と競合する通常 selector | dead token 除去で specificity を変えない |
| C03 | 離れた同一 rule、@layer の順序、custom property の継承/fallback | minify 後の cascade と computed style が一致する |
| C04 | 動的 class/animation 文字列、global/CSSOM/foreign DOM、未知 at-rule | 対象集合の宣言か保守的保持。誤削除しない |
| C05 | 将来 factory の JS/CSS を遅延取得 | CSS-ready の後に commit し、必要 CSS の取得失敗を処理する |
| S01 | client 未参照だが公開された server action | server entry と input/output/認可を保持し、client stub だけ除去可能 |

サイズは JS、CSS、HTML、snapshot、初期/遅延の request を分けます。minify 前後だけでなく CSS DCE 前後を比較し、browser では同じ操作列と computed style を確認します。新しい受入条件を green にするために期待値を実装へ合わせて変更しません。
