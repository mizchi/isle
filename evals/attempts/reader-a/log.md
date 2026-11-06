# 読解記録

回答は `docs/prototype-guide.md`、`evals/scenarios/intent/brief.md`、`evals/scenarios/intent/fixture.isle` だけを読んで確定した。compiler/runtime/tests/期待値/他の試行は読んでいない。explain は実行していない。

## 回答の根拠

| 回答 | 短い引用と判断 |
| --- | --- |
| serverComponents = Heading | fixture: `export server component Heading`。実行側と名前が直接書かれている。 |
| clientComponents = Counter | fixture: `export client component Counter`。実行側と名前が直接書かれている。 |
| rpcActions = renameDocument | fixture: `export server action renameDocument(input: RenameInput): DocumentView`。guide: `公開 action`、`次の明示 RPC`。公開と RPC の対応はガイドによる。 |
| policy = policy.documentEditor | fixture: `authorize grant = policy.documentEditor(request, input.id)`。名前をそのまま読んだ。 |
| authorizationTarget = input.id | fixture: `policy.documentEditor(request, input.id)`。認可対象は第二引数の id と読める。guide: `authorize grant` は `対象 resource の許可`。 |
| requestFromClient = false | fixture: `using request: RequestContext`。guide: `using request` は `server が注入する context`。client が送らないという結論はこの説明に依存する。 |
| responseFields = id, title | fixture: `view DocumentView { id: string; title: string; }`。guide: `view` は `出力 field の契約`。 |
| clientSetupReruns = false | fixture: `state count = initial;`。guide: `初期化は SSR で行い、resume 時は再実行しません`。ソース単体では再実行の有無は確定できない。 |
| firstClick = [38, 76] | fixture: `state count = initial;`、`derive doubled = count * 2;`、`on click { count += 1; }`。37 に 1 を加えて 38、その二倍は 76。guide: `state 更新が終わったら、影響する binding を生成済みコードで更新します`。 |
| browserCanChoosePrincipal = false | fixture の入力は `schema RenameInput { id: string; title: string; }` だけで、request は `using request: RequestContext`。guide: `server が注入する context`、`server runtime は直接 request に対しても入力、request principal、resource policy、出力を検査します`。browser payload による principal 指定を受け入れないという読みはガイドへの信頼を含む。 |

## ソースだけでは分からず、ガイドを信頼した事実

- `state` が初期 HTML の SSR 時に初期化され、resume 時に再初期化されないこと。`state count = initial;` だけなら mount 時に再実行する言語とも読める。
- `using request` の提供主体が server であり、client の送信値で置換できないこと。fixture は注入元と wire の形を定義していない。
- 公開 action が RPC になること、`view` が出力検査の契約であること。fixture には client の呼び出し例も transport の記述もない。
- principal や policy を runtime が検査すること。構文は検査意図を表すが、実施の証拠にはならない。
- handler 後に derive と DOM binding が更新されること。依存式は読めても更新スケジュールはガイドが必要だった。

## 過大な権威や段階を連想させる記号

- `authorize grant` は許可が成立済みで、grant が偽造できない能力である印象を与える。しかし fixture からは grant の検証方法、寿命、resource との結び付けは分からない。
- `effects { db.write }` は書き込み権限の強制や副作用の完全な追跡を連想させる。guide は `宣言する能力` と呼ぶが、どこまで host adapter の実装を制限できるかはこのソースでは読めない。
- `server` は信頼境界を明示する一方、ログインや principal の正当性まで実装済みと思いやすい。guide は `実ログイン` が未実装と明記する。
- `return await documents.rename(...)` は一般的な非同期処理の段階を想像させるが、guide の body はこの形に限定され、`commit は同期の in-memory mutation` という別の実行モデルがある。await の表記だけでは prepare/commit の段階や原子性は読み取れない。
- `export` は名前の公開だけにも読める。server action の外部公開と認可境界まで意味することはガイドに依存する。

## 推論できなかったこと

- documentEditor が何をもって編集可能と判断するか。所有者、role、共有設定などの条件は不明。
- principal の生成方法、認証方法、なりすましを防ぐ具体的な仕組み。回答の false は契約上の意図の理解であり、実装検証ではない。
- documents.rename の実装、保存先、競合時の挙動、失敗時の rollback、DB transaction。guide は `実 DB transaction` を未実装としている。
- action の URL、HTTP method、実際の payload とエラー形式、schema/view の余分な field の扱い。
- resume の復元形式と、state/props のうち browser に渡す値の具体的な選別方法。

以上を踏まえて answers.json を確定した。採点後は回答を変更しない。
