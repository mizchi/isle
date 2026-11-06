# Schema DSL の責務の見直し

決定: schema は値の形と閉じた同期制約を宣言する小さな言語とする。非同期検証は action の authorize 後に宣言し、同じ schema を利用する action の間で暗黙に共有しない。

実装で再現した区別は、同じ Email schema に対して signup は空き確認、edit は別の検証、saveDraft は非同期検証なし、という3 action である。認可を拒否された edit では validator を呼ばず、validation-only request は commit を呼ばない。認可失効後に検証結果を返さない既存テストも維持する。

値契約は `schema-contracts.d.ts` と `toSchemaIR()` に集約した。DSL の診断位置を落とした IR と `defineSchema()` の出力を比較し、同じ入力の検証結果が一致することを回帰テストにした。normalizer は任意関数・不明な制約・矛盾を拒否する。負のゼロを equals に指定した場合の DSL / TS の差も修正した。

記述比較の受入条件は `schema-authoring/brief.md` に固定した。grader は reference solution を受理し、下限を7に変更した提出と sameAs を外した提出を両形式で拒否する。ソースの bytes/行数と IR bytes は自動採点で記録するが、書きやすさを示す値とは扱わない。参加者の初回成功・修正回数・迷い・IDE 支援は未計測で、優劣はまだ決定していない。

TS 版は通常のビルド側コードとして実行するデータ API であり、静的な TS AST 抽出・Content Mapper・外部 schema import の評価ではない。MoonBit の schema 宣言 API、既存 schema library adapter、schema 別の検証コード生成も後続である。

既存 veri モデルは今回変更していない。今回追加した action ごとの validator 選択と Schema IR の同値性は実装テストの範囲であり、既存の形式検査の成功からそれらの一般的な証明を主張しない。

最終の `just ci` は成功した。MoonBit 27 tests、Node 102 tests、E2E 47 tests、veri 27 cases / 10 broken variants、native / schema Form 各8 a11y gates を実行した。desktop / mobile の初期・エラー・保存後の6画像を確認し、ラベル・入力・エラー一覧・保存表示に重なりがないことを確認した。

契約の構造検査を最初は browser の共通処理にも載せ、遅延 Form chunk が gzip 353 bytes 増えた。構造検査と正規化を build/server 側の `lib/schema-normalize.mjs` へ分け、最終の同 chunk は4152 → 4157 bytes gzip、共通比較ケースの初期外部 JS は698 bytes gzipを維持した。計測条件と全 asset の前後値は [schema-review.json](../results/schema-review.json) に残す。検証関数を完全に静的生成した結果ではない。

正解例の参考値は DSL が136 bytes / 4行、TS が import を含め247 bytes / 6行で、Schema IR は双方318 bytesだった。この差だけから入力しやすさや保守性の優劣は判断しない。
