# コンポーネント lint の評価(崩れの発見と修正ループ)

崩れを仕込んだコンポーネント(Svelte、Vue、Linaria、StyleX)を、作者と同じ手順で lint にかけます(`css-lint --font Roboto=…` と同じ設定)。

検出の正解は Chromium が決めます。評価器は adapter が展開した各状態を、幅 320/375/768/1280 と lint の反例に出てくる幅で、既定のフォントサイズ 16px と 32px(200%)の両方で描画し、次の崩れを実測します。

- ページの横スクロール
- テキストのはみ出し(Range の行ボックスと内容の箱を比べ、端数の px も見る)
- テキストの先頭が別の箱に覆われていること(スクロールの先頭と末尾で確かめる)
- placeholder の切れ

```bash
just component-lint-eval
```

```bash
node tools/eval-component-lint.mjs --attempt run-1
```

- `cases/<id>/before.*`: 崩れを仕込んだコンポーネント。`case.json` には、作者の意図、仕込んだ崩れ、期待するコードを書きます。
- `attempts/<run>/<id>.*`: lint の警告と `fix:` に従って直した版。新しく試すときは、新しい run として残します(前の run は書き換えません)。
- `evals/results/component-lint/<run>.json`: 集計です。
  - `caught`: Chromium で崩れ、lint もその箱(またはページ)を報告したもの。
  - `missed`: Chromium で崩れたのに、lint が報告しなかったもの。そのうち `silentMissed` は、その例の lint の結果が Unknown(検査できなかったものを info で示す)でもなかったもので、これが黙って通った見逃しです。
  - `unconfirmed`: lint の error のうち、その箱でも反例の幅でも、Chromium で崩れが見えないもの。
  - `backlog`: 検査できなかった理由(Unknown と仮定)の件数。

評価で見るのは次の三つです。

1. 崩れを見つけられるか(missed が 0 か)。
2. 誤報がないか(unconfirmed が 0 か)。
3. 表現できないパターンで止まらないか。Unknown のメッセージに、検査できる形への書き換え方が出ているかを見ます。

コントラストのように、Chromium の実測では判定しない検査もあります。それらの lint の error は `unconfirmed` に入れず、レポートで別に扱います。
