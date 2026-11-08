# Layout usability v1: 初見のnpm利用者は作成・修復できるか

## Question

公開READMEとガイド、配布tgzだけで、universal子・親所有state・SafeGrid契約を持つ操作可能な一覧を作れるか。別の初見agentはレスポンシブ境界の違反を修復できるか。実装・既存example・他の試行は閲覧禁止とした。

## Result

| 課題 | 独立grader | grader呼出し | agent申告round | 宣言 | SSR JS |
|---|---|---:|---:|---:|---:|
| author-v1 | pass、7操作・root保持 | 1 | 1/4 | 5 verified | 0 |
| diagnosis-v1 | pass、6幅で列数一致 | 1 | 2/4 | 5 verified | 0 |

診断側の2roundには自身の編集スクリプトの書込失敗を含む。両者とも準備中に複数回CLI/buildを実行しており、grader回数を「一度で書けた」とは解釈しない。診断側の実ソース変更はmedia境界400→408pxの一箇所。独立graderは修正前の失敗も確認した。

authorの配信JSは6chunk、合計11,933 B / chunk別gzipの合計5,566 B。SSRは0。これはconsumerが書いた一つのアプリの値で、frameworkの最小サイズではない。Z3/Wasmを配信しないことも検査した。

## What worked — agents' own words

> `requires`をviewportと混同しかけたが、「親が提供する割当領域」の説明で理解した。

> 役立った診断原文：「requires 180px but receives 178px on inline axis at viewport 404px × 800px」、範囲の「"maxExact": "408"」「"maxInclusive": false」。不足量と安全な境界が読めた。

要求する割当とCSS実装を分ける意味を初見でも読み取れた。区間の端点は実際の修正に使われた。

## What didn't / new gaps

> outputへlabelを結ぶと`E_A11Y_REFERENCE`で拒否され、spanとaria-labelへ変更した。

**修正:** EVAL-01。標準のoutput/buttonをlabelableと判定。explicit/wrapping labelの回帰テストを追加した。

> `--help`はexit2でcheckout内の実行形式を表示する。

**修正:** EVAL-02。npm bin名で表示しexit 0。

> 親Gridやmedia条件の行、408pxの算式は示されず、CLI全文は8492行。同文がbuildで4回続く。

**部分修正:** EVAL-03。`--summary`にstatus、配布区間、宣言件数、要素の行・列、重複集約を追加。既存JSONは維持。原因の親CSS・算式の自動導出とVite表示は未対応。

> pure子へ親イベントを渡す記法が見つからず親rowでclickを受けた結果、見出しクリックもtoggleする。

**未修正:** EVAL-04。agentの追加Playwright確認で見出しクリックによる更新を再現した。graderは要求された操作には合格を返すが、クリック対象の過剰な拡大を検査していなかった。この成功を完全なUXの保証とは扱わない。For内のowner安全なイベント投影を次の機能候補とする。

## Files and next run

- [課題と観測事実](../../evals/scenarios/layout-usability/)
- [authorのコード・全試行・受入結果](../../evals/scenarios/layout-usability/attempts/author-v1/)
- [diagnosisのコード・全試行・受入結果](../../evals/scenarios/layout-usability/attempts/diagnosis-v1/)
- [EVAL-01](../issues-drafts/01-output-label.md)、[EVAL-02](../issues-drafts/02-cli-help.md)、[EVAL-03](../issues-drafts/03-layout-summary.md)、[EVAL-04](../issues-drafts/04-owner-event-projection.md)

次は同じbrief・goals・4round予算で、新規agent二名に修正版tgzを渡す。新しいCLIオプションの存在だけを案内し、過去の解法や報告は見せない。小規模なagent評価であり、人間の利用者の学習時間は測っていない。
