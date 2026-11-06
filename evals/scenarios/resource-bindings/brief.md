# Component とリソースの寿命を読む

対象は実装済みの [app.isle](../../../e2e/fixtures/resource-bindings/app.isle)、[resources.mjs](../../../e2e/fixtures/resource-bindings/resources.mjs)、[Vite 設定](../../../e2e/fixtures/resource-bindings/vite.config.mjs)。専用 resource DSL の提案ではなく、現在動く接続 API を読む。ブラウザの受入検査は `just resource-binding-check`。この読解課題の参加者評価・自動 grader はまだない。

1. 初期表示、Counter の初回クリック、同じ Counter の再クリック、別 Counter の初回クリックで、module 評価と setup はそれぞれ何回起きるか。
2. Child だけ先にクリックしたとき、親 Counter の setup も実行されるか。後から親を dispose すると Child の取得物はどうなるか。
3. Counter 2 は取得が完了する前にクリックの結果を表示するか。unmount 後に取得が成功した場合、その結果は公開されるか。
4. modulepreload と eager は instance の初期化を開始するか。unmount 時に cleanup 用 chunk の取得は必要か。
5. 同じ root 内で同期的に DOM を移動した場合と、実際に削除した場合を区別できるか。
6. 二つの widget で scope ID が同じ場合、片方の切断はどこまで破棄するか。
7. setup の途中で失敗する場合、cleanup が失敗する場合、SSR 専用の場合を説明する。

書き手の追加課題は、resource module だけを編集して ResizeObserver を登録し、component の削除後に通知を停止すること。module トップレベルでの取得、async setup、unmount 時の import に依存する解放を避ける。判定は登録・通知・切断を実ブラウザで観測し、記述上の迷いは別に記録する。
