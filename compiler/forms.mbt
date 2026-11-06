///|
fn supported_attribute(name : String) -> Bool {
  [
    "class", "id", "title", "value", "type", "name", "disabled", "role", "for", "required",
    "schema", "submit", "tabindex", "hidden", "checked", "readonly", "multiple",
    "selected", "minlength", "maxlength", "min", "max", "step", "pattern", "autocomplete",
    "placeholder", "inputmode", "rows", "cols", "href", "autofocus",
  ].contains(name) ||
  name.has_prefix("data-") ||
  name.has_prefix("aria-")
}

///|
fn boolean_attribute(name : String) -> Bool {
  [
    "disabled", "required", "checked", "readonly", "multiple", "selected", "hidden",
    "autofocus",
  ].contains(name)
}

///|
fn literal_attribute(attributes : Array[Attribute], name : String) -> String? {
  match find(attributes, a => a.name == name) {
    Some({ value: Literal(String(value), "string"), .. }) => Some(value)
    _ => None
  }
}

///|
fn constraint_literal(attributes : Array[Attribute], name : String) -> String? {
  match find(attributes, a => a.name == name) {
    Some({ value: Literal(String(value), "string"), .. }) => Some(value)
    Some({ value: Literal(Number(value, ..), "number"), .. }) =>
      Some(value.to_string())
    _ => None
  }
}

///|
fn id_tokens(value : String) -> Array[String] {
  let out : Array[String] = []
  let mut start = 0
  for i = 0; i <= value.length(); i = i + 1 {
    let c = if i < value.length() { value[i].to_int() } else { 32 }
    if [9, 10, 12, 13, 32].contains(c) {
      if start < i {
        out.push(value[start:i].to_owned())
      }
      start = i + 1
    }
  }
  out
}

///|
fn event_environment(
  tag : String,
  attributes : Array[Attribute],
  handler : Handler,
  env : Map[String, String],
  p : Parser,
) -> Map[String, String] raise CompileError {
  let control = ["input", "textarea", "select"].contains(tag)
  if (handler.event == "submit" && tag != "form") ||
    (["input", "change", "invalid"].contains(handler.event) && !control) {
    // Existing input/change entries on generic DOM nodes remain valid without event values.
    if handler.event == "submit" || handler.event == "invalid" {
      p.fail_at(
        "E_EVENT_TARGET",
        "Event entry requires a matching form/control target",
        "Attach submit to form and invalid to input, textarea or select.",
        handler.start,
        handler.end - handler.start,
      )
    }
  }
  let result = env.copy()
  result.set("$event", handler.event)
  if handler.event == "keydown" {
    result.set("$event.key", "string")
  }
  if control &&
    ["input", "change", "invalid", "keydown", "focusout"].contains(
      handler.event,
    ) {
    result.set("$event.value", "string")
    result.set("$event.invalid", "boolean")
    result.set("$event.validationMessage", "string")
    if tag == "input" &&
      [Some("checkbox"), Some("radio")].contains(
        literal_attribute(attributes, "type"),
      ) {
      result.set("$event.checked", "boolean")
    }
  }
  result
}

