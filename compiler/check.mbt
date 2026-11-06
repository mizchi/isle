///|
fn Expr::refs(self : Expr) -> Array[(String, Int32)] {
  match self {
    Conditional(condition, yes, no) => {
      let out = condition.refs()
      out.append(yes.refs())
      out.append(no.refs())
      out
    }
    Method(base, _, args) => {
      let out = base.refs()
      for arg in args {
        out.append(arg.refs())
      }
      out
    }
    Collection(base, _, parameter, body) => {
      let out = base.refs()
      out.append(body.refs().filter(reference => reference.0 != parameter))
      out
    }
    JsonDecode(_, value) | JsonEncode(value) => value.refs()
    ArrayValue(values) =>
      values.fold(init=[], (out, e) => {
        out.append(e.refs())
        out
      })
    RecordValue(fields) =>
      fields.fold(init=[], (out, f) => {
        out.append(f.1.refs())
        out
      })
    Index(base, index) => {
      let out = base.refs()
      out.append(index.refs())
      out
    }
    Not(value) => value.refs()
    Literal(_, _) => []
    Name(name, start) => [(name, start)]
    Binary(_, left, right) => {
      let out = left.refs()
      out.append(right.refs())
      out
    }
    Property(Name("event", _), _) => []
    Property(base, _) => base.refs()
    Remote(_, fields) => {
      let out = []
      for field in fields {
        out.append(field.1.refs())
      }
      out
    }
  }
}

///|
fn Expr::has_remote(self : Expr) -> Bool {
  match self {
    Conditional(condition, yes, no) =>
      condition.has_remote() || yes.has_remote() || no.has_remote()
    Method(base, _, args) => base.has_remote() || args.any(e => e.has_remote())
    Collection(base, _, _, body) => base.has_remote() || body.has_remote()
    JsonDecode(_, value) | JsonEncode(value) => value.has_remote()
    ArrayValue(values) => values.any(e => e.has_remote())
    RecordValue(fields) => fields.any(f => f.1.has_remote())
    Index(base, index) => base.has_remote() || index.has_remote()
    Not(value) => value.has_remote()
    Remote(_, _) => true
    Property(base, _) => base.has_remote()
    Binary(_, a, b) => a.has_remote() || b.has_remote()
    _ => false
  }
}

