# 非同期の結果をstateへ戻すresource channel

`resource`は、trusted adapterからコンポーネントへ結果を戻す型付きの入口。key、taskの世代、publishの順序、ownerの寿命をランタイムが照合する。検索結果を`For`で描画する[地図サンプル](../examples/async-map/)で利用している。

```isle
schema Place { id:string; name:string; }
client component Search() {
  state query = "";
  state rows: Place[] = [];
  state phase = "idle";
  resource results(query) {
    receive(places: Place[], status: string) {
      rows = places;
      phase = status;
    }
  }
  event search(e: EventSnapshot<InputEvent>) { query = e.value; }
  <main>
    <input aria-label="Search places" value={query} on:input={search}/>
    <p role="status">{phase}</p>
    <For each={rows}>{(place) => <p key={place.id}>{place.name}</p>}</For>
  </main>
}
```

`resource results(query)`はqueryの変更を購読する。`receive`の引数はread-onlyで、bodyは同期のstate代入だけを書く。通常の型検査で`Place[]`から`rows`への代入を検査し、生成した受信handlerを遅延チャンクにする。DOMの`on:resource`イベントは生成しない。

## Adapterの接続

Vite pluginの`resources: {Search: './setup.ts'}`でsetupを登録する。setupは最初のresumeまで実行しない。通常のresource owner APIに加え、宣言したchannelを取得できる。

```ts
import type {ClientChannelContext, ResourceChannel} from '@isle/prototype/resources';

type Place = {id:string;name:string};
type Result = {places:Place[];status:string};
export function setup({channel}: ClientChannelContext) {
  const results: ResourceChannel<{query:string}, Result> = channel('results');
  results.subscribe(task => {
    task.owner.acquire(async signal => {
      const response = await fetch('/places?q=' + encodeURIComponent(task.key.query), {signal});
      if (!response.ok) throw new Error('Search failed');
      const places: Place[] = await response.json();
      await task.publish({places, status:'ready'});
    }, () => {});
  });
}
```

現時点ではadapter側のTypeScript型は手で付ける。DSLから`.d.ts`を自動生成して一致を証明する仕組みはまだない。`response.json()`の値は`publish`でコンパイル済みの閉じたschemaに照らして検査され、切り離したcopyを受信handlerへ渡す。型の違う値、余計なfield、列挙されるgetter、疎な配列を受け付けない。業務上の制約や件数上限はadapterでも検査する。

`subscribe`は1 owner・1 channelにつき1つ。登録は同期で行い、最初のcallbackはmicrotaskで現在のkeyを受け取る。非同期の取得・cleanupには`task.owner.acquire`を使う。上の簡略例の取得失敗はhandleのfailed状態になる。実アプリでは検索失敗を捕捉してerror用の結果をpublishする。地図では前の結果を維持し、再試行も提供する。

通常の`ClientResourceContext`ではchannel能力はoptional。`resource`を宣言したコンポーネントのsetupには`ClientChannelContext`を使う。JSのsetupからも同じAPIを使える。

## 採用条件と破棄

1. keyの変更がcommitされたら、旧taskの能力を無効化し、旧task ownerをdisposeしてabortを通知する。その後、新しいkeyでcallbackを呼ぶ。
2. `refresh()`はkeyが同じでも新しいtaskを作る。viewport変更や再試行から利用できる。
3. `publish`は入力を検査・copyしてから受信コードを解決する。コード取得中はownerのイベントqueueを占有しない。
4. コード到着後に生存・task世代・publication順を再検査し、同期のstate/DOM更新だけをownerのqueueへ入れる。commit直前にも検査する。
5. supersede・unmount・unsubscribe後のpublishは`false`で完了する。不正な入力やコード取得・更新の失敗はrejectする。

```text
commit = owner alive ∧ current task epoch ∧ latest accepted publication
```

同じkeyがA→B→Aと戻ってもepochは戻らない。同じtaskから複数publishした場合、コード取得中に追い越された古いpublicationは反映しない。不正な入力や失効済みtaskのpublishが、最新の正常なpublicationを取り消すこともない。

`AbortSignal`だけに頼らず、abortを無視する取得や止められないdynamic importにもこの条件を適用する。ただしadapterが複数の独立した要求を同じtaskへ混ぜれば、業務上の応答順までは推定できない。要求を更新するときに新しいkeyまたは`refresh`でtaskを分ける。

## 静的な制約

- 明示的なclient componentと、nativeの非voidコンテナrootを要求する。
- keyはprimitiveなowner props/stateの名前。derive・record・配列・任意の式は未対応。空のkeyリストは使える。
- 引数は閉じたserializable型。ownerのprops/state/deriveと同名の引数、引数への代入、非同期body、remote callを拒否する。
- 受信結果が自身のkeyを変更する循環と、複数resourceを経由する循環を拒否する。adapter内部の命令的な`refresh()`ループは解析対象外。
- resume buildではsetup providerが必要。SSR-onlyはproviderを読み込まず、JS・snapshot・JSONデータの取得を展開しない。
- ブラウザcompilerも構文・型を検査する。sandbox playgroundのresume previewはproviderを持たないため`E_PREVIEW_RESOURCE`を返す。SSR previewは利用できる。

## チャンクとサイズ

manifestの`Component.channelName`が受信入口で、event metadataは`resource`。source位置とwrite先を記録するため`just chunks`などから追跡できる。通常のhandlerと同じViteチャンク予算を使い、別々に調べたい地図では`handlerChunkBytes: 0`を指定する。コードの解決とdataの取得は並行できる。

registryの位置7にschema ID→channel planを追加した。snapshotはv2、CodeRefは従来の3要素tuple。共有widget engineは`isle/client/8`へ更新し、旧engineとの共用を拒否する。channelを使わない通常のproduction buildからはchannel管理を除去する。共有widget engineは後から来るアプリにも対応するため機能一式を持つ。

[検査](../tests/resource-channels.test.mjs)には、応答・コードの逆転、ABA、入力copy、失効後のpublish、複数owner、cleanup、3結果の完了順6通り×破棄位置4通りの有限検査がある。[ブラウザ検査](../e2e/async-map.spec.mjs)では受信コードを止めたまま入力を変更し、unmount後にもコードを到着させる。これは有限の回帰検査であり、時相論理による完全な証明ではない。

残る課題はadapter型の生成、ownerをまたぐread-only live入力、opaque DOM所有契約、field単位の差分publish。地図のCanvas・詳細DOM・SDKモデル内のcacheと要求世代はadapter側に残っている。
