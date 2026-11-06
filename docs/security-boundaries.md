# server / client と非同期処理の境界

状態: 設計案と prototype v0。2026-11-02。ユーザー確定方針は、server component と client component を明示的に分け、非同期関数のセキュリティ境界を検査可能にすること。v0 は primitive schema、policy 付き action、明示 remote、直接 request の実行時検査を実装した。現在動く構文は [記述ガイド](prototype-guide.md) を参照する。以下の Result / expose / query / server async render、一般の権限型と情報フローは未実装の提案を含む。

## 1. 実行場所、公開範囲、非同期性を別に定義する

| 宣言案 | 実行と利用 | 境界の扱い |
| --- | --- | --- |
| `component` | 両側で利用できる純粋な描画 | props・純粋な derive・HTML に限定。state / on / host capability は持たない |
| `server component` | SSR request 内で評価。async 可 | server の capability を利用できる。HTML と client props は出力境界 |
| `client component` | browser の state、event、effect、resume を所有 | 初期 HTML は SSR 可。server-only capability は持ち込めない |
| `server async fn` | server 内部の非同期 helper | 宣言・export だけでは RPC として公開しない |
| `client async fn` | browser 内部の非同期 helper | DOM 等の能力を宣言。server の実装へ直接アクセスしない |
| `server query / action` | 明示的に公開した RPC entry | query は宣言した読み取り、action は宣言した変更。入力・出力・policy が必須 |
| `shared pure fn` | 両側で利用できる純粋 helper | DOM、DB、request、secret などの host capability を持たない |

`async` は中断可能性を表す。`remote` が client から server への RPC を表す。`await` や関数の export だけでネットワーク境界を生成しない。compiler は実行側・effect・公開種別を別フィールドで管理する。

無指定 component の共通サブセットは v0 に実装済みで、IR の side は `universal` とする。能力の追加によって暗黙に client / server へ切り替えることはなく、state や on を使うなら `client component` を明示する。component の合成は、純粋な展開と独立した client owner に分ける。host capability を使う server render は後続仕様である。

`client component` は CSR 専用という意味ではない。SSR backend は初期化・描画の projection を実行でき、browser backend は snapshot と生成済み処理から再開する。browser API は明示的な event / client effect 内に置き、SSR 初期化からは呼べない。`server component` は browser event / mutable client state を直接持たず、client component を描画し、許可した props を渡す。

client 側から server component の実装を import することは拒否する。v0 の `children: RenderFragment` は、呼び出し元が所有する描画内容を一度だけ投影する。state や snapshot に入れず、client 境界を越える mutable な親の値や親の handler も拒否する。任意の server component を client から呼び出せる仕組みへ自動変換しない。

## 2. 境界が見える構文案

schema / view は型検査と実行時 codec の共通宣言とする。view は client へ渡す field の契約であり、認可そのものではない。

```text
schema RenameInput {
  id: DocumentId;
  title: NonEmptyString<200>;
}

view DocumentView {
  id: DocumentId;
  title: string;
}

export server async component DocumentPage({ id }: { id: DocumentId })
  using request: RequestContext
{
  const grant = await policy.documentReader(request, id);
  const document = await documents.read(grant);
  const initial = expose DocumentView {
    id: document.id,
    title: document.title,
  };

  <DocumentEditor initial={initial} />
}

export server action renameDocument(input: RenameInput)
  -> Result<DocumentView, RenameError>
  using request: RequestContext
  authorize grant = policy.documentEditor(request, input.id)
  effects { db.write }
{
  const document = await documents.rename(grant, input.title);
  return Ok(expose DocumentView {
    id: document.id,
    title: document.title,
  });
}

export client component DocumentEditor({ initial }: { initial: DocumentView }) {
  state title = initial.title;
  state error: RenameError? = None;

  <button>
    on click async {
      const result = await remote renameDocument({ id: initial.id, title });
      match result {
        Ok(document) => { title = document.title; error = None; }
        Err(reason) => { error = Some(reason); }
      }
    }
    保存
  </button>
}
```

これは未コンパイルの専用言語案である。`using request` は server adapter から注入し、client が送れる引数に含めない。`authorize grant` は許可を得た場合だけ body へ進む entry 契約で、拒否は宣言した error schema へ変換する。body 内の業務エラーも明示的に Result へ変換し、予期しない例外の stack や secret を response に載せない。

`grant` は actor / tenant / resource / operation と有効条件を持つ server 内部の Permit とする。一般の値から構築したり snapshot に入れたりできない。`documents.rename` は対象 resource と操作が一致する Permit を要求し、実際の変更点で policy の有効条件を保証する trusted adapter の契約を持つ。単に `authenticated` であることと、対象 document を変更できることを分ける。

`expose` は任意の secret を client データへ変換する万能 cast ではない。宣言済み view の shape、出力先の audience、field の情報ラベルを確認する境界とする。承認した公開・復号・情報ラベル変更が必要な処理は、別の audited policy として登録する。

## 3. コンパイル時と request 時の責務

compiler が保証する対象は、許可した DSL と登録した host adapter の契約に限定する。TypeScript の型注釈、Content Mapper、`await` の存在だけをセキュリティの根拠にしない。