///|
fn check_form_attributes(
  tag : String,
  attributes : Array[Attribute],
  env : Map[String, String],
  schemas : Array[Schema],
  actions : Array[Action],
  p : Parser,
  start : Int32,
) -> Unit raise CompileError {
  let names : Array[String] = []
  for attr in attributes {
    if names.contains(attr.name) {
      p.fail_at(
        "E_ATTRIBUTE_DUPLICATE",
        "Duplicate attribute: " + attr.name,
        "Declare each attribute once.",
        start,
        tag.length() + 1,
      )
    }
    names.push(attr.name)
    let control = ["input", "textarea", "select"].contains(tag)
    let wrong_target = match attr.name {
      "href" => tag != "a"
      "required" => !control
      "checked" =>
        tag != "input" ||
        ![Some("checkbox"), Some("radio")].contains(
          literal_attribute(attributes, "type"),
        )
      "selected" => tag != "option"
      "readonly" => !["input", "textarea"].contains(tag)
      "multiple" => !["input", "select"].contains(tag)
      "minlength" | "maxlength" => !["input", "textarea"].contains(tag)
      "min" | "max" | "step" | "pattern" => tag != "input"
      "rows" | "cols" => tag != "textarea"
      _ => false
    }
    if wrong_target {
      p.fail_at(
        "E_FORM_CONSTRAINT",
        "Constraint is not valid for this control",
        "Use a matching native HTML control and input type.",
        start,
        tag.length() + 1,
      )
    }
    if attr.name == "pattern" &&
      literal_attribute(attributes, "pattern") is None {
      p.fail_at(
        "E_FORM_CONSTRAINT",
        "Patterns must be static strings",
        "Declare the pattern as a string literal so the backend can check its syntax.",
        start,
        tag.length() + 1,
      )
    }
    if ["minlength", "maxlength", "rows", "cols"].contains(attr.name) &&
      constraint_literal(attributes, attr.name) is None {
      p.fail_at(
        "E_FORM_CONSTRAINT",
        "Length and size constraints require static literals",
        "Use a non-negative integer string or number literal.",
        start,
        tag.length() + 1,
      )
    }
    if boolean_attribute(attr.name) &&
      attr.value.ty(env, schemas, actions, p) != "boolean" {
      p.fail_at(
        "E_ATTRIBUTE_TYPE",
        "Boolean HTML attributes require boolean values",
        "Use required, required={true}, or required={false}; quoted false is still present in HTML.",
        start,
        tag.length() + 1,
      )
    }
  }
  let lower = constraint_literal(attributes, "minlength")
  let upper = constraint_literal(attributes, "maxlength")
  for name in ["minlength", "maxlength", "rows", "cols"] {
    if constraint_literal(attributes, name) is Some(value) {
      let number = @json.parse(value) catch { _ => Json::null() }
      match number {
        Number(n, ..) =>
          if n < 0.0 ||
            n != n.trunc() ||
            (["rows", "cols"].contains(name) && n == 0.0) {
            p.fail_at(
              "E_FORM_CONSTRAINT",
              "Length constraints require non-negative integers",
              "Use an integer HTML attribute value.",
              start,
              tag.length() + 1,
            )
          }
        _ =>
          p.fail_at(
            "E_FORM_CONSTRAINT",
            "Invalid integer constraint",
            "Use a non-negative integer.",
            start,
            tag.length() + 1,
          )
      }
    }
  }
  if lower is Some(a) && upper is Some(b) {
    let low = @json.parse(a) catch { _ => Json::null() }
    let high = @json.parse(b) catch { _ => Json::null() }
    if low is Number(x, ..) && high is Number(y, ..) && x > y {
      p.fail_at(
        "E_FORM_CONSTRAINT",
        "minlength exceeds maxlength",
        "Keep minimum length at or below maximum length.",
        start,
        tag.length() + 1,
      )
    }
  }
  if constraint_literal(attributes, "min") is Some(a) &&
    constraint_literal(attributes, "max") is Some(b) {
    let low = @json.parse(a) catch { _ => Json::null() }
    let high = @json.parse(b) catch { _ => Json::null() }
    if low is Number(x, ..) && high is Number(y, ..) && x > y {
      p.fail_at(
        "E_FORM_CONSTRAINT",
        "min exceeds max",
        "Keep minimum at or below maximum.",
        start,
        tag.length() + 1,
      )
    }
  }
}

///|
fn has_label_text(node : Node) -> Bool {
  match node {
    Text(value) => value.trim().length() > 0
    Expression(_) => true // Content can be request-dependent; runtime checks remain necessary.
    Element(tag, _, children, _, _) =>
      tag != "input" && children.any(has_label_text)
    Invocation(_, _, children, _) => children.any(has_label_text)
    Select(cases, fallback, _) =>
      !fallback.is_empty() &&
      fallback.any(has_label_text) &&
      cases.all(c => c.1.any(has_label_text))
    Each(_, _, _, _, children, empty, _) =>
      children.any(has_label_text) && empty.any(has_label_text)
    Boundary(children, _, fallback, _) =>
      children.any(has_label_text) && fallback.any(has_label_text)
  }
}

///|
fn labelable_count(node : Node) -> Int32 {
  match node {
    Element(tag, attrs, children, _, _) => {
      let own = if ["input", "textarea", "select"].contains(tag) &&
        literal_attribute(attrs, "type") != Some("hidden") {
        1
      } else {
        0
      }
      children.fold(init=own, (count, child) => count + labelable_count(child))
    }
    Invocation(_, _, children, _) =>
      children.fold(init=0, (count, child) => count + labelable_count(child))
    _ => 0
  }
}

