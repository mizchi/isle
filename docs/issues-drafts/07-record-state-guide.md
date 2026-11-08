# EVAL-07: record配列の注釈と関連するレイアウト手順を見つけにくい

> stateの型推論説明にはrecordの例外が見つけにくく、SafeGrid、内容寸法、button resetの説明も別ページに分かれていた。

出典: lexical-events の新規consumer評価 `report.md`。親所有イベントの投影は初見で実装でき、強化したgraderに1roundで合格した。最初の失敗は `E_TYPE: Record literals require a declared type` だった。

状態: ドキュメントを修正。stateの説明でrecord配列のschemaと `state reviews: Review[]` を明示し、npm用の4ファイルをまとめた[完結例](../lexical-review.md)を追加した。ガイドは実行可能なexampleから生成し、`node tools/write-lexical-guide.mjs --check` で一致を検査する。

構造的なrecord型推論そのものは追加していない。診断の注釈要求は維持する。ガイド修正後の新しい初見試行は未実施で、改善効果は未測定。
