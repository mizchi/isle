# Isle documentation and demos

[English site](https://mizchi.github.io/isle/) · [日本語サイト](https://mizchi.github.io/isle/ja/)

## English

The landing pages are written in `app.isle`. Header, footer and content sections are server-rendered Isle components. Only the live counter resumes in the browser. Markdown guides and example source are rendered at build time; documentation pages ship no framework JavaScript.

```sh
just site-build
just site-dev
just site-check
just site-quality
```

Open <http://127.0.0.1:4330/isle/>. `SITE_BASE=/ node tools/build-site.mjs` supports a root deployment; the default is the project Pages path `/isle/`. The output is `dist/site/`.

The catalog contains 15 examples: 10 static-host live demos, a two-instance Web Components demo, a build-time CSS report, and server-required examples with source and run instructions. No RPC endpoint is simulated on Pages. The build creates a current preview npm archive for download.

The `pages.yml` workflow builds on a push to `main`, checks links and Playwright flows on the Pages subpath, uploads `dist/site/`, then deploys with the `github-pages` environment. The repository Pages publishing source is **GitHub Actions**. See the [official custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

The default runner is macOS, matching the locally verified toolchain. Manual workflow runs can select macOS or Ubuntu; this also permits retrying on another hosted pool when allocation is delayed.

## 日本語

トップページは `app.isle` で記述し、header・footer・各 section を Isle の SSR で生成する。ブラウザーで再開するのは操作可能な Counter だけ。Markdown のガイドと example のソースはビルド時に展開し、ガイドに framework JS を配信しない。

上記の `just` でビルド・配信・リンクと操作の検査・vlmkit の検査を実行する。既定の URL は <http://127.0.0.1:4330/isle/>。`SITE_BASE=/` なら root 配信にも対応する。

15例を一覧にし、10例は静的配信のまま操作できる。Web Components の複数 mount、CSS の実際の検査結果も用意する。server action や Workers が必要な例は実装と手順を示し、Pages 上に偽の RPC は置かない。

`main` への push で `.github/workflows/pages.yml` がビルド・検査・公開する。生成物は `dist/site/` に限定し、コンパイラや開発用のファイル全体を Pages へ配布しない。
