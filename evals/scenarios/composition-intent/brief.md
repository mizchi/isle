# 入れ子の props、children、resume を読む

docs/composition.md と fixture.isle を読んでください。実装、expect、過去の attempts は読まないでください。Page は seed=5 で描画します。

`evals/attempts/<run>/composition-answers.json` に次のキーで回答します。

- `counterInitialValues`: 二つの Counter の初期値。表示順の number 配列。
- `propsArePositional`: 呼び出し側の属性の順番が props の対応を決めるか。boolean。
- `componentCallable`: ソースで Counter を普通の関数として呼べるか。boolean。
- `pureCardsCreateOwners`: Card ごとに runtime owner / snapshot が追加されるか。boolean。
- `childrenInSnapshot`: children の DOM や renderer を snapshot に保存するか。boolean。
- `firstChildResumesParent`: 最初の Counter の操作で Parent の状態も復元するか。boolean。
- `parentDisposeIncludesChildren`: Parent を dispose した後、未再開の Counter も停止するか。boolean。
- `countersShareState`: 二つの Counter は同じ count を共有するか。boolean。
- `clientMayInstantiateServer`: client component から server component を直接タグで呼べるか。boolean。
- `reactiveClientPropsSupported`: Counter の initial を Parent の mutable な count に変更して、その値を自動追従させられるか。boolean。
- `componentRecursionAllowed`: 直接・間接に再帰する component の合成を許すか。boolean。

`node tools/eval.mjs composition-intent <answers.json>` で採点できます。静的な展開と独立した再開境界、Flow 風の名前付き引数と位置引数、children の所有権で迷った箇所を log.md に残してください。

記述課題は、Summary をもう一つ追加して親の値の2倍を表示することです。Counter の初期値は変更せず、親を増やしても子の状態が変わらないことを確認してください。参加者評価は未実施です。
