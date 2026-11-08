///|
fn[T] find(values : Array[T], predicate : (T) -> Bool) -> T? {
  for value in values {
    if predicate(value) {
      return Some(value)
    }
  }
  None
}

///|
fn obj(fields : Array[(String, Json)]) -> Json {
  Json::object(Map(fields))
}

///|
fn string_json(value : String) -> Json {
  Json::string(value)
}

///|
fn source_json(start : Int32, end : Int32) -> Json {
  obj([
    ("start", Json::number(start.to_double())),
    ("end", Json::number(end.to_double())),
  ])
}

///|
fn[T] json_array(values : Array[T], f : (T) -> Json) -> Json {
  Json::array(values.map(f))
}

///|
fn Expr::json(self : Expr) -> Json {
  match self {
    Conditional(condition, yes, no) =>
      obj([
        ("kind", string_json("conditional")),
        ("test", condition.json()),
        ("yes", yes.json()),
        ("no", no.json()),
      ])
    Method(base, operation, args) =>
      obj([
        ("kind", string_json("method")),
        ("object", base.json()),
        ("method", string_json(operation)),
        ("args", json_array(args, e => e.json())),
      ])
    Collection(base, operation, parameter, body) =>
      obj([
        ("kind", string_json("collection")),
        ("object", base.json()),
        ("method", string_json(operation)),
        ("parameter", string_json(parameter)),
        ("body", body.json()),
      ])
    JsonDecode(ty, value) =>
      obj([
        ("kind", string_json("json-parse")),
        ("type", string_json(ty)),
        ("value", value.json()),
      ])
    JsonEncode(value) =>
      obj([("kind", string_json("json-stringify")), ("value", value.json())])
    Literal(value, ty) => obj([("kind", string_json(ty)), ("value", value)])
    ArrayValue(values) =>
      obj([
        ("kind", string_json("array")),
        ("values", json_array(values, e => e.json())),
      ])
    RecordValue(fields) =>
      obj([
        ("kind", string_json("record")),
        (
          "fields",
          json_array(fields, f => {
            obj([("name", string_json(f.0)), ("value", f.1.json())])
          }),
        ),
      ])
    Index(base, index) =>
      obj([
        ("kind", string_json("index")),
        ("object", base.json()),
        ("index", index.json()),
      ])
    Not(value) => obj([("kind", string_json("not")), ("value", value.json())])
    Name(name, _) =>
      obj([("kind", string_json("name")), ("name", string_json(name))])
    Binary(op, left, right) =>
      obj([
        ("kind", string_json("binary")),
        ("op", string_json(op)),
        ("left", left.json()),
        ("right", right.json()),
      ])
    Property(Name("event", _), key) =>
      obj([("kind", string_json("event")), ("field", string_json(key))])
    Property(base, key) =>
      obj([
        ("kind", string_json("property")),
        ("object", base.json()),
        ("key", string_json(key)),
      ])
    Remote(name, fields) =>
      obj([
        ("kind", string_json("remote")),
        ("name", string_json(name)),
        (
          "fields",
          json_array(fields, pair => {
            obj([("name", string_json(pair.0)), ("value", pair.1.json())])
          }),
        ),
      ])
  }
}

///|
fn Field::json(self : Field, located~ : Bool = false) -> Json {
  let fields = [
    ("name", string_json(self.name)),
    ("type", string_json(self.ty)),
    ("optional", Json::boolean(self.optional)),
  ]
  if !self.constraints.is_empty() {
    fields.push(("constraints", json_array(self.constraints, r => r.json())))
  }
  if located {
    fields.push(("source", source_json(self.start, self.end)))
  }
  obj(fields)
}