///|
fn Expr::ty(
  self : Expr,
  env : Map[String, String],
  schemas : Array[Schema],
  actions : Array[Action],
  p : Parser,
) -> String raise CompileError {
  match self {
    Conditional(condition, yes, no) => {
      if condition.ty(env, schemas, actions, p) != "boolean" {
        p.fail(
          "E_EXPRESSION_TYPE", "Conditional test requires boolean", "Use a boolean condition.",
        )
      }
      let ty = yes.ty(env, schemas, actions, p)
      if !accepts(no, ty, env, schemas, actions, p) {
        p.fail(
          "E_EXPRESSION_TYPE", "Conditional arms require the same type", "Return one closed type from both arms.",
        )
      }
      ty
    }
    Method(base, operation, args) => {
      let ty = base.ty(env, schemas, actions, p)
      if operation == "trim" && ty == "string" && args.is_empty() {
        "string"
      } else if operation == "concat" &&
        ty.has_suffix("[]") &&
        args.length() == 1 &&
        accepts(args[0], ty, env, schemas, actions, p) {
        ty
      } else {
        p.fail(
          "E_EXPRESSION_TYPE", "Unsupported pure operation or arguments", "Use string.trim() or array.concat(array) with matching closed types.",
        )
      }
    }
    Collection(base, operation, parameter, body) => {
      let ty = base.ty(env, schemas, actions, p)
      if !ty.has_suffix("[]") ||
        ty == "[]" ||
        env.contains(parameter) ||
        parameter == "event" ||
        parameter == "JSON" {
        p.fail(
          "E_EXPRESSION_TYPE", "Collection callbacks require a typed array and a fresh parameter",
          "Use one non-shadowing parameter in a pure expression callback.",
        )
      }
      let inner = env.copy()
      inner.set(parameter, ty[:ty.length() - 2].to_owned())
      if body.has_remote() ||
        !accepts(
          body,
          if operation == "map" {
            ty[:ty.length() - 2].to_owned()
          } else {
            "boolean"
          },
          inner,
          schemas,
          actions,
          p,
        ) {
        p.fail(
          "E_EXPRESSION_TYPE", "Invalid pure collection callback", "map preserves the item type; filter/some/every require boolean. Effects are forbidden.",
        )
      }
      if ["some", "every"].contains(operation) {
        "boolean"
      } else {
        ty
      }
    }
    JsonDecode(ty, value) => {
      if !valid_value_type(ty, schemas) ||
        value.ty(env, schemas, actions, p) != "string" {
        p.fail(
          "E_EXPRESSION_TYPE", "JSON decode requires a closed type and string input",
          "Use JSON.parse<DeclaredType>(text); decoded values are checked at runtime.",
        )
      }
      ty
    }
    JsonEncode(value) => {
      if !valid_value_type(value.ty(env, schemas, actions, p), schemas) {
        p.fail(
          "E_EXPRESSION_TYPE", "JSON encode requires a closed value", "Encode a typed serializable value.",
        )
      }
      "string"
    }
    ArrayValue(values) =>
      if values.is_empty() {
        "[]"
      } else {
        let ty = values[0].ty(env, schemas, actions, p)
        if values.any(e => e.ty(env, schemas, actions, p) != ty) {
          p.fail(
            "E_EXPRESSION_TYPE", "Array items require one type", "Use a homogeneous array.",
          )
        }
        ty + "[]"
      }
    RecordValue(_) =>
      p.fail(
        "E_TYPE", "Record literals require a declared type", "Annotate the state or pass the record to a typed prop.",
      )
    Index(base, index) => {
      let ty = base.ty(env, schemas, actions, p)
      if !ty.has_suffix("[]") || index.ty(env, schemas, actions, p) != "number" {
        p.fail(
          "E_EXPRESSION_TYPE", "Index requires an array and number", "Use a finite integer array index.",
        )
      }
      ty[:ty.length() - 2].to_owned()
    }
    Not(value) => {
      if value.ty(env, schemas, actions, p) != "boolean" {
        p.fail(
          "E_EXPRESSION_TYPE", "Negation requires boolean", "Use ! on boolean values.",
        )
      }
      "boolean"
    }
    Literal(_, ty) => ty
    Name(name, start) =>
      match env.get(name) {
        Some(ty) => ty
        None =>
          p.fail_at(
            "E_UNKNOWN_NAME",
            "Unknown reference '" + name + "'",
            "Declare a primitive prop, state or derive; arbitrary globals and helper calls are not supported.",
            start,
            name.length(),
          )
      }
    Binary(op, a, b) => {
      let left = a.ty(env, schemas, actions, p)
      let right = b.ty(env, schemas, actions, p)
      if ["===", "!=="].contains(op) &&
        left == right &&
        ["number", "string", "boolean"].contains(left) {
        "boolean"
      } else if ["<", ">", "<=", ">="].contains(op) &&
        left == right &&
        ["number", "string"].contains(left) {
        "boolean"
      } else if ["&&", "||"].contains(op) &&
        left == "boolean" &&
        right == "boolean" {
        "boolean"
      } else if ["+", "-", "*", "/"].contains(op) &&
        left == "number" &&
        right == "number" {
        "number"
      } else if op == "+" && left == "string" && right == "string" {
        "string"
      } else {
        p.fail(
          "E_EXPRESSION_TYPE", "Binary operands have incompatible types", "Use numeric arithmetic or string + string in the prototype.",
        )
      }
    }
    Property(Name("event", start), key) => {
      if !env.contains("$event") {
        p.fail_at(
          "E_EVENT_SCOPE", "Event values are only available inside their event entry",
          "Read event.value or event.checked inside a supported on block.", start,
          5,
        )
      }
      match env.get("$event." + key) {
        Some(ty) => ty
        None =>
          p.fail_at(
            "E_EVENT_FIELD",
            "Event field is not available on this target: " + key,
            "Use value for text controls, checked for checkbox/radio, and invalid/validationMessage for validation.",
            start,
            6 + key.length(),
          )
      }
    }
    Property(base, key) => {
      let base_ty = base.ty(env, schemas, actions, p)
      if base_ty.has_suffix("[]") && key == "length" {
        return "number"
      }
      match find(schemas, s => s.name == base_ty) {
        Some(schema) =>
          match find(schema.fields, f => f.name == key) {
            Some(field) => field.ty
            None =>
              p.fail(
                "E_UNKNOWN_FIELD",
                "Unknown view field '" + key + "'",
                "Read a field declared by the action output view.",
              )
          }
        None =>
          p.fail(
            "E_PROPERTY", "Property access requires a declared schema or view", "Primitive props are destructured; arbitrary object access is not supported.",
          )
      }
    }
    Remote(name, fields) =>
      match find(actions, a => a.name == name) {
        None =>
          p.fail(
            "E_REMOTE_ENTRY",
            "Unknown remote action '" + name + "'",
            "Declare a server action in this source; imports are not implemented yet.",
          )
        Some(action) => {
          let schema = find(schemas, s => s.name == action.input_schema).unwrap()
          if fields.length() != schema.fields.length() {
            p.fail(
              "E_REMOTE_INPUT", "Remote input does not match its schema", "Supply exactly the fields declared by the input schema.",
            )
          }
          for field in schema.fields {
            match find(fields, pair => pair.0 == field.name) {
              None =>
                p.fail(
                  "E_REMOTE_INPUT",
                  "Missing remote input field '" + field.name + "'",
                  "Supply every declared input field.",
                )
              Some((_, value)) =>
                if value.ty(env, schemas, actions, p) != field.ty {
                  p.fail(
                    "E_REMOTE_INPUT", "Remote input field type mismatch", "Match the action input schema.",
                  )
                }
            }
          }
          action.output_schema
        }
      }
  }
}

