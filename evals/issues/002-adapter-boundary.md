# 検査できることと host の仮定が曖昧

writer-a: 「未登録の policy.notePublisher や notes.publish が静的検査で許可されるかの説明がない。」

reader-a: 「`authorize grant` と `effects { db.write }` は強制力を連想させますが、認可条件・grant の検証・host の制限は推論できません。」

変更: ガイドの意味規則表と check/登録の区別を追加。explain は authorizationRequired と trusted host adapter を表示し、compiler が業務 policy を証明したとは出さない。reader-b と writer-b で再評価する。host の認証実装や任意副作用の形式保証は後続課題。
