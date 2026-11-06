///|
fn ident_start(c : Int32) -> Bool {
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 95
}

///|
fn ident_part(c : Int32) -> Bool {
  ident_start(c) || (c >= 48 && c <= 57)
}

///|
fn Parser::char(self : Parser) -> Int32 {
  if self.pos < self.source.length() {
    self.source[self.pos].to_int()
  } else {
    -1
  }
}

///|
fn Parser::part(self : Parser, start : Int32, end : Int32) -> String {
  self.source[start:end].to_owned()
}

///|
fn Parser::starts(self : Parser, value : String) -> Bool {
  self.source[self.pos:].to_owned().has_prefix(value)
}

///|
fn[T] Parser::fail(
  self : Parser,
  code : String,
  message : String,
  hint : String,
) -> T raise CompileError {
  raise Invalid({
    code,
    message,
    start: self.pos,
    end: if self.pos < self.source.length() {
      self.pos + 1
    } else {
      self.pos
    },
    hint,
    file: "",
    cycle: [],
    related: [],
  })
}

///|
fn[T] Parser::fail_at(
  _self : Parser,
  code : String,
  message : String,
  hint : String,
  start : Int32,
  length : Int32,
) -> T raise CompileError {
  raise Invalid({
    code,
    message,
    start,
    end: start + length,
    hint,
    file: "",
    cycle: [],
    related: [],
  })
}

///|
fn Parser::space(self : Parser) -> Unit {
  while self.pos < self.source.length() {
    let c = self.char()
    if c == 32 || c == 9 || c == 10 || c == 13 {
      self.pos += 1
    } else if self.starts("//") {
      while self.char() != -1 && self.char() != 10 {
        self.pos += 1
      }
    } else if self.starts("/*") {
      self.pos += 2
      while self.char() != -1 && !self.starts("*/") {
        self.pos += 1
      }
      if self.starts("*/") {
        self.pos += 2
      }
    } else {
      break
    }
  }
}

///|
fn Parser::eat(self : Parser, value : String) -> Bool {
  self.space()
  if self.starts(value) {
    self.pos += value.length()
    true
  } else {
    false
  }
}

///|
fn Parser::word(self : Parser, value : String) -> Bool {
  self.space()
  let end = self.pos + value.length()
  if self.starts(value) &&
    (end >= self.source.length() || !ident_part(self.source[end].to_int())) {
    self.pos = end
    true
  } else {
    false
  }
}

///|
fn Parser::need(self : Parser, value : String) -> Unit raise CompileError {
  if !self.eat(value) {
    self.fail(
      "E_SYNTAX",
      "Expected '" + value + "'",
      "Use the syntax in docs/prototype-guide.md; this prototype rejects unsupported constructs.",
    )
  }
}

///|
fn Parser::need_word(self : Parser, value : String) -> Unit raise CompileError {
  if !self.word(value) {
    self.fail(
      "E_SYNTAX",
      "Expected keyword '" + value + "'",
      "Use an explicit server/client declaration.",
    )
  }
}

///|
fn Parser::ident(self : Parser) -> String raise CompileError {
  self.space()
  let start = self.pos
  if !ident_start(self.char()) {
    self.fail(
      "E_IDENTIFIER", "Expected an identifier", "Identifiers use ASCII letters, digits and underscore in this prototype.",
    )
  }
  self.pos += 1
  while ident_part(self.char()) {
    self.pos += 1
  }
  let name = self.part(start, self.pos)
  if ["__proto__", "prototype", "constructor"].contains(name) {
    self.fail_at(
      "E_IDENTIFIER",
      "Reserved object key cannot be an identifier",
      "Choose a name that is safe in generated records.",
      start,
      name.length(),
    )
  }
  name
}

///|
fn Parser::qualified(self : Parser) -> String raise CompileError {
  let mut result = self.ident()
  while self.eat(".") {
    result += "." + self.ident()
  }
  result
}

