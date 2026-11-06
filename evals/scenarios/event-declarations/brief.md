# イベント宣言の記述・読解評価

[fixture](fixture.isle) を読み、次を説明する。

1. edit に渡る値は DOM Event か、発生時に捕捉した値か。e.value をどの時点で読むか。
2. choose の id はどの行から来るか。宣言内で item.id を直接読めるか。
3. preventDefault、コードの取得、owner の復元、selected の更新はどの順になるか。
4. For の行が入れ替わった場合に、関数や closure を行ごとに再生成する必要があるか。
5. SSR 専用で配信した場合に、イベント参照・snapshot・handler chunk が残るか。

記述課題は「選択中の行の button を disabled にする」「同じ choose を別の行にも接続する」。余計な event 宣言、暗黙の row capture、本文への DOM メソッドの追加をせずに書けるかを記録する。可変 state を引数に渡す必要があると考えた場合、本文へ移す制約が理解できるかも記録する。

受入観点は、型の異なる引数・入力イベントの誤接続・未定義の item・本文の e.preventDefault() を拒否すること、後から生成された行でも正しい id と同期キャンセルを保持すること。Node の event-declarations / event-policy-build と playground の Events / Fragments を実行検査に使う。

想定する説明は、snapshot を非同期 import 前に捕捉し、属性のキャンセルをイベント配送中に行い、コード参照と row 環境を接続して対象 owner の値を更新する、というもの。未使用宣言も検査するが配布しない。任意の TypeScript、DOM Event 全体や伝播制御をサポートしているとは説明しない。

自動検査はコンパイル・出力・ブラウザ動作の正しさを確認する。書きやすさ・意図の読み取りについての参加者評価と自動読解 grader は未実施。
