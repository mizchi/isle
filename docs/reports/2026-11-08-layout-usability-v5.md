# Layout usability v5: 親イベントを子のボタンへ限定する

## Question

EVAL-04で二名が選んだ親wrapperのclickでは、見出しまでtoggleしていた。既存の `children: RenderFragment` を使って、型・所有者・row captureを保ったままボタンだけを投影できるか。追加のbrowser runtimeを必要としないことを優先した。

## Implementation and claims

- 条件式・分岐・反復・record propsを持つuniversalな受け手でもfragmentを扱う。client ownerの計画では、呼び出し元の要素をコンパイル時に展開してslotを残さない。
- 親子で同名のFor変数、collection lambda、error binderがあっても、受け手の変数が呼び出し元の値を捕捉しないよう名前を区別する。
- 親が書いたbuttonのhandlerとstateは親に残す。別client/server境界のphase・capture検査は維持し、関数をJSON propsやsnapshotへ保存しない。
- 任意callback propsを解放する新しい文法は追加しない。SSR専用ではnative buttonのHTMLを残し、marker・snapshot・JS chunkを除去する。

追加の状態遷移・資源プロトコルは導入しないため、新しい時相モデルは作っていない。lexical substitutionとphaseはコンパイラ回帰テスト、reorder・遅延import・DOM置換・破棄は既存region E2Eで検査する。compiler全体の形式証明という意味ではない。

## Result

新しい初見agentには公開ガイドだけを物理的に分離して渡し、実装・example・過去試行・報告を禁止した。元のauthor課題に「headingと余白は不活性」を追加し、4round予算を維持。独立graderは `--event-scope` を付けた。

| 観測 | 結果 |
|---|---|
| 新規consumerのgrader | 1/4roundでpass、7操作とDOM保持 |
| 見出し・余白の不活性 | pass |
| レイアウト | 5宣言verified、320/599pxは1列、600/960pxは2列 |
| consumer resume JS | 6chunk、11,856 B / chunk別gzip合計5,542 B |
| consumer SSR JS | 0chunk / 0 B |
| 旧wrapperの再検査 | 強化したprobeでreject |

通常のframework checkは2回（型不足1回・修正後成功1回）、直接buildは2回。agentが記した「通常CLI 15回」は資料閲覧・version・導入等も含むため、v2の公開CLI 4回とは同じ指標ではない。Playwrightの初回Redは、agentが意図的にtoggleを未実装にした試験で、frameworkの故障ではない。

保守者による元アプリの移植も強化graderにpassし、11,876 B / gzip合計5,562 Bだった。同じnative templateを直接記述した対照と、生成handler・region code・共有runtimeを比較している。schema hashとそのobject keyの引用の有無はアプリごとに異なるため、その表記差をruntime追加として数えない。既存の `runtime/` ファイルは変更していない。

## Agent's own words

> universalなReviewCardへ親のbuttonをchildrenで投影し、on:clickだけをtoggleへ接続した。

> 役立った原文は「見出しと余白に handler は付きません。」と診断「Record literals require a declared type」。

所有者と接続対象の意図は、初見でも読み取れた。

> stateの型推論説明にはrecordの例外が見つけにくく、SafeGrid、内容寸法、button resetの説明も別ページに分かれていた。

EVAL-07として、schema付きrecord配列の注釈例と、npm用の完結した4ファイルのガイドを追加した。実行exampleから生成し、一致をCIで検査する。Markdownから抽出した4ファイルを別consumerへ置き、通常・SSRのbuildも成功した。この文書修正後の新しい初見試行は未実施で、効果は未測定。

## Verification and next step

Node 507件、型検査、MoonBit warning-free check、専用E2E 2件、region E2E 4件、layout E2E 20件、Playground E2E 22件、Pages E2E 28件を通過した。非同期投影でも明示server actionとpolicyが残ることを検査した。

vlmkit 0.24.0のintegrity / copy / scroll / handlers / interactionsがpass。375pxと1280pxで初期・toggle後・filterと追加後の6画像を確認し、1/2列、表示件数、操作対象に欠けや重なりがないことを確認した。画面確認は宣言外の幅まで形式保証するものではない。

次の優先候補はEVAL-03の親grid / mediaへの因果出典と境界値の内訳。親所有イベントはまず既存のRenderFragmentで解決し、独立owner越境や任意関数propsは拡張していない。

- [新規consumerのコード・ログ・報告](../../evals/scenarios/lexical-events/attempts/author-v3/)
- [受入結果・旧wrapperの反例・品質結果](../../evals/results/lexical-events/)
- [完結したnpm用ガイド](../lexical-review.md)
- [EVAL-04](../issues-drafts/04-owner-event-projection.md)、[EVAL-07](../issues-drafts/07-record-state-guide.md)