///|
fn Parser::html_name(self : Parser) -> String raise CompileError {
  let mut result = self.ident()
  while self.eat("-") {
    result += "-" + self.ident()
  }
  result
}

///|
fn Parser::read_string(self : Parser) -> String raise CompileError {
  self.space()
  let quote = self.char()
  if quote != 34 && quote != 39 {
    self.fail(
      "E_STRING", "Expected a quoted string", "Use a single or double quoted literal.",
    )
  }
  self.pos += 1
  let builder = StringBuilder()
  while self.char() != quote {
    if self.char() == -1 {
      self.fail("E_STRING", "Unterminated string", "Close the string literal.")
    }
    if self.char() == 92 {
      self.pos += 1
      let c = self.char()
      if c == 110 {
        builder.write_string("\n")
      } else if c == 114 {
        builder.write_string("\r")
      } else if c == 116 {
        builder.write_string("\t")
      } else if c == 34 || c == 39 || c == 92 {
        builder.write_string(self.part(self.pos, self.pos + 1))
      } else {
        self.fail(
          "E_ESCAPE", "Unsupported string escape", "Use literal Unicode or a simple quote, backslash, n, r or t escape.",
        )
      }
      self.pos += 1
    } else {
      builder.write_string(self.part(self.pos, self.pos + 1))
      self.pos += 1
    }
  }
  self.pos += 1
  builder.to_string()
}

///|
fn Parser::atom(self : Parser) -> Expr raise CompileError {
  self.space()
  let base = if self.eat("(") {
    let value = self.expr()
    self.need(")")
    value
  } else if self.eat("!") {
    Not(self.atom())
  } else if self.eat("[") {
    let values = []
    while !self.eat("]") {
      values.push(self.expr())
      if !self.eat(",") {
        self.need("]")
        break
      }
    }
    ArrayValue(values)
  } else if self.eat("{") {
    let values = []
    while !self.eat("}") {
      let key = self.ident()
      self.need(":")
      values.push((key, self.expr()))
      if !self.eat(",") {
        self.need("}")
        break
      }
    }
    RecordValue(values)
  } else if self.eat("-") {
    Binary("-", Literal(Json::number(0), "number"), self.atom())
  } else if self.char() == 34 || self.char() == 39 {
    Literal(string_json(self.read_string()), "string")
  } else if self.char() >= 48 && self.char() <= 57 {
    let start = self.pos
    while (self.char() >= 48 && self.char() <= 57) || self.char() == 46 {
      self.pos += 1
    }
    let value = @json.parse(self.part(start, self.pos)) catch {
      _ =>
        self.fail(
          "E_NUMBER", "Invalid number literal", "Use a finite decimal number.",
        )
    }
    Literal(value, "number")
  } else if self.word("true") {
    Literal(Json::boolean(true), "boolean")
  } else if self.word("false") {
    Literal(Json::boolean(false), "boolean")
  } else if self.word("await") {
    self.need_word("remote")
    let name = self.ident()
    self.need("(")
    self.need("{")
    let fields : Array[(String, Expr)] = []
    while !self.eat("}") {
      let key = self.ident()
      let value = if self.eat(":") {
        self.expr()
      } else {
        Name(key, self.pos - key.length())
      }
      fields.push((key, value))
      if !self.eat(",") {
        self.need("}")
        break
      }
    }
    self.need(")")
    Remote(name, fields)
  } else {
    let start = self.pos
    Name(self.ident(), start)
  }
  let mut value = base
  while true {
    if self.eat(".") {
      let operation = self.ident()
      if value is Name("JSON", _) && operation == "parse" {
        self.need("<")
        let ty = self.type_name()
        self.need(">")
        self.need("(")
        let input = self.expr()
        self.need(")")
        value = JsonDecode(ty, input)
      } else if value is Name("JSON", _) && operation == "stringify" {
        self.need("(")
        let input = self.expr()
        self.need(")")
        value = JsonEncode(input)
      } else if self.eat("(") {
        if ["map", "filter", "some", "every"].contains(operation) {
          let parameter = self.ident()
          self.need("=>")
          let body = self.expr()
          self.need(")")
          value = Collection(value, operation, parameter, body)
        } else {
          let args = []
          while !self.eat(")") {
            args.push(self.expr())
            if !self.eat(",") {
              self.need(")")
              break
            }
          }
          value = Method(value, operation, args)
        }
      } else {
        value = Property(value, operation)
      }
    } else if self.eat("[") {
      let index = self.expr()
      self.need("]")
      value = Index(value, index)
    } else {
      break
    }
  }
  value
}

