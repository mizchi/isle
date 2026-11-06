///|
fn Parser::constraints(
  self : Parser,
  ty : String,
) -> Array[Constraint] raise CompileError {
  let rules : Array[Constraint] = []
  while true {
    self.space()
    if !ident_start(self.char()) {
      break
    }
    let start = self.pos
    let kind = self.ident()
    if ![
        "minLength", "maxLength", "min", "max", "integer", "equals", "sameAs", "pattern",
        "format",
      ].contains(kind) ||
      rules.any(r => r.kind == kind) {
      self.fail_at(
        "E_SCHEMA_RULE",
        "Unknown or duplicate schema constraint: " + kind,
        "Use a supported constraint once per field.",
        start,
        self.pos - start,
      )
    }
    self.need("(")
    let field = if kind == "sameAs" { self.ident() } else { "" }
    let value = if kind == "integer" || kind == "sameAs" {
      Json::null()
    } else {
      match self.atom() {
        Literal(value, _) => value
        Binary("-", Literal(Number(zero, ..), _), Literal(Number(n, ..), _)) if zero ==
          0.0 => {
          if kind == "equals" && n == 0.0 {
            self.fail(
              "E_SCHEMA_RULE", "Negative zero is not a wire value", "Use equals(0); primitive number values exclude negative zero.",
            )
          }
          Json::number(-n)
        }
        _ =>
          self.fail(
            "E_SCHEMA_RULE", "Constraints require literals", "Use a number, string or boolean literal; sameAs takes a field name.",
          )
      }
    }
    self.need(")")
    let valid = match kind {
      "minLength" | "maxLength" =>
        ty == "string" && value is Number(n, ..) && n >= 0.0 && n == n.trunc()
      "min" | "max" => ty == "number" && value is Number(_, ..)
      "integer" => ty == "number"
      "pattern" => ty == "string" && value is String(_)
      "format" => ty == "string" && value == Json::string("email")
      "equals" =>
        match value {
          String(_) => ty == "string"
          Number(_, ..) => ty == "number"
          True | False => ty == "boolean"
          _ => false
        }
      "sameAs" => true
      _ => false
    }
    if !valid {
      self.fail_at(
        "E_SCHEMA_RULE",
        "Constraint type or value is invalid",
        "Match the field type and use non-negative integer lengths.",
        start,
        self.pos - start,
      )
    }
    rules.push({ kind, value, field, start, end: self.pos, })
  }
  rules
}

///|
fn check_constraints(
  fields : Array[Field],
  p : Parser,
) -> Unit raise CompileError {
  for field in fields {
    for rule in field.constraints {
      if rule.kind == "sameAs" &&
        (
          rule.field == field.name ||
          !fields.any(f => f.name == rule.field && f.ty == field.ty)
        ) {
        p.fail_at(
          "E_SCHEMA_REFERENCE",
          "sameAs requires another field of the same type",
          "Reference a declared field with a matching type.",
          rule.start,
          rule.end - rule.start,
        )
      }
    }
    for (lower, upper) in [("minLength", "maxLength"), ("min", "max")] {
      let low = find(field.constraints, r => r.kind == lower)
      let high = find(field.constraints, r => r.kind == upper)
      if low is Some(a) &&
        high is Some(b) &&
        a.value is Number(x, ..) &&
        b.value is Number(y, ..) &&
        x > y {
        p.fail_at(
          "E_SCHEMA_RULE",
          "Schema minimum exceeds maximum",
          "Keep the minimum at or below the maximum.",
          b.start,
          b.end - b.start,
        )
      }
    }
  }
}

///|
fn Constraint::json(self : Constraint) -> Json {
  let fields = [
    ("kind", string_json(self.kind)),
    (
      "source",
      obj([
        ("start", Json::number(self.start.to_double())),
        ("end", Json::number(self.end.to_double())),
      ]),
    ),
  ]
  if self.kind == "sameAs" {
    fields.push(("field", string_json(self.field)))
  } else if self.kind != "integer" {
    fields.push(("value", self.value))
  }
  obj(fields)
}