///|
fn valid_value_type(ty : String, schemas : Array[Schema]) -> Bool {
  if ty.has_suffix("[]") {
    valid_value_type(ty[:ty.length() - 2].to_owned(), schemas)
  } else {
    ["number", "string", "boolean"].contains(ty) ||
    schemas.any(s => s.name == ty)
  }
}

///|
fn accepts(
  value : Expr,
  expected : String,
  env : Map[String, String],
  schemas : Array[Schema],
  actions : Array[Action],
  p : Parser,
) -> Bool raise CompileError {
  match value {
    Conditional(condition, yes, no) =>
      condition.ty(env, schemas, actions, p) == "boolean" &&
      accepts(yes, expected, env, schemas, actions, p) &&
      accepts(no, expected, env, schemas, actions, p)
    ArrayValue(values) => {
      if !expected.has_suffix("[]") {
        return false
      }
      let item = expected[:expected.length() - 2].to_owned()
      values.all(e => accepts(e, item, env, schemas, actions, p))
    }
    RecordValue(fields) =>
      match find(schemas, s => s.name == expected) {
        None => false
        Some(schema) =>
          fields.length() == schema.fields.length() &&
          schema.fields.all(f => {
            let matches = fields.filter(pair => pair.0 == f.name)
            matches.length() == 1 &&
            accepts(matches[0].1, f.ty, env, schemas, actions, p)
          })
      }
    _ => value.ty(env, schemas, actions, p) == expected
  }
}

