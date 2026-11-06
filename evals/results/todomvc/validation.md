# TodoMVC validation

2026-11-06。追加した TodoMVC を Isle / Qwik 1.20.3 / Qwik 2.0.0-rc.4 / Preact 11.1.1 の4実装で検証した。

- 共通 Playwright flow：各実装で1280px・375pxを通過。追加・trim・空入力無視・完了・key の DOM 同一性・フィルター中の完了切替・編集の Enter/blur/Escape・空編集削除・個別削除・全件切替・完了済み削除・hash と保存データの再読み込み復元を確認。
- JavaScript 無効の空リスト：4実装とも見出しと入力を SSR し、main/footer を隠す。
- Isle の追加検査：初回 runtime の取得を150ms遅らせた連続キー入力、HTML文字列のテキスト表示、不正な localStorage の無視を確認。
- 型付き JSON：構文不正・不正な field 型・余分な field を拒否し、transaction の state を変更しない。
- Node 回帰326件・MoonBit 53件・型検査を通過。従来の region E2E 4件、パッケージ利用者の検査2件も通過。
- TodoMVC の vlmkit 0.24.0：integrity / copy / scroll / handlers / interactions / responsive / contrast / focus の8項目を通過。responsive は375〜1440pxの24ケース。PCとphoneのリスト・完了行・編集中を画像でも確認。
- サイト追加後：85 HTML、内部参照1601件で参照切れ0、Pages subpath の E2E 22件を通過。サイトの vlmkit 27項目も通過。

サイズは [raw/gzip/Brotli と個別ファイル](../../../benchmarks/results/todomvc/latest.json)、[比較表と条件](../../../benchmarks/results/todomvc/latest.md)に記録した。全 JS gzip は Isle 8663 B、Qwik stable 24503 B、Qwik 2 RC 42757 B、Preact 6917 B。初期外部 JS は Isle 1439 B。全実装が同じ CSS・HTML shell・保存/hash/focus の host module を使い、描画・状態変更は各フレームワークで行う。

`just todomvc-size` / `just todomvc-quality` / `just site-check` / `just site-quality` で再実行する。公式 TodoMVC 配布物のサイズではなく、このリポジトリで同じ機能を実装した比較である。Qwik stable の Vite 7 / Rollup と他実装の Vite 8 / Rolldown の違いを含む。
