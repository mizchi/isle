# Layout usability v4: 要求する箱と検査中の契約を区別できるか

## Question

EVAL-05の表示修正によって、親Boardの契約と子Tileの不足幅を混同せず解釈できるか。初見agentには公開文書だけを別ディレクトリに置いて渡した。brief・goals・4round予算は同じで、過去の報告・実装・解法は渡していない。

## Result

独立graderは1呼出しでpass。media境界400→408pxの一箇所だけを変更し、契約・CSS minimum・padding・gap・tile数・domainを維持した。5宣言verified、6幅で期待列数に一致、SSR JS 0。手動CLI4回（helpを含む）とbuild2回。初回summaryは14行。

> 診断の「checked contracts: Board at Board, Tile at Board/0」は検査中の契約の列挙で、Board自身が180pxを要求する意味ではない。不足する実体は4枚の.tileで、400px時の割当は176px。

EVAL-05の混同はこのagentでは再現しなかった。診断とpadding/gapから安全な境界408pxを導けた。

## Remaining gaps and stopping decision

> 摩擦はsummaryの場所がtile要素で、原因の親grid/media行を指さないこと。

> 改善要求は①要求元契約→割当grid→mediaの位置を結ぶ、②必要な境界を寸法内訳付きで示す、③buildも重複をまとめsummaryと同じ契約・instance表示にする。

いずれもv1/v2で記録したEVAL-03の未対応範囲であり、新しい回避不能な失敗は増えていない。この周回はここで終了する。次の実装はEVAL-04（親所有イベントの静的な投影）を第一候補、EVAL-03の因果出典とVite表示を第二候補とする。任意関数propsや任意CSSへ制限を広げる前に契約を定義する。

## Overall validation

有効な独立試行はauthor二名・diagnosis三名の計5件で、全件grader pass。検索混入したv3一件は比較から除外し、未実行の記録を保存した。これはagentによる小規模な利用試験で、人間の可読性・作業時間を定量化したものではない。

修正後の既存検査はNode 500件、MoonBit 55件、layout E2E 20件、playground E2E 21件、site E2E 27件を通過。型検査と既存evalも成功した。現行MoonBitのdeny-warnで旧derive構文がエラーになるため、型宣言の属性構文へ機械的に移行した。モデルの状態遷移は変更していない。

配布物v1/v2/v3の `runtime/` 全39ファイルは同じhashだった。今回の診断・静的検査の改善による共有browser runtimeの追加はない。アプリ間のpayload差は書いた実装が異なるため、最適化効果として比較していない。layoutのverifiedは閉じたCSSと信頼した内容寸法のモデル内の結果である。

- [試行コード・全ログ・受入結果](../../evals/scenarios/layout-usability/attempts/diagnosis-v4/)
- [次の機能候補 EVAL-04](../issues-drafts/04-owner-event-projection.md)
- [診断の残課題 EVAL-03](../issues-drafts/03-layout-summary.md)