///|
fn Node::nested(self : Node) -> Array[Node] {
  match self {
    Select(cases, fallback, _) => {
      let out = fallback.copy()
      for c in cases {
        out.append(c.1)
      }
      out
    }
    Each(_, _, _, _, children, empty, _) | Boundary(children, _, empty, _) => {
      let out = children.copy()
      out.append(empty)
      out
    }
    Element(_, _, children, _, _) | Invocation(_, _, children, _) => children
    _ => []
  }
}

///|
fn order_derives(component : Component) -> Array[Derived] raise CompileError {
  let by_name : Map[String, Derived] = Map([])
  let by_id : Map[String, Derived] = Map([])
  for derived in component.derives {
    by_name.set(derived.name, derived)
    by_id.set(component.name + "." + derived.name, derived)
  }
  let nodes : Array[DependencyNode] = []
  for derived in component.derives {
    let dependencies : Array[DependencyEdge] = []
    for (name, start) in derived.value.refs() {
      if by_name.contains(name) {
        dependencies.push({
          id: component.name + "." + name,
          source: { file: "", start, end: start + name.length(), },
        })
      }
    }
    nodes.push({
      id: component.name + "." + derived.name,
      source: { file: "", start: derived.start, end: derived.end, },
      dependencies,
    })
  }
  let ordered = order_dependencies(nodes) catch {
    Invalid(diagnostic) =>
      raise Invalid({
        ..diagnostic,
        code: if diagnostic.code == "E_DEPENDENCY_CYCLE" {
          "E_DERIVE_CYCLE"
        } else {
          diagnostic.code
        },
      })
  }
  ordered.map(id => by_id.get(id).unwrap())
}

///|
fn check_handler_names(
  node : Node,
  names : Array[String],
  p : Parser,
) -> Unit raise CompileError {
  match node {
    Select(_, _, _)
    | Each(_, _, _, _, _, _, _)
    | Boundary(_, _, _, _)
    | Invocation(_, _, _, _) =>
      for child in node.nested() {
        check_handler_names(child, names, p)
      }
    Element(_, _, children, handlers, _) => {
      for handler in handlers {
        if names.contains(handler.id) {
          p.fail_at(
            "E_CHUNK_NAME",
            "Duplicate event chunk name '" + handler.id + "'",
            "Give event blocks unique names within their component.",
            handler.start,
            handler.end - handler.start,
          )
        }
        names.push(handler.id)
      }
      for child in children {
        check_handler_names(child, names, p)
      }
    }
    _ => ()
  }
}

