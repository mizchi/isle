# ソースから意図を読む

`docs/prototype-guide.md` と `evals/scenarios/intent/fixture.isle` だけを読んでください。compiler、runtime、tests、evals/solutions、evals/expect、他の attempts、reports を読まず、explain コマンドも使わないでください。

自分の attempts directory に answers.json を書きます。各回答の根拠となったソースの短い引用を log.md に記録してください。

JSON のキー:
- serverComponents: server component 名の配列。
- clientComponents: client component 名の配列。
- rpcActions: 公開 action 名の配列。
- policy: renameDocument の policy 名。
- authorizationTarget: client 入力から選ぶ認可対象の field（例 `input.field`）。
- requestFromClient: request context は client が送るか（boolean）。
- responseFields: DocumentView の field 名の配列。
- clientSetupReruns: resume 時に client の state 初期化を再実行するか（boolean）。
- firstClick: initial=37 の Counter の最初のclick後の `[count, doubled]`。
- browserCanChoosePrincipal: browser が payload の主体で server principal を決められるか（boolean）。

grader 呼出しは回答後1回だけです。これは理解の採点なので、期待値に合わせて回答を書き換えません。
