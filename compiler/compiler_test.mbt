///|
fn field(value : Json, key : String) -> Json {
  match value {
    Object(fields) => fields.get(key).unwrap()
    _ => abort("expected object")
  }
}

///|
let counter_source : String =
  #|export client component Counter({ initial }: { initial: number }) {
  #|  state count: number = initial;
  #|  derive doubled: number = count * 2;
  #|  <button class="counter">
  #|    on click { count += 1; }
  #|    {count} / {doubled}
  #|  </button>
  #|}

///|
test "counter compiles to versioned IR" {
  let result = @json.parse(@compiler.compile(counter_source))
  assert_eq(field(result, "ok"), Json::boolean(true))
  assert_eq(field(field(result, "ir"), "version"), Json::number(1))
}

///|
fn diagnostic_code(source : String) -> Json raise {
  let result = @json.parse(@compiler.compile(source))
  assert_eq(field(result, "ok"), Json::boolean(false))
  match field(result, "diagnostics") {
    Array(items) => field(items[0], "code")
    _ => abort("expected diagnostics")
  }
}

///|
let action_source : String =
  #|schema RenameInput { id: string; title: string; }
  #|view DocumentView { id: string; title: string; }
  #|export server action renameDocument(input: RenameInput): DocumentView
  #|  using request: RequestContext
  #|  authorize grant = policy.documentEditor(request, input.id)
  #|  effects { db.write }
  #|{
  #|  return await documents.rename(grant, input.title);
  #|}

///|
test "action metadata has schemas policy and grant" {
  let result = @json.parse(@compiler.compile(action_source))
  assert_eq(field(result, "ok"), Json::boolean(true))
  match field(field(result, "ir"), "actions") {
    Array(items) => {
      assert_eq(field(items[0], "name"), Json::string("renameDocument"))
      assert_eq(
        field(field(items[0], "policy"), "targetField"),
        Json::string("id"),
      )
    }
    _ => abort("expected actions")
  }
}

///|
test "action policy cannot be omitted" {
  let source = action_source.replace(
    old="authorize grant = policy.documentEditor(request, input.id)",
    new="",
  )
  assert_eq(diagnostic_code(source), Json::string("E_ACTION_POLICY"))
}

///|
test "server component cannot own state" {
  assert_eq(
    diagnostic_code(
      counter_source.replace(old="client component", new="server component"),
    ),
    Json::string("E_SERVER_STATE"),
  )
}

///|
test "unqualified component is a pure universal component" {
  let result = @json.parse(
    @compiler.compile(
      "export component Label({ initial }: { initial: number }) { derive doubled = initial * 2; <p>{doubled}</p> }",
    ),
  )
  assert_eq(field(result, "ok"), Json::boolean(true))
  match field(field(result, "ir"), "components") {
    Array(items) =>
      assert_eq(field(items[0], "side"), Json::string("universal"))
    _ => abort("expected components")
  }
}

///|
test "component calls use named props and allow forward declarations" {
  let result = @json.parse(
    @compiler.compile(
      "server component Page() { <Child value={5} /> } client component Child(value: number) { state n = value; <button>on click { n += 1; }{n}</button> }",
    ),
  )
  assert_eq(field(result, "ok"), Json::boolean(true))
}

///|
test "component phase and prop boundaries are explicit" {
  assert_eq(
    diagnostic_code("component Page() { <Missing /> }"),
    Json::string("E_COMPONENT_UNKNOWN"),
  )
  assert_eq(
    diagnostic_code(
      "component Child(value: number) { <p>{value}</p> } component Page() { <Child value=\"5\" /> }",
    ),
    Json::string("E_COMPONENT_PROPS"),
  )
  assert_eq(
    diagnostic_code(
      "server component Secret() { <p>Secret</p> } client component Page() { <Secret /> }",
    ),
    Json::string("E_COMPONENT_PHASE"),
  )
}

///|
test "recursive component expansion reports a closed cycle" {
  assert_eq(
    diagnostic_code("component A() { <B /> } component B() { <A /> }"),
    Json::string("E_COMPONENT_CYCLE"),
  )
}

///|
test "children is an opaque render fragment parameter" {
  let result = @json.parse(
    @compiler.compile(
      "component Card(children: RenderFragment) { <section>{children}</section> } component Page() { <Card><p>Text</p></Card> }",
    ),
  )
  assert_eq(field(result, "ok"), Json::boolean(true))
  assert_eq(
    diagnostic_code(
      "component Card(children: RenderFragment) { <section>{children}{children}</section> }",
    ),
    Json::string("E_COMPONENT_CHILDREN"),
  )
}

///|
test "universal component cannot infer a client boundary from state" {
  assert_eq(
    diagnostic_code("component Bad() { state count = 0; <p>{count}</p> }"),
    Json::string("E_COMPONENT_STATE"),
  )
}

///|
test "universal component cannot infer a client boundary from an event" {
  assert_eq(
    diagnostic_code("component Bad() { <button>on click {}Click</button> }"),
    Json::string("E_COMPONENT_EVENT"),
  )
}

