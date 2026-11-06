# README 説明画像の検証

読者像と質問を explainer で整理し、実装・実行結果を根拠に HTML / CSS の説明図を作成した。画像生成 AI は使わず、Playwright で文字と配置を描画する。

2026-11-06 の結果：

| 検査 | 結果 |
| --- | --- |
| 掲載コードの実行・画像と生成元の整合性・README の画像選択 | pass |
| 図の根拠となる実装検査 | 28 pass / 0 fail |
| explainer figure-check：重なり・はみ出し・文字サイズ・事実ラベル | CLEAN |
| explainer verify-doc：引用と解説ページ | VERIFIED |
| vlmkit：図の integrity / contrast、README 配置 | CLEAN / コントラスト違反0 |
| vlmkit responsive：375〜1040px、seed 1 | 24ケース / 違反0 |
| ローカル参照の検査：README と追加文書3件 | 参照切れ0 |

同日の英日 README / examples 更新では、説明画像にも英語版を追加した。日本語・英語それぞれの図を figure-check と vlmkit に通し、両言語の README の画像切替を検査した。利用側 README の最小アプリは npm archive から展開した public API でビルドし、compiler の開発環境を必要としないことを別途確認した。機能別 examples は15例、新規8 UI の vlmkit 検査は40件、Playwright は21件が通過した。

## 再実行

```sh
just overview-build
just overview-check
just overview-quality
```

- Counter をコンパイルし、SSR の snapshot 0 から生成 handler で 1 に更新する。動的テキストの更新先は1つ。
- 図中のコードを `counter.isle` と照合し、事実ラベルと禁止した過大な主張を検査する。
- HTML 図を375・620・621・728・740・741・760・1040pxで調べ、カード内の文字のはみ出しを検出する。
- root README の実際の picture を描画し、375・760・761・1040pxで画像選択・読み込み・代替テキストを検査する。
- 保存済み PNG と生成元のハッシュを [render.json](render.json) に記録する。OS ごとのフォント描画差は失敗扱いにしない。
- vlmkit の integrity・contrast と、375〜1040pxの responsive 24ケースを検査する。README の配置も integrity で検査する。

explainer がインストールされた環境では、次も実行する。`EXPLAINER_SKILL` にインストール先を指定できる。

```sh
EXPLAINER_SKILL="${EXPLAINER_SKILL:-$HOME/.agents/skills/explainer}"
node "$EXPLAINER_SKILL/scripts/verify-doc.mjs" docs/overview --write
```

この検査は図の文字の重なり・はみ出し・小ささ・事実ラベル、light / dark / mobile の描画、引用コードと実行結果、解説ページの integrity / contrast を調べる。画像中の主張は [根拠表](facts.md) と、[checks.json](checks.json) の実装検査28件で対応づける。

## 初見レビューの範囲

first-reader の手順で、PC で読む好意的な TS / React 開発者と、スマートフォンで読む慎重な開発者を仮定した。新しいコンテキストのエージェントが README 冒頭と画像だけを読んだ。実際の人のユーザーテストではない。

初回は SSR・先読み・操作時の resume の違いと widget 対応が伝わった。CSS の導入先と契約の範囲が見つけにくく、「依存閉包」などは意味が残らなかった。これを受け、CSS のガイドリンクと「宣言したサイズ契約の範囲」を追加し、図中の用語を具体化した。生の記録は `.first-reader/overview/` に保存し、配布対象から除外する。

改稿後は新しい読者エージェントで再検査し、両方の読者像で先読みと setup の違い、Form / widget / CSS の入口を読み取れた。慎重な読者も CSS を「宣言したサイズ契約の範囲に限り、unknown も返す」と解釈した。起動手順や詳しい検査条件はリンク先で確認する段階で、モバイルの図が縦長である点は残る。

npm 利用者向けの再構成も、英語・日本語の新しい読者コンテキストで検査した。導入する3ファイル、public import、利用者に MoonBit / Z3 / clone が不要なこと、Form / CSS / cleanup / widget の例を探せた。archive の入手先とビルド時 HTML 生成が不明という反応を受け、配布 archive へのリンクと生成時期の説明を追記した。記録は `.first-reader/consumers/run1/`。

## 掲載の境界

prototype の現在の機能を説明する図であり、実運用の安定性、他 framework より速いこと、任意 CSS の正しさ、compiler / browser 全体の形式証明を保証しない。任意 TS / inline と compiler からのモデル自動生成は図にも今後の機能と記した。
