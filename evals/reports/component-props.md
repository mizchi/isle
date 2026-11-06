# 共通 component と props の直接宣言

2026-11-04。`component` を server/client 共通の純粋なサブセットとして追加し、props を名前と型で直接宣言できるようにした。

```text
export component Label(title: string) {
  derive text = title + "!";
  <p>{text}</p>
}

export client component Counter(initial: number) {
  state count = initial;
  <button>on click increment { count += 1; }{count}</button>
}
```

## 実行側の契約

`component` の IR side は `universal`。props・純粋な derive・HTML を持ち、state とイベントは frontend と JS backend の両方で拒否する。schema Form の lowering が暗黙に client の振る舞いを追加することも拒否する。

通常の mount では HTML のみとなり、snapshot・handler・UI engine を必要としない。既存の server/client の意味を維持し、state / on の追加時は明示的な client 指定を求める。component の入れ子は今回の実装範囲に含めず、配置は mounts で行う。

## Props 表記を選んだ理由

TS は object の分割代入内に型注釈を置けない。`({ initial: number })` は initial を number へ改名する意味なので、この形を省略した型宣言として解釈しない。[TypeScript Object Types](https://www.typescriptlang.org/docs/handbook/2/objects.html)

MoonBit の labelled arguments は、宣言に書いた名前を内部の変数名と呼び出し側の label に使う。[MoonBit Fundamentals](https://docs.moonbitlang.com/en/latest/language/fundamentals.html#labelled-arguments)

この名前を一度だけ宣言する考え方を参考に、component DSL に `Counter(initial: number)` を採用した。MoonBit の構文をそのまま取り込む指定ではなく、本文の primitive 型名と式は従来どおり TS を基にする。通常の TS 関数を位置引数から名前付き呼び出しへ変えるものでもない。

渡す値は引き続き `props: { initial: 5 }`。順番に依存せず、余分な field・欠落・型不一致は拒否する。既存の `Counter({ initial }: { initial: number })` と同じ props IR に正規化し、snapshot schema と生成 handler が一致することを検証した。required primitive の制約を維持し、optional/default/rest や型 alias は追加していない。

## TDD と評価

MoonBit の宣言・拒否テスト、Node の正規化・描画・不正 IR・build のテストを先に失敗させてから実装した。props の field 読み取りは schema と共通化し、型・optional・制約の検査を重複させない。

`just ci` 成功。MoonBit 32件、Node 161件、型検査、既存の形式モデル27ケース・10故障版と permit proof、Playwright 56件、Form の16 gate が通った。新しいブラウザーテストでは、universal が静的なまま残り、直接 props を宣言した二つの client instance だけが別々に再開する。

widget の追加検査も unit 28件・E2E 24件が成功。static widget の例を universal component に変更し、shared / standalone の SSR 専用出力に UI engine・snapshot・handler が出ないことを維持した。

更新したユーザーガイドの6例を構文検査・SSR し、最初の Counter を production build して更新・reset をブラウザーで確認した。[検証集計](../results/component-props/validation.json)を保存した。

[読解・記述課題](../scenarios/component-intent/brief.md)と `component-intent` grader を追加した。暗黙の client 推論、位置引数、TS の分割代入を型注釈とする誤読を拒否し、fixture の実行結果と期待値を照合する。参加者評価は未実施で、書きやすさが改善したという実測には扱わない。

使い方は[構文リファレンス](../../docs/prototype-guide.md)、[アプリのガイド](../../docs/application-guide.md)を参照。