///|
fn Parser::multiply(self : Parser) -> Expr raise CompileError {
  let mut value = self.atom()
  while true {
    if self.eat("*") {
      value = Binary("*", value, self.atom())
    } else if self.eat("/") {
      value = Binary("/", value, self.atom())
    } else {
      break
    }
  }
  value
}

///|
fn Parser::additive(self : Parser) -> Expr raise CompileError {
  let mut value = self.multiply()
  while true {
    if self.eat("+") {
      value = Binary("+", value, self.multiply())
    } else if self.eat("-") {
      value = Binary("-", value, self.multiply())
    } else {
      break
    }
  }
  value
}

///|
fn Parser::compare(self : Parser) -> Expr raise CompileError {
  let mut value = self.additive()
  for op in ["===", "!==", "<=", ">=", "<", ">"] {
    if self.eat(op) {
      value = Binary(op, value, self.additive())
      break
    }
  }
  value
}

///|
fn Parser::conjunction(self : Parser) -> Expr raise CompileError {
  let mut value = self.compare()
  while self.eat("&&") {
    value = Binary("&&", value, self.compare())
  }
  value
}

///|
fn Parser::expr(self : Parser) -> Expr raise CompileError {
  let mut value = self.conjunction()
  while self.eat("||") {
    value = Binary("||", value, self.conjunction())
  }
  if self.eat("?") {
    let yes = self.expr()
    self.need(":")
    value = Conditional(value, yes, self.expr())
  }
  value
}

///|
fn Parser::type_name(self : Parser) -> String raise CompileError {
  let readonly_type = self.word("readonly")
  let mut ty = self.ident()
  while self.eat("[") {
    self.need("]")
    ty += "[]"
  }
  if readonly_type && !ty.has_suffix("[]") {
    self.fail(
      "E_TYPE", "readonly requires an array type", "Use readonly T[] for immutable array values.",
    )
  }
  ty
}

///|
fn Parser::primitive_field(
  self : Parser,
  constraints~ : Bool = false,
  render_fragment~ : Bool = false,
) -> Field raise CompileError {
  let name = self.ident()
  let optional = self.eat("?")
  if optional {
    self.fail(
      "E_OPTIONAL_FIELD", "Optional fields are outside this prototype", "Use required primitive fields and pass explicit initial props.",
    )
  }
  self.need(":")
  let ty = self.type_name()
  if !render_fragment &&
    !(render_fragment && name == "children" && ty == "RenderFragment") &&
    ty != "number" &&
    ty != "string" &&
    ty != "boolean" {
    self.fail(
      "E_TYPE",
      "Unsupported field type '" + ty + "'",
      "Only number, string and boolean fields are implemented.",
    )
  }
  let rules = if constraints { self.constraints(ty) } else { [] }
  { name, ty, optional, constraints: rules, }
}

///|
fn Parser::fields(
  self : Parser,
  constraints~ : Bool = false,
  render_fragment~ : Bool = false,
) -> Array[Field] raise CompileError {
  self.need("{")
  let fields : Array[Field] = []
  while !self.eat("}") {
    let field = self.primitive_field(constraints~, render_fragment~)
    if fields.any(f => f.name == field.name) {
      self.fail(
        "E_DUPLICATE",
        "Duplicate field '" + field.name + "'",
        "Give every field a unique name.",
      )
    }
    fields.push(field)
    if !self.eat(";") && !self.eat(",") {
      self.need("}")
      break
    }
  }
  check_constraints(fields, self)
  fields
}

