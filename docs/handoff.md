# 別環境への引き継ぎ

更新日: 2026-11-13。対象リポジトリは`https://github.com/mizchi/isle`、branchは`main`。
作業を再開する際は、最初に[目的と設計原則](project-purpose.md)と[root AGENTS.md](../AGENTS.md)を読む。

## 環境を用意する

| ツール | 条件 | この環境で使用したversion |
| --- | --- | --- |
| Node.js | 24+ | v24.22.2 |
| pnpm | `package.json`の`packageManager`に従う | 12.18.0 |
| MoonBit | compilerと開発用モデルのbuildに必要 | moon 0.1.20261104、commit 940aa18 |
| just | `justfile`のタスク実行 | 1.50.0 |
| Chromium | PlaywrightのE2E用 | lockfile指定のPlaywrightでinstall |

MoonBitのpackage定義は`moon.mod`と`moon.pkg`形式。古いtoolchainでは解釈できない場合がある。
有限モデルの依存は`mizchi/veri@0.2.1`。生成済みcompilerや`.mooncakes/`はGitに含めず再生成する。
MoonBit導入とLinuxでのbrowser依存の準備は、[Pages workflow](../.github/workflows/pages.yml)にも記録されている。
npmアーカイブを使うアプリ利用者にはMoonBitは不要だが、このリポジトリを開発する環境には必要である。

ツールを準備した後、任意の作業ディレクトリで次を実行する。

```sh
git clone https://github.com/mizchi/isle.git
cd isle
pnpm install --frozen-lockfile
moon update
pnpm exec playwright install chromium
just build-compiler
```

LinuxのCIでOS依存も必要なら、browser installを`pnpm exec playwright install --with-deps chromium`にする。
環境情報と`git rev-parse HEAD`を新しい検証結果へ記録する。
`_build/`、`.mooncakes/`、`node_modules/`、`dist/`、`test-results/`は復元に必要な共有ファイルではない。

## 最初の検証

```sh
just check
just check-types
just test
pnpm --filter @mizchi/css-verifier test
```

`just test`はcompilerを生成してMoonBitとrootのNodeテストを実行する。
`pnpm test`単独にはcompilerの生成が含まれない。
CSSコア単独のテストはworkspace package内にあり、rootのテストに加えて実行する。

変更範囲に応じて次のタスクを使う。すべてを毎回重複実行する必要はない。

| 対象 | コマンド |
| --- | --- |
| 独立CSS package、npm consumer、Z3、反例の出典 | `just css-verifier-check` |
| mizchi/cssとのcascade差分(MoonBit必要) | `just css-oracle-check` |
| フォントから導出するテキスト寸法(MoonBit必要) | `just css-text-check`。折り返し(行分割 profile、括弧・約物・小書き仮名・`ー` を含む)はコア3件・計測5件・CLI 1件・Vite 1件、Chromium で11構成+ランダム140文字列×2言語の行数、全クラス対+3000文字列の分割可能位置、例の高さを照合。Vite の `layout.fonts` は `tests/layout-build.test.mjs` の3件(証明書へのフォント記録、狭い viewport での失敗、設定エラー) |
| integrity 規則(`packages/css-verifier/test/integrity.test.mjs`、`e2e/layout-integrity.spec.mjs`) | コア9件(塗りのある親、Z3 の確認を含む)、Vite の build 2件、playground 1件。vlmkit 0.24.0 と8構成×3幅で規則ごとに一致(フォント契約のあるテキストは text-collision も一致、契約のない text は vlmkit ⇒ 静的のみ) |
| flex/contents サブセット(`packages/css-verifier/test/flex-contents.test.mjs`、`e2e/layout-flex.spec.mjs`) | コア24件、Chromium 25ケースで矩形が1/64 px以内で一致。flexの比較はmizchi/css 0.8.2で既定に含める |
| noshift、DOM注釈、key、CLI/Vite、有限case eval | `just noshift-check` |
| 宣言した親子のlayout契約 | `just layout-contract-check` |
| browser compilerとplayground | `just playground-check` |
| 参照モデルとruntimeの寿命 | `just test-models`、`just resource-disposal-check` |
| resumeのphaseと既存の不足 | `just resume-phases-check`、`just resume-semantics-audit` |
| 取得とCSS-ready | `just loading-check`、`just style-check` |
| Pagesのbuildと内部リンク | `just site-build`、`node tools/check-site.mjs` |

playgroundだけのE2Eは`pnpm exec playwright test --config playwright.playground.config.mjs`。
compiler/JSのbuildと編集を終えてから実行し、実行中は再buildしない。
同じportで既存serverが動いているときは、そのserverの用途を確認する。

## ローカルで確認する

```sh
just playground
```

`http://localhost:4334`を開き、**Noshift · keyed rows**を選ぶ。
Reorder rowsでDOM順を変えても同じkeyの行の位置が変わらず、Z3の検査が成功する例になっている。
`grid-column`/`grid-row`の明示配置を外すと、既存行の40px移動を検出する。
browser Z3のためにcross-origin isolationが必要で、Vite設定とplaygroundのService Workerが担当する。

browserを使わずに例を調べる場合:

```sh
node tools/isle.mjs layout examples/layout-contracts/noshift-keys.isle --summary
```

## 現在の実装

