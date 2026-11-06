# 記述・読解の評価

書きやすさは初回成功、修正回数、診断、参加者の具体的な迷いで記録します。読解はソースから推測した事実を非公開の期待値で採点します。主観的な「書きやすい」を自動で証明したとは扱いません。

- `scenarios/*/brief.md`: 参加者へ渡す課題。
- `scenarios/intent/fixture.isle`: 読解の対象ソース。
- `solutions/`: deterministic grader 用の正解例。参加者は閲覧禁止。
- `expect/`: 採点用の事実。読解参加者は閲覧禁止。
- `attempts/<run>/`: 各参加者専用。過去の試行を読まない。
- `reports/`: 結果、直接の発言、修正、次回の仮説。

`just eval` で corpus を検査し、`node tools/eval.mjs author-counter <candidate.isle>`、`author-action <candidate.isle>`、`intent <answers.json>` で個別に採点します。詳細な参加者手順は各 brief にあります。LLM の評価参加は別途実行し、固定の期待値を変更して成功に合わせません。

名前付き境界の追加課題は `author-chunks`、非同期境界・計測の読解は `chunk-intent` です。課題と deterministic grader を追加した段階で、これらの新課題の参加者評価はまだ実施していません。

次段階 DSL の [inline/live/CSS 課題](scenarios/inline-live-css/brief.md) は、読解を `inline-live-css-intent` で採点できます。`.isle.next` は未実装構文の設計 fixture で、v0 compiler の対象ではありません。新課題の記述 grader、CSS 最適化の受入テスト、参加者評価は未実施です。

[制御構文の課題](scenarios/control-flow/brief.md) は、@if / @for / @switch / @try の構造、key と owner、配列全置換の費用、error boundary の範囲を読み取れるかを評価します。採点は `control-flow-intent`。`.isle.next` は resource / inline / union を含む設計 fixture です。`fixture.isle` は実装済みの同期サブセットで、型検査・SSR・browser resume・key の寿命を受入テストにしています。記述 grader と参加者評価は未実施です。

[静的部分と再開部分の課題](scenarios/static-split/brief.md) は現在の v0 で動きます。読解の採点は `static-split-intent` です。snapshot、server 初期化、再開 root、文字範囲の更新を区別できるかを評価します。参加者評価はまだありません。

[計算の寿命の課題](scenarios/computation-lifetime/brief.md) は、不変値の別名、可変 state の初期コピー、代入前後の derive の再計算を区別できるかを評価します。採点は `computation-intent` です。期待値と fixture の実行結果をテストし、誤った共有を受け入れないことを確認します。参加者評価はまだありません。

[Component と props の課題](scenarios/component-intent/brief.md) は、無指定 component の純粋な共通サブセット、明示する client/server、名前付き props、TS の分割代入の意味を区別できるかを評価します。採点は `component-intent`。実行した fixture と期待値を照合し、暗黙の client 推論・位置引数・分割代入を型注釈とする誤読を grader で検査します。参加者評価はまだありません。

[リソース接続の課題](scenarios/resource-bindings/brief.md) は、module 評価と instance 初期化、遅い取得結果、親子の寿命、widget 間の分離を読み分けます。実行 fixture とブラウザ受入検査があり、読解の自動 grader と参加者評価は未実施です。

[自動解決の課題](scenarios/resolution-loading/brief.md) は、fetch / evaluate / activate / commit と予算による先読みを読み分けます。生成 manifest と browser で検査する実行 fixture があり、読解の自動 grader と参加者評価は未実施です。

[CSS 解決の課題](scenarios/style-resolution/brief.md) は、取得・準備・適用の違い、owner と ShadowRoot、cascade の順序と予算を読み分けます。有限モデルと browser の受入検査があり、読解 grader と参加者評価は未実施です。

[Grid の課題](scenarios/layout/brief.md) は、box model と親子の幅契約、media の反例区間、明示 overflow と保証の仮定を読み分けます。`layout-intent` grader と browser 受入検査を用意し、参加者評価は未実施です。

[Container / block の課題](scenarios/layout-axes/brief.md) は、query container の選択、高さ契約と trusted な profile、両軸の反例領域を扱います。`layout-axes-intent` grader と browser 受入検査を用意し、参加者評価は未実施です。

[Reset の課題](scenarios/layout-reset/brief.md) は、reset と app の順序、box-sizing の継承、selector / layer の優先順位、解析と CSS 配布の違いを扱います。`layout-reset-intent` grader と browser 検査があり、参加者評価は未実施です。

[リジェクト例の課題](scenarios/layout-rejections/brief.md) は、契約違反と解析不足、対応版の意味、再現の成立条件を扱います。14組の実 CLI 受入検査と `layout-rejections-intent` grader があり、参加者評価は未実施です。

[入れ子と children の課題](scenarios/composition-intent/brief.md) は、Flow 風の名前付き props、静的な component 展開、children の所有権、親子で独立した resume と dispose を評価します。採点は `composition-intent`。snapshot と fixture の実行結果を照合し、親の一括復元・children の直列化・reactive client props の誤読を検査します。参加者評価は未実施です。

[静的な負荷予測の課題](scenarios/static-cost/brief.md) は、更新候補と実際の変更、構造の費用と実時間、独立した子、共有コードと instance 数を区別します。採点は `static-cost-intent`。意図的に厳しい budget と、4行を静的にして同じ budget を通す例を検査します。記述 grader と参加者評価は未実施です。

[実負荷での検証](reports/heavy-render.md) は4,096商品を描画し、静的な更新上限と browser の全行 mutation を照合します。DOM 完了・Event Timing・layout・初回 locator 検索を分けて測り、意味を説明できる範囲と、時間を静的には保証できない範囲を記録します。

[Form の課題](scenarios/forms/brief.md) は、入力の捕捉時点、native validation、ラベル・説明の関連付け、server 検査との違いを評価します。採点は `form-intent` です。記述課題は制約とラベルの変更、2 mount、キーボード操作を含みます。参加者評価は未実施です。

[共通 schema Form の課題](scenarios/forms/shared-brief.md) は、readonly 検証 endpoint、送信時の再検証、型付き FormData、pending と reset の寿命を評価します。採点は `shared-form-intent`。記述課題は password/confirmation への変更と相関検証です。参加者評価は未実施です。

[Schema 記述の比較課題](scenarios/schema-authoring/brief.md) は、同じ値契約を DSL と TS データ宣言 API で書きます。採点は `author-schema-dsl` / `author-schema-ts`。双方の正解例と、長さ制約・相関を壊した例で grader を検査します。TS 版は信頼するローカル提出コードを Node で実行します。自動採点は契約の正しさだけを確認し、書きやすさや IDE 支援の評価は参加者の記録に分けます。参加者評価は未実施です。

[ページ先読みの課題](scenarios/navigation-loading/brief.md) は、Speculation Rules の prefetch / prerender と CodeRef の loading policy、snapshot の展開、SSR 専用、非対応時の動作を区別します。採点は `navigation-loading-intent`。正解と、先読みを island 再開や必須の処理と誤解した回答で grader を確認します。参加者評価は未実施です。

[ダッシュボードの課題](scenarios/dashboard/brief.md) は、64項目とフォームの scope、静的な説明文、派生値、server action の境界を読み取れるかを評価します。採点は `dashboard-intent`。記述課題は別の時間変更 entry と派生表示の追加です。grader の正誤判定は回帰テストにし、参加者評価は未実施です。