///|
fn Parser::props(self : Parser) -> Array[Field] raise CompileError {
  self.need("(")
  if self.eat(")") {
    return []
  }
  if !self.starts("{") {
    let fields : Array[Field] = []
    while !self.eat(")") {
      let field = self.primitive_field(render_fragment=true)
      if fields.any(f => f.name == field.name) {
        self.fail(
          "E_PROPS",
          "Duplicate prop '" + field.name + "'",
          "Declare each named prop exactly once.",
        )
      }
      if self.eat("=") {
        self.fail(
          "E_PROPS_DEFAULT", "Default props are outside this prototype", "Declare required props and pass their initial values explicitly.",
        )
      }
      fields.push(field)
      if !self.eat(",") {
        self.need(")")
        break
      }
    }
    return fields
  }
  self.need("{")
  let bindings : Array[String] = []
  while !self.eat("}") {
    let binding = self.ident()
    if bindings.contains(binding) {
      self.fail(
        "E_PROPS", "Duplicate destructured prop", "Bind each declared prop exactly once.",
      )
    }
    bindings.push(binding)
    if !self.eat(",") {
      self.need("}")
      break
    }
  }
  self.need(":")
  let fields = self.fields(render_fragment=true)
  self.need(")")
  if bindings.length() != fields.length() ||
    bindings.any(name => !fields.any(f => f.name == name)) {
    self.fail(
      "E_PROPS", "Props bindings and type fields must match", "Declare each destructured prop in its inline primitive type.",
    )
  }
  fields
}

///|
fn Parser::handler(
  self : Parser,
  side : String,
  start : Int32,
) -> Handler raise CompileError {
  if side == "server" {
    self.fail(
      "E_SERVER_EVENT", "Server components cannot own browser events", "Move state and on blocks into an explicit client component.",
    )
  } else if side == "universal" {
    self.fail(
      "E_COMPONENT_EVENT", "Universal components cannot own browser events", "Declare an explicit client component to use on blocks.",
    )
  }
  let event = self.ident()
  if ![
      "click", "input", "change", "submit", "invalid", "keydown", "dblclick", "focusout",
    ].contains(event) {
    self.fail(
      "E_EVENT",
      "Unsupported event '" + event + "'",
      "Use click, input, change, submit, invalid, keydown, dblclick or focusout on a supported DOM target.",
    )
  }
  let is_async = self.word("async")
  self.space()
  let name = if self.starts("{") { "" } else { self.ident() }
  let mut reserved = name.length() > 1 && name.has_prefix("h")
  for i = 1; i < name.length(); i = i + 1 {
    let c = name[i].to_int()
    if c < 48 || c > 57 {
      reserved = false
    }
  }
  if reserved {
    self.fail_at(
      "E_CHUNK_NAME",
      "Chunk names h0, h1, ... are reserved for anonymous blocks",
      "Use a descriptive event name, such as increment or save.",
      start,
      self.pos - start,
    )
  }
  self.need("{")
  let statements : Array[Statement] = []
  while !self.eat("}") {
    let target = self.ident()
    let op = if self.eat("+=") {
      "+="
    } else if self.eat("-=") {
      "-="
    } else {
      self.need("=")
      "="
    }
    let value = self.expr()
    self.need(";")
    statements.push({ target, op, value, })
  }
  let id = if name == "" { "h" + self.handler_id.to_string() } else { name }
  self.handler_id += 1
  { id, event, is_async, start, end: self.pos, statements, }
}