///|
fn check_accessibility(root : Node, p : Parser) -> Unit raise CompileError {
  let ids : Map[String, Node] = Map([])
  let labels : Array[String] = []
  fn collect(node : Node) -> Unit raise CompileError {
    if node is Select(_, _, _) ||
      node is Each(_, _, _, _, _, _, _) ||
      node is Boundary(_, _, _, _) {
      for child in node.nested() {
        collect(child)
      }
    }
    if node is Invocation(_, _, children, _) {
      for child in children {
        collect(child)
      }
    }
    if node is Element(tag, attrs, children, _, start) {
      for
        name in [
          "id", "for", "aria-labelledby", "aria-describedby", "aria-errormessage",
        ] {
        if find(attrs, a => a.name == name) is Some(attr) {
          if literal_attribute(attrs, name) is None {
            p.fail_at(
              "E_A11Y_ID",
              "Local IDs and their references must be static strings",
              "Declare a literal local ID; each mount scopes it automatically.",
              start,
              tag.length() + 1,
            )
          }
          let _ = attr
        }
      }
      if literal_attribute(attrs, "id") is Some(id) {
        let tokens = id_tokens(id)
        if tokens.length() != 1 || tokens[0] != id || ids.contains(id) {
          p.fail_at(
            "E_A11Y_ID",
            "Empty, duplicate or whitespace-containing ID",
            "Use a unique local ID within the component.",
            start,
            tag.length() + 1,
          )
        }
        ids.set(id, node)
      }
      if tag == "label" && children.any(has_label_text) {
        if literal_attribute(attrs, "for") is Some(id) {
          labels.push(id)
        }
      }
      for child in children {
        collect(child)
      }
    }
  }
  collect(root)
  fn inspect(
    node : Node,
    wrapped : Bool,
    in_form : Bool,
  ) -> Unit raise CompileError {
    if node is Select(_, _, _) ||
      node is Each(_, _, _, _, _, _, _) ||
      node is Boundary(_, _, _, _) {
      for child in node.nested() {
        inspect(child, wrapped, in_form)
      }
    }
    if node is Invocation(_, _, children, _) {
      for child in children {
        inspect(child, wrapped, in_form)
      }
    }
    if node is Element(tag, attrs, children, handlers, start) {
      if tag == "form" && in_form {
        p.fail_at(
          "E_FORM_NESTING",
          "Forms cannot be nested",
          "Use one form per submission boundary.",
          start,
          tag.length() + 1,
        )
      }
      for
        name in [
          "for", "aria-labelledby", "aria-describedby", "aria-errormessage",
        ] {
        if literal_attribute(attrs, name) is Some(references) {
          let tokens = id_tokens(references)
          if tokens.is_empty() || tokens.any(id => !ids.contains(id)) {
            p.fail_at(
              "E_A11Y_REFERENCE",
              "Label or description references a missing local ID",
              "Reference an ID declared in the same component.",
              start,
              tag.length() + 1,
            )
          }
          if name == "for" {
            if tag != "label" || tokens.length() != 1 {
              p.fail_at(
                "E_A11Y_REFERENCE",
                "label for requires one control ID",
                "Associate label with one input, textarea or select.",
                start,
                tag.length() + 1,
              )
            }
            match ids.get(tokens[0]) {
              Some(Element(target, target_attrs, _, _, _)) =>
                if !["input", "textarea", "select"].contains(target) ||
                  literal_attribute(target_attrs, "type") == Some("hidden") {
                  p.fail_at(
                    "E_A11Y_REFERENCE",
                    "Label target is not a labelable control",
                    "Reference a visible input, textarea or select.",
                    start,
                    tag.length() + 1,
                  )
                }
              _ => ()
            }
          }
        }
      }
      let hidden = tag == "input" &&
        literal_attribute(attrs, "type") == Some("hidden")
      if ["input", "textarea", "select"].contains(tag) && !hidden {
        let named = literal_attribute(attrs, "aria-label") is Some(label) &&
          label.trim() != ""
        let referenced = literal_attribute(attrs, "aria-labelledby")
          is Some(references) &&
          id_tokens(references).all(id => {
            ids.get(id) is Some(target) && has_label_text(target)
          })
        let explicit = literal_attribute(attrs, "id") is Some(id) &&
          labels.contains(id)
        let submit_input = tag == "input" &&
          [Some("submit"), Some("reset"), Some("button")].contains(
            literal_attribute(attrs, "type"),
          )
        if !wrapped && !named && !referenced && !explicit && !submit_input {
          p.fail_at(
            "E_A11Y_LABEL",
            "Form control needs an accessible label",
            "Use a visible label, aria-label or aria-labelledby; placeholder is not a label.",
            start,
            tag.length() + 1,
          )
        }
      }
      if tag == "button" &&
        in_form &&
        ![Some("button"), Some("submit"), Some("reset")].contains(
          literal_attribute(attrs, "type"),
        ) {
        p.fail_at(
          "E_FORM_BUTTON_TYPE",
          "Buttons inside a form require an explicit type",
          "Choose type=submit, button or reset to make submission intent explicit.",
          start,
          tag.length() + 1,
        )
      }
      let implicit = tag == "label" &&
        literal_attribute(attrs, "for") is None &&
        children.any(has_label_text)
      if implicit && labelable_count(node) > 1 {
        p.fail_at(
          "E_A11Y_LABEL",
          "A wrapping label cannot name multiple controls",
          "Use a separate label for each control.",
          start,
          tag.length() + 1,
        )
      }
      let _ = handlers
      for child in children {
        inspect(child, wrapped || implicit, in_form || tag == "form")
      }
    }
  }
  inspect(root, false, false)
}
