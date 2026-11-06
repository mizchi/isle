# 静的な負荷予測を読む

状態: 現行 v0 で実行可能。構造の検査と deterministic grader を用意した段階で、参加者評価は未実施です。

fixture.isle と docs/static-profiling.md の利用手順を読んでください。expect、solutions、実装、過去の attempts は読まないでください。

`just cost evals/scenarios/static-cost/fixture.isle` で解析結果を取得します。次に同じコマンドの末尾へ `evals/scenarios/static-cost/budgets.json` を追加し、失敗した理由を調べてください。この budget は意図的に厳しく設定されています。

次のキーで `evals/attempts/<run>/static-cost-answers.json` を保存します。

- `boardTextPatchCalls`: Board.recalculate 一回の text patch 呼び出しの上限。number。
- `boardAttributePatchCalls`: 同じ入口の attribute patch 呼び出しの上限。number。
- `childTextPatchCalls`: Child.increment 一回の text patch 呼び出しの上限。number。
- `parentResumesChild`: Board の再開だけで Child の owner も復元する必要があるか。boolean。
- `patchBoundIsChangedNodeCount`: 上記の上限は必ず変更される DOM node の数か。boolean。
- `layoutTimeKnown`: この構造の解析だけで browser の layout 時間を確定できるか。boolean。
- `productionJSOverheadBytes`: cost を有効にすることによる、diagnostics: false の production JS の増分。number。
- `codeBytesMultiplyByMountCount`: 同じ Page を二つ mount した場合、共有 module の取得 byte 数も単純に二倍になるか。boolean。
- `ssrOnlyHasDomCost`: SSR 専用にしても component HTML の DOM 規模を評価する意味があるか。boolean。

`node tools/eval.mjs static-cost-intent <answers.json>` で採点します。予測した操作回数と実時間、更新候補と実際の DOM 変更、instance の費用と共有コードを混同した箇所を log.md に残してください。

記述課題は、予算の数字を変えずに Board の更新対象を減らすことです。Row を8個残し、そのうち4個だけを scale に依存させてください。最適化後の更新候補と、静的になった表示を説明します。自動の記述 grader は未実装です。