///|
fn Parser::element(self : Parser, side : String) -> Node raise CompileError {
  self.space()
  let start = self.pos
  self.need("<")
  let tag = self.html_name()
  let invocation = tag[0].to_int() >= 65 && tag[0].to_int() <= 90
  if !invocation &&
    ![
      "a", "article", "aside", "b", "br", "button", "code", "details", "div", "em",
      "footer", "form", "h1", "h2", "h3", "header", "input", "label", "li", "main",
      "nav", "ol", "option", "output", "p", "pre", "section", "select", "small",
      "span", "strong", "summary", "textarea", "ul",
    ].contains(tag) {
    self.fail(
      "E_TAG",
      "Unsupported tag '" + tag + "'",
      "Use ordinary DOM elements; raw HTML and executable elements are outside this prototype.",
    )
  }
  let attributes : Array[Attribute] = []
  while !self.eat(">") {
    if self.eat("/>") {
      return if invocation {
        Invocation(tag, attributes, [], start)
      } else {
        Element(tag, attributes, [], [], start)
      }
    }
    let name = self.html_name()
    if name.has_prefix("data-isle-") {
      self.fail(
        "E_ATTRIBUTE", "data-isle-* is reserved for the resume protocol", "Choose an application data-* attribute without the isle prefix.",
      )
    }
    if !invocation && !supported_attribute(name) {
      self.fail(
        "E_ATTRIBUTE",
        "Unsupported attribute '" + name + "'",
        "Use on event blocks; supported attributes are class, id, title, value, type, name, disabled, role, data-* and aria-*.",
      )
    }
    let value = if self.eat("=") {
      if self.eat("{") {
        let value = self.expr()
        self.need("}")
        value
      } else {
        Literal(string_json(self.read_string()), "string")
      }
    } else {
      Literal(Json::boolean(true), "boolean")
    }
    attributes.push({ name, value, })
  }
  let children : Array[Node] = []
  let handlers : Array[Handler] = []
  while true {
    let before_space = self.pos
    self.space()
    if self.starts("</") {
      self.pos += 2
      let closing = self.html_name()
      if closing != tag {
        self.fail(
          "E_TAG_CLOSE",
          "Closing tag does not match '" + tag + "'",
          "Close the currently open element.",
        )
      }
      self.need(">")
      break
    }
    let handler_start = self.pos
    if self.word("on") {
      if invocation {
        self.fail(
          "E_COMPONENT_EVENT", "Events belong to DOM elements, not component calls",
          "Declare on blocks inside a client component's DOM template.",
        )
      }
      let handler = self.handler(side, handler_start)
      if handlers.any(h => h.event == handler.event) {
        self.fail_at(
          "E_EVENT_DUPLICATE",
          "An element cannot attach the same event twice",
          "Combine the statements in one named on block.",
          handler.start,
          handler.end - handler.start,
        )
      }
      handlers.push(handler)
      continue
    }
    self.pos = before_space
    if self.starts("<") {
      children.push(self.element(side))
    } else if self.char() == 64 {
      children.push(self.control(side))
    } else if self.char() == 123 {
      self.pos += 1
      let value = self.expr()
      self.need("}")
      children.push(Expression(value))
    } else {
      let start = self.pos
      while self.char() != -1 &&
            self.char() != 60 &&
            self.char() != 123 &&
            self.char() != 64 {
        self.pos += 1
      }
      if self.char() == -1 {
        self.fail(
          "E_TEMPLATE",
          "Unterminated element '" + tag + "'",
          "Add the matching closing tag.",
        )
      }
      let value = self.part(start, self.pos)
      if !value.is_blank() {
        children.push(Text(value))
      }
    }
  }
  if invocation {
    Invocation(tag, attributes, children, start)
  } else {
    Element(tag, attributes, children, handlers, start)
  }
}

