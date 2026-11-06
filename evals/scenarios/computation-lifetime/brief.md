# 不変値の別名と計算の寿命を読む

docs/runtime-size.md と、このディレクトリの fixture.isle を読んでください。実装、expect、過去の attempts は読まないでください。現在の v0 構文で実行できます。

Aliases は base=37、Frozen は initial=1、Phased は factor=3 とします。次のキーで `evals/attempts/<run>/computation-answers.json` を作ってください。

- `aliasSnapshotSlots`: Aliases の保存値として転送する props/state の名前を順番に並べた配列。
- `aliasClickValue`: Aliases を1回クリックした後の表示。number。
- `frozenSnapshotSlots`: Frozen の保存値の名前を順番に並べた配列。
- `frozenAfterTwoClicks`: Frozen を2回クリックした後の表示。number。
- `phasedSnapshotSlots`: Phased の保存値の名前を順番に並べた配列。
- `phasedAfterOneClick`: Phased を1回クリックした後の表示。number。
- `cacheCrossesWrites`: Phased の最初の代入前に計算した base を、次の代入でもそのまま使うか。boolean。
- `addsRuntimeCacheSlots`: 重複計算の除去で、新しい cache slot が snapshot に加わるか。boolean。
- `clientReinitializesState`: ブラウザーで state の初期化をやり直すか。boolean。

`node tools/eval.mjs computation-intent <answers.json>` で採点できます。初期コピーと継続的な依存関係を混同した箇所、同じ derive がいつ再計算されるか迷った箇所を log.md に残してください。

記述の追加課題は、Aliases に copied を変更する別のイベントを加えることです。copiedAgain の意味が変わるか、snapshot が何を保存する必要があるかを予測してから、explain と実行結果を確認してください。参加者評価はまだ実施していません。
