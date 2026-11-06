# Prototype v0 の検証記録

2026-11-02。`just ci` を実行し、警告なし MoonBit check、27 MoonBit tests、11 Node tests、production build、6 Playwright tests が成功した。server tests は実際に frontend が出力した action IR に対して直接 request を送る。

## 動作

- dev と production の別 browser context で SSR 値37から38へ進み、既存 DOM node identity を保持する。
- 二 instance は別の保存値を持ち、一つの handler module を共有しても値が混ざらない。
- JavaScript 無効でも SSR 内容が見える。
- 明示 remote は server adapter を通り、直接 request の resource 認可と input / output schema を検査する。
- import 待ちで dispose すると古い event を適用しない。
- handler の失敗や await 中の dispose は、途中 state だけが残る client commit を防ぐ。
- principal の wire 偽造、別 resource、async prepare 中の失効、response の余分な field を拒否する。認証・保存 adapter の一般的な安全性の証明ではない。

## 形式検証

[formal.json](../results/formal.json) は13ケースの結果と witness。owner strict は33状態、security strict は69状態の到達閉包を完全探索した。4故障版の反例を実 step で再生し、正常処理への到達性も確認した。`moon prove models/permit` は純粋な2record store の1 goal成功。型検査が通る偽 postcondition は proof report 上で拒否された。

## 記述・読解

[v1](v1.md) と [v2](v2.md) に fresh author / reader の記録を残した。著者2名はそれぞれ Counter 5/5、action 6/6 を初回で通過。読者2名はそれぞれ10/10。guide / brief / 読解対象の source / 自作ファイルに閲覧範囲を制限し、grader の source・期待値・実装・過去試行の閲覧を禁止する指示を与えた。参加者の記録ではこの制約を守っているが、OS の sandbox で強制したものではない。小さい課題と同系列モデルの4参加者による初期評価であり、人間一般の利用しやすさとは区別する。

## UI の確認

vlmkit **0.24.0** の固定 gate 集合を実行した。

| gate | 結果 |
| --- | --- |
| check integrity | clean、3 viewport、suspect / warn 0 |
| check copy | missing / placeholder 0 |
| scan scroll | horizontal overflow 0 |
| scan handlers | suspect 0、native button 3個 |
| check interactions | suspect 0、warn 2 |

interactions の warn は数値 text だけが変わり ARIA / layout が変わらない Counter の Enter 操作。抑制せず記録した。同じ native button の Enter で38/76になることを専用の Playwright test で確認した。

desktop 1280px と mobile 390px のクリック前後を撮影・目視した。3枚の card、各 heading、button、footer が読め、横方向の切れや重なりはない。クリック後は最初の Counter だけ38/76へ変わる。画像は [screenshots](../results/screenshots/) に保存した。

## 生成物と制限

[build.json](../results/build.json) に同じローカル production demo の raw / gzip bytes、二つの dynamic entry、snapshot の slot を記録した。不要な unused state は snapshot に含まれず、client JS に例の server policy / operation 名は現れない。文字列不在の検査だけで情報非干渉性を証明したとは扱わない。転送条件・実機・比較対象を揃えた性能 benchmark は未実施。

未対応: 任意 TypeScript、Content Mapper、imports、component nesting、branch / list、一般の server async render、完全な情報ラベル・外部 DB transaction・実ログイン。実装済みの v0 と最終設計の提案を [prototype-guide](../../docs/prototype-guide.md) で区別する。