///|
fn Parser::template_block(
  self : Parser,
  side : String,
) -> Array[Node] raise CompileError {
  self.need("{")
  let children = []
  while !self.eat("}") {
    if self.char() == -1 {
      self.fail(
        "E_PARSE", "Unterminated control block", "Close the template block.",
      )
    }
    if self.starts("<") {
      children.push(self.element(side))
    } else if self.eat("{") {
      let value = self.expr()
      self.need("}")
      children.push(Expression(value))
    } else if self.starts("@") {
      children.push(self.control(side))
    } else {
      let start = self.pos
      while self.char() != -1 && ![60, 123, 125, 64].contains(self.char()) {
        self.pos += 1
      }
      let value = self.part(start, self.pos)
      if !value.is_blank() {
        children.push(Text(value))
      }
    }
  }
  children
}

///|
fn Parser::control(self : Parser, side : String) -> Node raise CompileError {
  self.space()
  let start = self.pos
  self.need("@")
  if self.word("if") {
    self.need("(")
    let condition = self.expr()
    self.need(")")
    let cases = [(condition, self.template_block(side))]
    let mut fallback = []
    while self.eat("@else") {
      if self.word("if") {
        self.need("(")
        let condition = self.expr()
        self.need(")")
        cases.push((condition, self.template_block(side)))
      } else {
        fallback = self.template_block(side)
        break
      }
    }
    Select(cases, fallback, start)
  } else if self.word("switch") {
    self.need("(")
    let value = self.expr()
    self.need(")")
    self.need("{")
    let cases = []
    let labels = []
    let mut fallback = []
    let mut default_seen = false
    while !self.eat("}") {
      if self.eat("@case") {
        let label = self.atom()
        let signature = label.json().stringify()
        if !(label is Literal(_, _)) || labels.contains(signature) {
          self.fail(
            "E_CONTROL_CASE", "Cases require distinct literal labels", "Use unique string, number or boolean literals.",
          )
        }
        labels.push(signature)
        self.need(":")
        cases.push((Binary("===", value, label), self.template_block(side)))
      } else {
        self.need("@default")
        self.need(":")
        if default_seen {
          self.fail(
            "E_CONTROL_CASE", "Duplicate default", "Use one default arm.",
          )
        }
        default_seen = true
        fallback = self.template_block(side)
      }
    }
    Select(cases, fallback, start)
  } else if self.word("for") {
    self.need("(")
    self.need_word("const")
    let item = self.ident()
    self.need_word("of")
    let source = self.expr()
    self.need(";")
    let index = if self.word("index") {
      let name = self.ident()
      self.need(";")
      name
    } else {
      ""
    }
    self.need_word("key")
    let key = self.expr()
    self.need(")")
    let body = self.template_block(side)
    let empty = if self.eat("@empty") { self.template_block(side) } else { [] }
    Each(item, index, source, key, body, empty, start)
  } else if self.word("try") {
    let body = self.template_block(side)
    if self.eat("@pending") {
      self.fail(
        "E_RESOURCE_PENDING", "Pending requires an explicit resource contract", "This version supports synchronous render boundaries with @catch.",
      )
    }
    self.need("@catch")
    self.need("(")
    let error = self.ident()
    self.need(")")
    Boundary(body, error, self.template_block(side), start)
  } else {
    self.fail(
      "E_CONTROL", "Unknown template control", "Use @if, @for, @switch or @try.",
    )
  }
}

///|
fn Parser::component(
  self : Parser,
  side : String,
) -> Component raise CompileError {
  let name = self.ident()
  let props = self.props()
  self.need("{")
  let states : Array[StateDecl] = []
  let derives : Array[Derived] = []
  while true {
    if self.word("state") {
      if side == "server" {
        self.fail(
          "E_SERVER_STATE", "Server components cannot own resumable state", "Use a client component for mutable state; pass approved initial props from the server.",
        )
      } else if side == "universal" {
        self.fail(
          "E_COMPONENT_STATE", "Universal components cannot own mutable state", "Declare an explicit client component to use state.",
        )
      }
      let name = self.ident()
      let ty = if self.eat(":") { self.type_name() } else { "" }
      self.need("=")
      let initial = self.expr()
      self.need(";")
      states.push({ name, ty, initial, })
    } else if self.word("derive") {
      self.space()
      let start = self.pos
      let name = self.ident()
      let ty = if self.eat(":") { self.type_name() } else { "" }
      self.need("=")
      let value = self.expr()
      self.need(";")
      derives.push({ name, start, end: start + name.length(), ty, value, })
    } else {
      break
    }
  }
  let root = self.element(side)
  self.need("}")
  { name, side, props, states, derives, root, }
}

