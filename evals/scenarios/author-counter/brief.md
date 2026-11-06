# Counter を書く

`docs/prototype-guide.md` とこの課題だけを読み、候補を自分の attempts directory の `counter.isle` に書いてください。compiler、runtime、tests、evals/solutions、evals/expect、他の attempts、reports は読まないでください。

Counter という client component を作ります。number の prop `initial` を受け、state `count` を initial から初期化し、純粋な `remaining` を `100 - count` にします。一つの button の表示は `count / remaining`。click ごとに count を3増やします。SSR props `{initial:37}` から始め、最初の click 後は40と60が表示されること。initial が変わっても計算が成立するようにしてください。

予算は check / grader の呼出し3回。各回の結果、変更理由、何を手掛かりにしたかを `log.md` に記録します。成功したら停止します。構文の迷いを隠さず具体的な箇所を引用してください。

```sh
node tools/isle.mjs check <candidate.isle>
node tools/eval.mjs author-counter <candidate.isle>
```