- CSS解析・box model・契約・Z3は独立した`packages/css-verifier/`へ分離済み。
- SafeGrid、PositionedGrid、親子の公開root/private座標系を検査する。
- DOM側の`@noshift`とselector指定を、CLI・Vite・playgroundへ接続済み。
- 有限な配列の順序とrecordの相関を保持し、Forのsiteとtyped key列で行を追跡する。
- 行の追加・削除は寿命の開始・終了とし、生存する行の移動と行内対象の消失を検出する。
- universal子componentとFragmentのkeyに対応。For内client islandは現行region backendが拒否する。
- 検査用の対応情報と注釈を配信HTML/JS/CSSへ追加しない。対象evalの増分は0 byte。

コードの入口:

| 責務 | 場所 |
| --- | --- |
| sourceとProgramIRの契約 | `lib/contracts.d.ts`、`compiler/` |
| DOM注釈と最適化後の要求保持 | `lib/layout-annotations.mjs`、`lib/compiler-core.mjs` |
| 状態候補とkey同一性 | `lib/layout/bounds.mjs`、`structure.mjs`、`identities.mjs` |
| sourceのnoshiftと汎用遷移の接続 | `lib/layout-noshift.mjs` |
| 汎用の解析・証明 | `packages/css-verifier/src/` |
| 配布物の検査 | `lib/layout-build.mjs`、`lib/vite.mjs` |
| browser Z3 | `playground/layout.worker.mjs` |

旧importの`lib/layout*.mjs`等には互換入口がある。
一般CSSの変更は独立packageへ置き、Isleの状態や構文を同packageへ逆流させない。

## 保証の境界と次の作業

現在のnoshiftは有限な候補の比較で、event graphやframe順序を復元する検査ではない。
削除後に同じkeyを再挿入した別の寿命を保守的にまとめる場合がある。
内容寸法とfontのboundはtrustedな前提になり得る。
CLS、任意のtext/paint、未対応のscroll/transform等を保証したとは扱わない。
根拠不足や探索上限はUnknownとする。

[ADR一覧](adr/README.md)のうち0002はコアとCLIまで実装中、他の8件はProposed。GitHub Issueは未作成。
0002の残りはplaygroundの模式図と、noshift反例(同じkeyの40px移動)への原因trackの接続。
最初の候補は0002の反例説明、0003の動的寸法、0005の世代/同期遷移。
続いて0004の予約領域と0001の観測モデルへ進む。
0008のlive propsと0009のfactory分割は、resume側の別の実装軸として記録している。
次の環境ではユーザーが指定した範囲のADRから、Redのfixtureを先に作る。

`resume-semantics` auditの`--require-targets`は複数の未実装目標を含むため、通常の回帰確認と区別する。
過去の`design.md`には`inline(moonbit)`や旧`on`表記等の比較案があり、現行構文の正本にはしない。

## 検証結果を引き継ぐ

2026-11-13のpush前に、上記toolchainで次を実行した。将来の全commitの成功を意味するものではない。

| 検証 | 結果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 成功、lockfile変更なし |
| `just check`、`just check-types` | 成功 |
| `just test` | MoonBit 55件、root Node 679件成功 |
| `pnpm --filter @mizchi/css-verifier test` | 28件成功 |
| layout-transitionsのcheck/declared/dom/keys eval | 9/5/7/8シナリオ成功、key例のHTML/JS/CSS増分0 byte |
| playground E2E | 29件成功 |
| 公開サイトE2E | 29件成功 |
| `just site-build`、`node tools/check-site.mjs` | 成功、内部リンク・参照の失敗0 |
| `just package-build` | 現行compilerとCSSコアを含むプレビューアーカイブを再生成 |

新しい環境では必要なコマンドを再実行し、実行したcommit・toolchain・結果を更新する。

2026-11-13の後続作業(branch `claude/dreamy-lovelace-90v3hb`、Node v24.22.3、pnpm 12.18.0、moon 0.1.20261104)の結果:

| 検証 | 結果 |
| --- | --- |
| `just test`相当(compiler build後の`pnpm test`) | root Node 682件成功 |
| `pnpm --filter @mizchi/css-verifier test` | 33件成功 |
| `just css-oracle-check`(mizchi/css 0.8.2、flex系を含む) | 12件成功。30,000ケース全て一致、比較対象外0件(guaranteed-invalidな`var()`をunsetとして扱う変更後)、変異6種を全て検出 |
| `evals/scenarios/layout-explanations/check.mjs` | 5/5 |
| `just css-text-check` | Node 7件・コア5件・Chromium 3件成功。実測幅は全て`[advance, 上界]`、上界の余裕は2/64 px以下 |
| layout-transitionsのcheck/declared/dom/keys eval | 9/5/7/8成功、結果JSON不変、増分0 byte |
| `e2e/layout-contract.spec.mjs` | 2件成功 |
| `just check-types` | **環境要因で失敗**。`@types/node`がlockfileの直接依存になく、viteの型の`Buffer`が解決できない(40件、全て`node_modules`内)。リポジトリ側の型エラーは0件 |

`playground/tests/editor.spec.mjs` の1440pxのオーバーレイ描画テストは、このコンテナでは変更前のcommit(c01a42e)でも失敗する(画素差分。フォント等の環境要因)。

コンテナ環境でPlaywrightの指定versionとChromiumのrevisionが一致しない場合、
`PLAYWRIGHT_BROWSERS_PATH`に既存のbrowserへのsymlinkを置いた別ディレクトリを指定すると再downloadせずに実行できる。

再現可能な入力は`evals/scenarios/layout-transitions/`、結果は`evals/results/layout-transitions/`にある。
browserのscreen captureは補助資料で、`test-results/`の画像はE2Eから再生成する。
結果JSONの絶対pathや過去のportは検証時の記録であり、実行設定へ流用しない。

`main`へのpushでPages workflowが動く。別環境での確認はGitHubのChecksとPagesのdeploy結果も参照する。