///|
fn Parser::action(self : Parser) -> Action raise CompileError {
  let name = self.ident()
  self.need("(")
  let input_name = self.ident()
  self.need(":")
  let input_schema = self.ident()
  self.need(")")
  self.need(":")
  let output_schema = self.ident()
  self.need_word("using")
  let request_name = self.ident()
  self.need(":")
  self.need_word("RequestContext")
  if !self.word("authorize") {
    self.fail(
      "E_ACTION_POLICY", "Server actions require an explicit authorization policy",
      "Add authorize grant = policy.name(request, input.id) before effects and the body.",
    )
  }
  let grant_name = self.ident()
  self.need("=")
  let policy_name = self.qualified()
  self.need("(")
  let request_arg = self.ident()
  self.need(",")
  let target_input = self.ident()
  self.need(".")
  let target_field = self.ident()
  self.need(")")
  if request_arg != request_name ||
    target_input != input_name ||
    !policy_name.has_prefix("policy.") {
    self.fail(
      "E_ACTION_POLICY", "Policy must use the server request and an input resource field",
      "Use policy.name(request, input.id); request is injected by the server.",
    )
  }
  let validation = if self.word("validate") {
    let validator = self.qualified()
    self.need_word("effects")
    self.need("{")
    let effect = self.qualified()
    if effect != "db.read" {
      self.fail(
        "E_VALIDATION_EFFECT", "Action validation may only declare db.read", "Use validate adapter.name effects { db.read }; mutations belong to the action operation.",
      )
    }
    self.need("}")
    validator
  } else {
    ""
  }
  self.need_word("effects")
  self.need("{")
  let effects : Array[String] = []
  while !self.eat("}") {
    let effect = self.qualified()
    if effect != "db.write" {
      self.fail(
        "E_EFFECT",
        "Unsupported action effect '" + effect + "'",
        "Only an explicit db.write action adapter is implemented.",
      )
    }
    effects.push(effect)
    if !self.eat(",") {
      self.need("}")
      break
    }
  }
  if effects.length() != 1 {
    self.fail(
      "E_EFFECT", "Actions must declare db.write exactly once", "Use effects { db.write }.",
    )
  }
  self.need("{")
  self.need_word("return")
  self.need_word("await")
  let call_name = self.qualified()
  self.need("(")
  let args : Array[CallArg] = []
  while !self.eat(")") {
    let arg = self.ident()
    if arg == grant_name {
      args.push(Grant)
    } else if arg == input_name {
      self.need(".")
      args.push(Input(self.ident()))
    } else {
      self.fail(
        "E_ACTION_CAPTURE", "Action adapters may receive only the grant and declared input fields",
        "RequestContext and server closures cannot be transported or captured.",
      )
    }
    if !self.eat(",") {
      self.need(")")
      break
    }
  }
  self.need(";")
  self.need("}")
  if args.is_empty() {
    self.fail(
      "E_ACTION_GRANT", "Mutation adapters require a grant", "Pass grant as the first argument.",
    )
  }
  match args[0] {
    Grant => ()
    _ =>
      self.fail(
        "E_ACTION_GRANT", "The mutation adapter must receive the authorization grant first",
        "Call adapter(grant, input.field); grant is a server-only Permit.",
      )
  }
  {
    name,
    input_schema,
    output_schema,
    input_name,
    request_name,
    grant_name,
    policy_name,
    target_field,
    validation,
    effects,
    call_name,
    args,
  }
}