///|
test "derived graph cannot have cycles" {
  let source = "export client component Cycle() { derive a = b + 1; derive b = a + 1; <p>{a}</p> }"
  assert_eq(diagnostic_code(source), Json::string("E_DERIVE_CYCLE"))
}

///|
test "unknown template reference is rejected" {
  let source = "export client component Bad() { <p>{secret}</p> }"
  assert_eq(diagnostic_code(source), Json::string("E_UNKNOWN_NAME"))
}

///|
test "props are read only" {
  let source = "export client component Bad({ value }: { value: number }) { <button>on click { value += 1; }{value}</button> }"
  assert_eq(diagnostic_code(source), Json::string("E_STATE_WRITE"))
}

///|
test "direct props normalize to the existing primitive object contract" {
  let direct = @json.parse(
    @compiler.compile(
      "component Label(title: string, count: number,) { <p>{title}{count}</p> }",
    ),
  )
  let legacy = @json.parse(
    @compiler.compile(
      "component Label({ title, count }: { title: string; count: number }) { <p>{title}{count}</p> }",
    ),
  )
  assert_eq(field(direct, "ok"), Json::boolean(true))
  assert_eq(field(legacy, "ok"), Json::boolean(true))
  match
    (
      field(field(direct, "ir"), "components"),
      field(field(legacy, "ir"), "components"),
    ) {
    (Array(a), Array(b)) => {
      match (field(a[0], "props"), field(b[0], "props")) {
        (Array(direct), Array(legacy)) => {
          assert_eq(direct.length(), legacy.length())
          for i = 0; i < direct.length(); i = i + 1 {
            for key in ["name", "type", "optional"] {
              assert_eq(field(direct[i], key), field(legacy[i], key))
            }
            assert_true(field(direct[i], "source") != field(legacy[i], "source"))
          }
        }
        _ => abort("expected props")
      }
    }
    _ => abort("expected components")
  }
}

///|
test "direct props stay read only" {
  assert_eq(
    diagnostic_code(
      "client component Bad(value: number) { <button>on click { value += 1; }{value}</button> }",
    ),
    Json::string("E_STATE_WRITE"),
  )
}

///|
test "handler assignment supports explicit remote result projection" {
  let source = action_source +
    "\nexport client component Editor({ id, initial }: { id: string; initial: string }) { state title = initial; <button>on click async { title = (await remote renameDocument({ id, title })).title; }{title}</button> }"
  let result = @json.parse(@compiler.compile(source))
  assert_eq(field(result, "ok"), Json::boolean(true))
}

///|
test "remote cannot hide in a derive" {
  let source = action_source +
    "\nexport client component Bad() { derive title = (await remote renameDocument({ id: \"a\", title: \"b\" })).title; <p>{title}</p> }"
  assert_eq(diagnostic_code(source), Json::string("E_DERIVE_EFFECT"))
}

///|
test "grant must be mutation first argument" {
  let source = action_source.replace(
    old="documents.rename(grant, input.title)",
    new="documents.rename(input.id, input.title)",
  )
  assert_eq(diagnostic_code(source), Json::string("E_ACTION_GRANT"))
}

///|
test "template text keeps spaces between bindings" {
  let result = @json.parse(@compiler.compile(counter_source))
  match field(field(result, "ir"), "components") {
    Array(components) =>
      match field(field(components[0], "root"), "children") {
        Array(children) =>
          assert_eq(field(children[1], "value"), Json::string(" / "))
        _ => abort("expected children")
      }
    _ => abort("expected components")
  }
}

///|
test "runtime protocol attributes are reserved" {
  assert_eq(
    diagnostic_code(
      "export client component Bad() { <button data-isle-root=\"fake\">Bad</button> }",
    ),
    Json::string("E_ATTRIBUTE"),
  )
}

///|
test "DOM subset is rejected at check rather than failing at emit" {
  assert_eq(
    diagnostic_code("export client component Bad() { <custom>Bad</custom> }"),
    Json::string("E_TAG"),
  )
}

///|
test "prototype object keys cannot become bindings" {
  assert_eq(
    diagnostic_code(
      "export client component Bad() { state __proto__ = 1; <p>{__proto__}</p> }",
    ),
    Json::string("E_IDENTIFIER"),
  )
}

///|
test "derived annotation is enforced" {
  assert_eq(
    diagnostic_code(
      "export client component Bad() { derive value: string = 1; <p>{value}</p> }",
    ),
    Json::string("E_DERIVE_TYPE"),
  )
}

///|
test "unknown name diagnostic points to source expression" {
  let source = "export client component Bad() { <p>猫😀{secret}</p> }"
  let result = @json.parse(@compiler.compile(source))
  match field(result, "diagnostics") {
    Array(items) =>
      assert_eq(
        field(items[0], "start"),
        Json::number(source.find("secret").unwrap().to_double()),
      )
    _ => abort("expected diagnostics")
  }
}

///|
test "duplicate destructuring binding is rejected" {
  assert_eq(
    diagnostic_code(
      "export client component Bad({ a, a }: { a: number; b: number }) { <p>{a}</p> }",
    ),
    Json::string("E_PROPS"),
  )
}
