# Isleの目的と設計原則

更新日: 2026-11-13。現在の目的と開発の判断基準を記録する。

**Isleは、Qwik型の事前コンパイルとresumeを基盤とするUIライブラリであり、
CSSのレイアウト契約をcomponentの型システムへ組み込むことを目的とする。**

## 事前コンパイルするUI

状態、純粋な導出、event、server/client境界、所有と寿命を、静的解析できる専用文法で記述する。
コンパイラがSSR HTML、保存状態、更新先、capture、CodeRef、CSS依存を求め、
Vite/Rolldownが物理chunkとmanifestを生成する。
初期表示はSSR HTMLを使い、操作時に必要な部分をresumeする。

Qwikのresumabilityとoptimizerを参照し、分割境界を文法と解析結果で説明できることを重視する。
アプリの処理本体はTS前提とし、現在はTypeScript風の閉じた式・statementを受理する。
`event`と`on:click`等を使い、`inline(ts)`は要求しない。
任意のTypeScriptとContent Mapperの統合は未実装。

「コンパイル時に決まる」の対象は、依存候補、更新計画、所有規則、capture、解決時期の制約である。
ユーザー入力、listの個数と順序、非同期処理の完了順、実際の通信時間は実行時の入力として扱う。
未使用の値・コードを除去し、必要な動的部分だけへ更新コードを生成する。

## CSSをcomponentの型へ組み込む

値の型と同様に、componentが親へ要求する割当領域と、内部の配置が満たす保証を契約にする。
親から子への割当、子が占有する領域、media/container条件、動的状態の候補を照合する。
CSSの実装は実装から独立した契約を満たす必要があり、契約だけを書いてCSSを正しいと仮定しない。

例えば40px以上の子4個を横に配置する親は、gapとpaddingが0なら160px以上を割り当てる必要がある。
gapが8pxなら3個分を加えて184px以上になる。実際のCSSの寸法と、子のrequiresを別々に検査する。
レスポンシブな分岐も、宣言した入力領域の全域で成立することを目指す。

現在は`layout SafeGrid`、`layout PositionedGrid`、親子の割当照合、有限状態の`@noshift`等を実装している。
CSSの全プロパティを一般のTS型として表現できる段階ではなく、閉じたprofileの意味論をZ3で検査する。
sourceの型・文法検査は`compile`/`check`、CSSへの適合検査は`layout`、Vite build gate、playground Workerが担当する。

検証コアは一般ライブラリの`packages/css-verifier/`へ分離する。入力はCSS、box tree、環境、契約であり、
Isleはtemplate・状態・key・sourceをそれらへ変換する利用者の一つとする。

## Layout Instabilityの静的検証へ進む

自前の記号的レイアウトエンジンに、観測の意味論と描画され得る状態遷移を接続する。
最初はshiftゼロ、その後に具体的なshift score、時間付きCLS上限を検討する。
対象となる全入力と遷移がモデルに含まれることを条件とし、ブラウザーとの対応範囲を明示する。

現行`@noshift`は、選んだ要素の存在・位置・寸法を有限候補間で比較する契約である。
textのfragment、任意のfont、paint、frame順序、CLS全体の保証はまだない。
この境界と段階実装は[ADR-0001](adr/0001-static-layout-instability-verification.md)に記録する。

## 開発で優先すること

1. **小さい配信runtime**: 検査IR、Z3、プロファイル・説明情報はbuild/debug成果物へ置く。
2. **説明可能な静的検査**: 成功の範囲と仮定、違反の反例、Unknownの原因を保存する。
3. **ブラウザーを必要としない受理判定**: browser実測は静的モデルの誤りを探す補助evalとして使う。
4. **ポータブルな出力**: ES2023と標準DOM/ESM/fetchを使い、通常ページ、Workers連携、Web Componentsへ接続する。
5. **厳密な境界**: server capability、client state、resource、CSSの前提と実装を区別する。
6. **使いやすさの評価**: examplesとevalsで、書きやすさ・読解・反例の理解・性能を継続的に確認する。

未対応機能、入力の不足、被覆の不足、上限超過、solver timeoutを`verified`にしない。
trustedな内容寸法等の前提と、静的に導出・検査した事実を区別する。
有限モデルやbrowserの差分テストを、compiler全体の意味保存の証明とは説明しない。

## 読む順序

- 開発の再開: [別環境への引き継ぎ](handoff.md)
- 次の実装: [ADRと実装計画](adr/README.md)
- 現行のCSS保証: [静的UI検証](static-ui-verification.md)、[レイアウト契約](layout-contract-language.md)、[noshift](layout-transitions.md)
- resumeの実装と不足: [resume意味論](resume-semantics.md)
- アプリの記述: [ユーザーガイド](README.md)、[構文リファレンス](prototype-guide.md)

過去の[設計ドラフト](design.md)には構文の比較案や未採用の案も残る。
現在の目的は本書、動く構文はユーザーガイド、個別の後続計画はADRを正本とする。