///|
fn check_node(
  node : Node,
  component : Component,
  env : Map[String, String],
  schemas : Array[Schema],
  actions : Array[Action],
  components : Array[Component],
  p : Parser,
) -> Unit raise CompileError {
  match node {
    Select(cases, fallback, _) => {
      for c in cases {
        if c.0.has_remote() || c.0.ty(env, schemas, actions, p) != "boolean" {
          p.fail(
            "E_CONTROL_TYPE", "Conditions require a pure boolean", "Use a boolean expression.",
          )
        }
        for child in c.1 {
          check_node(child, component, env, schemas, actions, components, p)
        }
      }
      for child in fallback {
        check_node(child, component, env, schemas, actions, components, p)
      }
    }
    Each(item, index, source, key, children, empty, _) => {
      let ty = source.ty(env, schemas, actions, p)
      if source.has_remote() || !ty.has_suffix("[]") {
        p.fail(
          "E_CONTROL_TYPE", "For requires a typed array", "Pass a readonly array of serializable values.",
        )
      }
      if item == index ||
        item == "event" ||
        env.contains(item) ||
        (index != "" && (index == "event" || env.contains(index))) {
        p.fail(
          "E_DUPLICATE", "Loop bindings must be unique", "Choose fresh row and index names.",
        )
      }
      let bindings = env.copy()
      bindings.set(item, ty[:ty.length() - 2].to_owned())
      if index != "" {
        bindings.set(index, "number")
      }
      let key_ty = key.ty(bindings, schemas, actions, p)
      if key.has_remote() ||
        !["string", "number"].contains(key_ty) ||
        key.refs().is_empty() ||
        key.refs().any(pair => pair.0 != item) {
        p.fail(
          "E_CONTROL_KEY", "Keys must depend only on the row and have string or numeric type",
          "Use a stable row ID; array indexes and outer state are forbidden.",
        )
      }
      for child in children {
        check_node(child, component, bindings, schemas, actions, components, p)
      }
      for child in empty {
        check_node(child, component, env, schemas, actions, components, p)
      }
    }
    Boundary(children, error, fallback, _) => {
      if error == "event" || env.contains(error) {
        p.fail(
          "E_DUPLICATE", "Catch binding must be unique", "Choose a fresh error name.",
        )
      }
      for child in children {
        check_node(child, component, env, schemas, actions, components, p)
      }
      let bindings = env.copy()
      bindings.set(error, "string")
      for child in fallback {
        check_node(child, component, bindings, schemas, actions, components, p)
      }
    }
    Text(_) => ()
    Expression(value) => {
      if value.has_remote() {
        p.fail(
          "E_ASYNC_BOUNDARY", "Remote calls cannot execute during template rendering",
          "Use an explicit on event async block.",
        )
      }
      let _ = value.ty(env, schemas, actions, p)
    }
    Invocation(name, props, children, start) => {
      let target = match find(components, c => c.name == name) {
        Some(target) => target
        None =>
          p.fail_at(
            "E_COMPONENT_UNKNOWN",
            "Unknown component '" + name + "'",
            "Declare the component at the top level of this source.",
            start,
            name.length() + 1,
          )
      }
      if (component.side == "client" && target.side == "server") ||
        (component.side == "universal" && target.side != "universal") {
        p.fail_at(
          "E_COMPONENT_PHASE",
          "Component phase cannot cross this boundary: " +
          component.side +
          " -> " +
          target.side,
          "Universal components may call universal components; client components cannot instantiate server components. Project already-rendered content through children instead.",
          start,
          name.length() + 1,
        )
      }
      let expected = target.props.filter(f => f.ty != "RenderFragment")
      let seen : Array[String] = []
      for prop in props {
        if seen.contains(prop.name) || !expected.any(f => f.name == prop.name) {
          p.fail_at(
            "E_COMPONENT_PROPS",
            "Unknown or duplicate prop '" + prop.name + "'",
            "Supply exactly the component's named primitive props.",
            start,
            name.length() + 1,
          )
        }
        seen.push(prop.name)
        let field = find(expected, f => f.name == prop.name).unwrap()
        if prop.value.has_remote() ||
          !accepts(prop.value, field.ty, env, schemas, actions, p) {
          p.fail_at(
            "E_COMPONENT_PROPS",
            "Prop type mismatch for '" + prop.name + "'",
            "Match the declared primitive prop type; remote calls belong to explicit events.",
            start,
            name.length() + 1,
          )
        }
      }
      if expected.length() != props.length() {
        p.fail_at(
          "E_COMPONENT_PROPS",
          "Missing required component props",
          "Supply every named primitive prop.",
          start,
          name.length() + 1,
        )
      }
      if !children.is_empty() &&
        !target.props.any(f => f.ty == "RenderFragment") {
        p.fail_at(
          "E_COMPONENT_CHILDREN",
          "Component does not declare children",
          "Declare children: RenderFragment and project it once in the template.",
          start,
          name.length() + 1,
        )
      }
      for child in children {
        check_node(child, component, env, schemas, actions, components, p)
      }
    }
    Element(tag, attributes, children, handlers, start) => {
      if component.side != "client" && attributes.any(a => a.name == "schema") {
        p.fail_at(
          "E_FORM_SCHEMA",
          "Schema forms require an explicit client component",
          "Use a client component for schema Form behavior.",
          start,
          tag.length() + 1,
        )
      }
      check_form_attributes(tag, attributes, env, schemas, actions, p, start)
      for attribute in attributes {
        if attribute.name == "href" &&
          (
            attribute.value.ty(env, schemas, actions, p) != "string" ||
            attribute.value
            .refs()
            .any(pair => {
              component.states.any(state => state.name == pair.0) ||
              component.derives.any(derived => derived.name == pair.0)
            })
          ) {
          p.fail_at(
            "E_LINK",
            "Link destinations must be immutable strings",
            "Use a literal or an immutable server prop.",
            start,
            tag.length() + 1,
          )
        }
        if attribute.value.has_remote() {
          p.fail(
            "E_ASYNC_BOUNDARY", "Remote calls cannot execute in attributes", "Use an explicit on event async block.",
          )
        }
        if attribute.value.ty(env, schemas, actions, p) == "RenderFragment" {
          p.fail_at(
            "E_COMPONENT_CHILDREN",
            "Render fragments cannot become attribute values",
            "Project children directly in the template.",
            start,
            tag.length() + 1,
          )
        }
      }
      for handler in handlers {
        let event_env = event_environment(tag, attributes, handler, env, p)
        for statement in handler.statements {
          let target = find(component.states, s => s.name == statement.target)
          match target {
            None =>
              p.fail(
                "E_STATE_WRITE",
                "Only declared state may be assigned: '" +
                statement.target +
                "'",
                "Use state for mutable browser values; props and derives are read-only.",
              )
            Some(_) => {
              if statement.value.has_remote() && !handler.is_async {
                p.fail(
                  "E_ASYNC_BOUNDARY", "await remote requires an async event entry",
                  "Write on click async { ... }.",
                )
              }
              let target_ty = env.get(statement.target).unwrap()
              if !accepts(
                  statement.value,
                  target_ty,
                  event_env,
                  schemas,
                  actions,
                  p,
                ) ||
                (
                  (statement.op == "+=" || statement.op == "-=") &&
                  target_ty != "number"
                ) {
                p.fail(
                  "E_STATE_TYPE",
                  "Assignment type does not match state '" +
                  statement.target +
                  "'",
                  "Use a matching primitive value; remote results must be projected to a declared field.",
                )
              }
            }
          }
        }
      }
      for child in children {
        check_node(child, component, env, schemas, actions, components, p)
      }
    }
  }
}

