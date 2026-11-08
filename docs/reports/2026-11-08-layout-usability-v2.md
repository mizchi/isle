# Layout usability v2: 短い診断と修正後のnpm利用

## Question

v1で得たEVAL-01〜03を修正し、同じbrief・goals・4round予算で新しい二名が使えるか。公開ガイドと配布物だけを許可し、新しいCLIオプションの存在だけを案内した。過去の解法は見せていない。

## Result

| 観測 | v1 | v2 |
|---|---|---|
| author: 独立grader | pass / 1呼出し | pass / 1呼出し |
| diagnosis: 独立grader | pass / 1呼出し | pass / 1呼出し |
| diagnosis: 最初に読んだ診断 | JSON 8,492行 | summary 14行 |
| author: resume JS | 11,933 B / 6chunk | 11,909 B / 6chunk |
| SSR JS | 両課題0 | 両課題0 |

v2 authorは公開CLI4回・手動build1回・grader1回、失敗終了0件。diagnosisはCLI3回・通常build2回（初期の意図的な失敗1回）・grader1回。通常の操作7件、root保持、列切替、配布domain、子の契約を独立graderで再確認した。author-v2は親のrowを112pxにしており、v1とは実装が異なる。JSの24 B差をframework最適化の効果とは解釈しない。

同じシナリオでも各agentの探索量は異なる。v1 authorは待ち時間にlabelの追加probeを行い、v2はそのprobeを行っていない。失敗数をそのまま改善率にしない。EVAL-01はコンパイラ回帰テストで確認し、v2が新しいlabel記法を自然に選んだとは主張しない。

## What worked — agents' own words

> 役立った原文は「Declared instances: 5 verified」と「Deployment: width [320, 960]px; height [640, 960]px」。短い要約で設定した領域と結果を確認でき、JSONも別保存できた。

> 初回診断「width [400, 408)px; height [640, 960]px」と「requires 180px but receives 178px」が有用。

診断側は区間の境界と必要寸法からmedia条件だけを修復できた。requiresと配布viewportを区別し、ensures省略を両軸fitとして読めた。

## What didn't / new gaps

> BoardのE_LAYOUT_FITが子の180pxをBoardの必要幅のように表示すること。

**修正:** EVAL-05。不足寸法は反例のbox/pathへ結び付け、検査中の契約を別に表示する。status・数式・JSONは変更しない。

> 構文リファレンスには「Node 24+、pnpm、MoonBit が必要です。」が残り、npm手順と混同しやすい。

**修正:** EVAL-06。npm向けCLIと開発者向けtoolchainを分離した。

> pureなReviewCardに親のイベントを渡す記法が見つからず、For内ではRenderFragmentも未対応なこと。

**未修正:** EVAL-04が再現。v2も親wrapperでclickを受けた。二名が同じ回避策を選ぶため、親所有イベントの限定的な投影を次の機能候補の最優先とする。SafeGrid / content bounds / button resetを組み合わせた最小例も要望された。

## Next run and exclusion

EVAL-05を新しい診断agentで再評価する。diagnosis-v3は公開ガイドの検索で禁止したissue draftの断片が混入したと自己申告した。インストール・編集・CLI/build・graderの前に停止し、比較から除外した。記録は削除せず残す。再試行v4では公開文書を物理的に別ディレクトリへ分離した。

- [author-v2](../../evals/scenarios/layout-usability/attempts/author-v2/)
- [diagnosis-v2](../../evals/scenarios/layout-usability/attempts/diagnosis-v2/)
- [除外したdiagnosis-v3](../../evals/scenarios/layout-usability/attempts/diagnosis-v3/)