| コンパイル時に確認すること | request / 実行時に確認すること |
| --- | --- |
| client graph へ server 実装・DB handle・secret capability が入らない | 認証情報を現在の request から構成する |
| RPC entry に input / output / error schema と access policy がある | wire data を実 schema で decode / validate する |
| client の server 呼出しは explicit `remote` と descriptor 経由に限る | UI や生成 stub を通らない直接 request にも同じ検査を行う |
| 許可された effect 集合を、各 call / await の伝播で満たす | actor / tenant / resource / operation の許可を評価する |
| DB 変更点へ必要な Permit が渡り、policy を飛び越える経路がない | Permit の resource、主体、有効条件を実際の変更点で満たす |
| client props / HTML / snapshot / RPC の出力ラベルを検査する | response schema、公開 error、audience に合う転送と cache を守る |

public endpoint を許す場合も `access public` 等の明示宣言を要求する。policy の省略を public の意味にしない。query の read-only 判定は effect graph 上の制約であり、外部サービスが実際に副作用を持たないことまで compiler が推測するものではない。

RPC はブラウザから直接呼べる API として扱う。endpoint ID の難読化、client での条件分岐、型付き stub、SSR で一度行った認証を認可の代用にしない。React の公式資料も Server Function の引数を client 制御の入力として扱い、操作の認可を server で行うことを求めている。([React security considerations](https://react.dev/reference/rsc/use-server#security-considerations))

認証済み cookie を使う action の場合、request adapter は method / origin / CSRF の明示的な transport policy を持つ。別 origin へ提供する API は別の credentials 契約で登録する。HTTP を使わない server 内部呼出しにも actor と Permit の整合が必要だが、HTTP の origin 検査を内部呼出しへ混同しない。

## 4. await をまたぐ権限と client の寿命

`await` ごとに実行側が変わるわけではない。内部 helper への await と remote の await を IR で区別し、前者は通常の effect 合成、後者は codec / transport / policy の境界になる。

認可後に権限・所有者・tenant が変更され得る場合、古い Permit のまま更新できるとは仮定しない。候補は、変更と同じ transaction / 条件付き更新内での再検査、または policy が明示的に許す有効期間付き Permit である。選んだ有効性の意味を adapter の契約にする。すべての await で機械的に再認証する規則にはしない。

client component の dispose や AbortSignal は、未適用の client 更新を中止できても、既に行った server mutation を rollback しない。client の owner generation と server の認可 revision は別のものとして管理する。action の retry / 二重実行に対する idempotency と、resource の latest-wins も分けて定義する。

初期段階の async は、許可した内部 helper、明示 RPC、生成 runtime が管理する中断点に絞る。任意 Promise の snapshot 保存は許可せず、未知の callback / effect は明示した trusted adapter 以外で拒否する。

## 5. 情報の出力と bundler

保存可能な値であることと、client に渡してよいことは別である。秘密の string も JSON にはできるため、codec の成功だけで出力を許可しない。

情報ラベルの対象は client props / snapshot だけでなく、server component の HTML、RPC response、公開 error も含む。server component と宣言しただけでは出力が秘密になるわけではない。明示的にラベル付けした secret について、演算・分岐条件を含む伝播規則を設計する。任意 JS、host の副作用、timing 等を含む完全な非干渉性を現段階で保証したとは主張しない。

client bundle に入るのは RPC descriptor と入力・出力契約、および client 実装だけである。server action の実装、policy、request context、Permit、server closure を serialize しない。descriptor は公開可能な ID / schema / protocol 情報であり、持っているだけで操作を認可する capability にはしない。

server と client の graph は phase 解析から分離して生成する。server capability の混入を tree shaking が偶然消すことに依存させない。Vite の server graph は entry と policy を登録し、client graph は typed descriptor を解決する。Rolldown が決める physical chunk ID と、server の access policy は独立した契約にする。

`explain boundary` の候補出力は、entry、実行側、remote 呼出箇所、入力・出力 schema、policy、要求 effect、server へ残る値、client へ出る field とその理由である。詳細な認可ロジックや secret の値を client 向け manifest に含めない。

## 6. 形式モデルへ追加する性質

| ID | 性質の候補 | 故障版 / 健全性の確認 |
| --- | --- | --- |
| B01 | client から server 内部関数を直接呼べない | server helper の自動公開を許す変種 |
| B02 | wire の actor / tenant / Permit を server の権限として採用しない | forged payload を受理する変種 |
| B03 | protected mutation は有効な actor / target / operation の許可を伴う | policy skip、別 resource の Permit 再利用 |
| B04 | policy が失効を即時反映すると定めた変更点では、古い認可で commit しない | Authorize → Suspend → Revoke → Commit |
| B05 | secret ラベルの値が未承認の HTML / snapshot / response へ流れない | 直列化可能な secret string の出力、secret 分岐からの出力 |
| B06 | 有効な許可を持つ正常 request が成功へ到達できる | 全 request 拒否という空虚な安全性を排除 |

MoonBit＋veri の最初の security model は actor 二人・document 二個程度で、`Receive / Decode / Authenticate / Authorize / Suspend / Revoke / Commit / Respond` と攻撃者からの直接 request を入力にする案とする。B04 は policy の有効性を先に決めてから検査する。Lean では side / effect の保存、許可される cross-boundary flow、entry 検査を含む変換の意味保存を小さな DSL 上で定義する。

v0 の security model は主体偽造・失効・resource 違いを検査し、strict 69状態の閉包と故障版反例を確認した。[formal.json](../evals/results/formal.json) に実行結果を保存する。B05 の情報ラベルや任意の業務 policy は未検証である。実アプリの policy、trusted host adapter、生成 JS とモデルの対応は別に検査し、認証・認可全体を証明済みとは扱わない。