///|
fn check_component(
  component : Component,
  schemas : Array[Schema],
  actions : Array[Action],
  components : Array[Component],
  p : Parser,
) -> Component raise CompileError {
  check_handler_names(component.root, [], p)
  check_accessibility(component.root, p)
  let env : Map[String, String] = Map([])
  for prop in component.props {
    if ["event", "JSON"].contains(prop.name) {
      p.fail(
        "E_EVENT_BINDING", "event and JSON are reserved boundary names", "Choose another prop name.",
      )
    }
    if prop.ty != "RenderFragment" && !valid_value_type(prop.ty, schemas) {
      p.fail(
        "E_TYPE", "Unknown serializable prop type", "Declare a closed schema or primitive array.",
      )
    }
    env.set(prop.name, prop.ty)
  }
  for state in component.states {
    if ["event", "JSON"].contains(state.name) || env.contains(state.name) {
      p.fail(
        "E_DUPLICATE",
        "Duplicate binding '" + state.name + "'",
        "Props, states and derives must have unique names.",
      )
    }
    if state.initial.has_remote() {
      p.fail(
        "E_ASYNC_BOUNDARY", "State initialization cannot call remote actions", "Use serializable SSR initial props; await remote inside an explicit async event.",
      )
    }
    let ty = if state.ty == "" {
      state.initial.ty(env, schemas, actions, p)
    } else {
      state.ty
    }
    if !valid_value_type(ty, schemas) ||
      !accepts(state.initial, ty, env, schemas, actions, p) {
      p.fail(
        "E_STATE_TYPE", "State initializer type mismatch", "Use the declared closed value type.",
      )
    }
    if ty == "RenderFragment" {
      p.fail(
        "E_COMPONENT_CHILDREN", "Render fragments cannot be stored in state", "Project children directly; render fragments never enter snapshots.",
      )
    }
    if state.ty != "" && state.ty != ty {
      p.fail(
        "E_STATE_TYPE", "State initializer type does not match annotation", "Use a matching number, string or boolean initializer.",
      )
    }
    env.set(state.name, ty)
  }
  let declared : Map[String, Bool] = Map([])
  for derived_item in component.derives {
    if ["event", "JSON"].contains(derived_item.name) ||
      env.contains(derived_item.name) ||
      declared.contains(derived_item.name) {
      p.fail(
        "E_DUPLICATE",
        "Duplicate binding '" + derived_item.name + "'",
        "Use a unique binding name.",
      )
    }
    declared.set(derived_item.name, true)
  }
  let ordered = order_derives(component)
  for derived in ordered {
    if derived.value.has_remote() {
      p.fail(
        "E_DERIVE_EFFECT", "Derived values must be pure and synchronous", "Move remote and asynchronous operations to an explicit event entry.",
      )
    }
    let ty = derived.value.ty(env, schemas, actions, p)
    if ty == "RenderFragment" {
      p.fail(
        "E_COMPONENT_CHILDREN", "Render fragments cannot be aliased or computed",
        "Project children directly once in the template.",
      )
    }
    if derived.ty != "" && derived.ty != ty {
      p.fail(
        "E_DERIVE_TYPE", "Derived expression does not match its type annotation",
        "Use a matching primitive annotation.",
      )
    }
    env.set(derived.name, ty)
  }
  if component.props.any(f => f.ty == "RenderFragment") {
    fn uses(node : Node) -> Int32 {
      match node {
        Expression(Name("children", _)) => 1
        Select(_, _, _)
        | Each(_, _, _, _, _, _, _)
        | Boundary(_, _, _, _)
        | Element(_, _, _, _, _)
        | Invocation(_, _, _, _) =>
          node.nested().fold(init=0, (n, c) => n + uses(c))
        _ => 0
      }
    }
    if uses(component.root) != 1 {
      p.fail(
        "E_COMPONENT_CHILDREN", "Render fragments must be projected exactly once",
        "Place {children} once in the component's template.",
      )
    }
  }
  check_node(component.root, component, env, schemas, actions, components, p)
  {
    ..component,
    states: component.states.map(s => { ..s, ty: env.get(s.name).unwrap(), }),
    derives: ordered,
  }
}