///|
fn Node::json(self : Node) -> Json {
  match self {
    Select(cases, fallback, start) =>
      obj([
        ("kind", string_json("select")),
        (
          "cases",
          json_array(cases, c => {
            obj([
              ("test", c.0.json()),
              ("children", json_array(c.1, n => n.json())),
            ])
          }),
        ),
        ("fallback", json_array(fallback, n => n.json())),
        (
          "source",
          obj([
            ("start", Json::number(start.to_double())),
            ("end", Json::number((start + 1).to_double())),
          ]),
        ),
      ])
    Each(item, index, source, key, children, empty, start) =>
      obj([
        ("kind", string_json("each")),
        ("item", string_json(item)),
        ("index", string_json(index)),
        ("value", source.json()),
        ("key", key.json()),
        ("children", json_array(children, n => n.json())),
        ("empty", json_array(empty, n => n.json())),
        (
          "source",
          obj([
            ("start", Json::number(start.to_double())),
            ("end", Json::number((start + 1).to_double())),
          ]),
        ),
      ])
    Boundary(children, error, fallback, start) =>
      obj([
        ("kind", string_json("boundary")),
        ("children", json_array(children, n => n.json())),
        ("error", string_json(error)),
        ("fallback", json_array(fallback, n => n.json())),
        (
          "source",
          obj([
            ("start", Json::number(start.to_double())),
            ("end", Json::number((start + 1).to_double())),
          ]),
        ),
      ])
    Text(value) =>
      obj([("kind", string_json("text")), ("value", string_json(value))])
    Expression(value) =>
      obj([("kind", string_json("expression")), ("value", value.json())])
    Invocation(name, props, children, start) =>
      obj([
        ("kind", string_json("component")),
        ("name", string_json(name)),
        (
          "props",
          json_array(props, a => {
            obj([("name", string_json(a.name)), ("value", a.value.json())])
          }),
        ),
        ("children", json_array(children, n => n.json())),
        (
          "source",
          obj([
            ("start", Json::number(start.to_double())),
            ("end", Json::number((start + name.length() + 1).to_double())),
          ]),
        ),
      ])
    Element(tag, attributes, children, handlers, start) =>
      obj([
        ("kind", string_json("element")),
        ("tag", string_json(tag)),
        (
          "source",
          obj([
            ("start", Json::number(start.to_double())),
            ("end", Json::number((start + tag.length() + 1).to_double())),
          ]),
        ),
        (
          "attributes",
          json_array(attributes, a => {
            obj([("name", string_json(a.name)), ("value", a.value.json())])
          }),
        ),
        ("children", json_array(children, n => n.json())),
        (
          "handlers",
          json_array(handlers, h => {
            obj([
              ("id", string_json(h.id)),
              ("event", string_json(h.event)),
              ("async", Json::boolean(h.is_async)),
              (
                "source",
                obj([
                  ("start", Json::number(h.start.to_double())),
                  ("end", Json::number(h.end.to_double())),
                ]),
              ),
              (
                "statements",
                json_array(h.statements, s => {
                  obj([
                    ("target", string_json(s.target)),
                    ("source", source_json(s.start, s.end)),
                    ("op", string_json(s.op)),
                    ("value", s.value.json()),
                  ])
                }),
              ),
            ])
          }),
        ),
      ])
  }
}

///|
fn Component::json(self : Component) -> Json {
  obj([
    ("name", string_json(self.name)),
    ("side", string_json(self.side)),
    ("props", json_array(self.props, f => f.json(located=true))),
    (
      "states",
      json_array(self.states, s => {
        obj([
          ("name", string_json(s.name)),
          ("source", source_json(s.start, s.end)),
          ("type", string_json(s.ty)),
          ("initial", s.initial.json()),
        ])
      }),
    ),
    (
      "derives",
      json_array(self.derives, d => {
        obj([
          ("name", string_json(d.name)),
          ("source", source_json(d.start, d.end)),
          ("value", d.value.json()),
        ])
      }),
    ),
    ("root", self.root.json()),
  ])
}

///|
fn Schema::json(self : Schema) -> Json {
  obj([
    ("name", string_json(self.name)),
    ("kind", string_json(self.kind)),
    ("fields", json_array(self.fields, f => f.json())),
  ])
}

///|
fn Action::json(self : Action) -> Json {
  obj([
    ("name", string_json(self.name)),
    ("inputSchema", string_json(self.input_schema)),
    ("outputSchema", string_json(self.output_schema)),
    ("inputName", string_json(self.input_name)),
    ("requestName", string_json(self.request_name)),
    ("grantName", string_json(self.grant_name)),
    (
      "policy",
      obj([
        ("name", string_json(self.policy_name)),
        ("targetField", string_json(self.target_field)),
      ]),
    ),
    ("effects", json_array(self.effects, string_json)),
    (
      "validation",
      if self.validation == "" {
        Json::null()
      } else {
        obj([
          ("name", string_json(self.validation)),
          ("effects", Json::array([string_json("db.read")])),
        ])
      },
    ),
    (
      "call",
      obj([
        ("name", string_json(self.call_name)),
        (
          "args",
          json_array(self.args, a => {
            match a {
              Grant => obj([("kind", string_json("grant"))])
              Input(field) =>
                obj([
                  ("kind", string_json("input")),
                  ("field", string_json(field)),
                ])
            }
          }),
        ),
      ]),
    ),
  ])
}