///|
fn Parser::program(self : Parser) -> Json raise CompileError {
  let components : Array[Component] = []
  let schemas : Array[Schema] = []
  let actions : Array[Action] = []
  let names : Array[String] = []
  while true {
    self.space()
    if self.char() == -1 {
      break
    }
    let exported = self.word("export")
    if self.word("schema") || self.word("view") {
      // Recover the consumed keyword from its immediately preceding source.
      let prefix = self.part(0, self.pos)
      let kind = if prefix.has_suffix("schema") { "schema" } else { "view" }
      let name = self.ident()
      let fields = self.fields(constraints=true)
      if self.word("async") || self.word("validate") {
        self.fail(
          "E_SCHEMA_VALIDATION", "Schemas describe values, not request-dependent validation",
          "Move validate adapter.name effects { db.read } after authorize in each server action.",
        )
      }
      schemas.push({ name, kind, fields, })
      let _ = self.eat(";")
    } else if self.word("component") {
      components.push(self.component("universal"))
    } else {
      let side = if self.word("client") {
        "client"
      } else if self.word("server") {
        "server"
      } else {
        self.fail(
          "E_UNSUPPORTED", "Expected component, client/server component, schema, view or server action",
          "Arbitrary TypeScript, imports, helper functions and casts are outside the prototype subset.",
        )
      }
      if self.word("component") {
        components.push(self.component(side))
      } else if side == "server" && self.word("action") {
        actions.push(self.action())
      } else {
        self.fail(
          "E_DECLARATION",
          "Unsupported declaration after '" + side + "'",
          "Use client component, server component or server action. Internal async helpers and queries are not implemented.",
        )
      }
    }
    let _ = exported
  }
  for schema in schemas {
    if names.contains(schema.name) {
      self.fail(
        "E_DUPLICATE",
        "Duplicate declaration '" + schema.name + "'",
        "Use unique top-level names.",
      )
    }
    names.push(schema.name)
  }
  for action in actions {
    if names.contains(action.name) {
      self.fail(
        "E_DUPLICATE",
        "Duplicate declaration '" + action.name + "'",
        "Use unique top-level names.",
      )
    }
    names.push(action.name)
    match
      find(schemas, s => s.name == action.input_schema && s.kind == "schema") {
      None =>
        self.fail(
          "E_ACTION_SCHEMA",
          "Unknown action input schema '" + action.input_schema + "'",
          "Declare schema with primitive input fields.",
        )
      Some(schema) => {
        if !schema.fields.any(f => f.name == action.target_field) {
          self.fail(
            "E_ACTION_TARGET", "Policy target is not an input field", "Authorize against a field declared in the input schema.",
          )
        }
        for arg in action.args {
          match arg {
            Grant => ()
            Input(name) =>
              if !schema.fields.any(f => f.name == name) {
                self.fail(
                  "E_ACTION_INPUT", "Adapter uses an undeclared input field", "Only declared input schema fields may cross the boundary.",
                )
              }
          }
        }
      }
    }
    if !schemas.any(s => s.name == action.output_schema && s.kind == "view") {
      self.fail(
        "E_ACTION_SCHEMA",
        "Unknown action output view '" + action.output_schema + "'",
        "Declare an explicit view for client-visible output.",
      )
    }
  }
  let checked : Array[Component] = []
  for component in components {
    if names.contains(component.name) {
      self.fail(
        "E_DUPLICATE",
        "Duplicate declaration '" + component.name + "'",
        "Use unique top-level names.",
      )
    }
    names.push(component.name)
    checked.push(check_component(component, schemas, actions, components, self))
  }
  check_component_graph(checked)
  obj([
    ("version", Json::number(1)),
    ("components", json_array(checked, c => c.json())),
    ("schemas", json_array(schemas, s => s.json())),
    ("actions", json_array(actions, a => a.json())),
  ])
}
