# EVAL-06: 構文ガイドに開発者用toolchainが混ざる

> 構文リファレンスには「Node 24+、pnpm、MoonBit が必要です。」が残り、npm手順と混同しやすい。

出典: author-v2 `report.md`。

状態: 修正済み。prototype-guideの実行例を `pnpm exec isle` に統一し、配布frontendの利用にはMoonBit不要と説明。compiler開発者のセットアップはcontributingへリンクした。package導入・ビルドそのものは全consumer試行でMoonBitコマンドなしで確認済み。
