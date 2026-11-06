# template の改行・空白規則がない

writer-a: 「テンプレートの改行・字下げを表示テキストとして保持するかという説明がない。」

変更: 整形用の改行・字下げと同一行の text をガイドで区別。`{count} / {remaining}` の separator を保つ既存 compiler test と、実 browser の表示で検証する。複雑な whitespace-preserving 要素や pre の完全な仕様は後続課題。