///|
fn check_component_graph(
  components : Array[Component],
) -> Unit raise CompileError {
  fn source(node : Node) -> DependencySource {
    match node {
      Element(tag, _, _, _, start) | Invocation(tag, _, _, start) =>
        { file: "", start, end: start + tag.length() + 1, }
      _ => { file: "", start: 0, end: 0, }
    }
  }
  fn calls(node : Node) -> Array[DependencyEdge] {
    match node {
      Invocation(name, _, children, _) => {
        let out = [{ id: name, source: source(node), }]
        for child in children {
          out.append(calls(child))
        }
        out
      }
      Select(_, _, _)
      | Each(_, _, _, _, _, _, _)
      | Boundary(_, _, _, _)
      | Element(_, _, _, _, _) => {
        let out : Array[DependencyEdge] = []
        for child in node.nested() {
          out.append(calls(child))
        }
        out
      }
      _ => []
    }
  }
  let nodes = components.map(c => {
    id: c.name,
    source: source(c.root),
    dependencies: calls(c.root),
  })
  let _ = order_dependencies(nodes) catch {
    Invalid(diagnostic) =>
      raise Invalid({
        ..diagnostic,
        code: if diagnostic.code == "E_DEPENDENCY_CYCLE" {
          "E_COMPONENT_CYCLE"
        } else {
          diagnostic.code
        },
      })
  }
}
