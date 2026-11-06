// A closed syntax prototype. Offsets are UTF-16 code units.

///|
priv struct Diagnostic {
  code : String
  message : String
  start : Int32
  end : Int32
  hint : String
  file : String
  cycle : Array[String]
  related : Array[RelatedDiagnostic]
} derive(ToJson)

///|
extend Diagnostic with ToJson::{to_json}

///|
priv struct RelatedDiagnostic {
  message : String
  file : String
  start : Int32
  end : Int32
} derive(ToJson)

///|
priv suberror CompileError {
  Invalid(Diagnostic)
}

///|
priv struct Parser {
  source : String
  mut pos : Int32
  mut handler_id : Int32
}

///|
priv enum Expr {
  Literal(Json, String)
  Name(String, Int32)
  Binary(String, Expr, Expr)
  Property(Expr, String)
  Remote(String, Array[(String, Expr)])
  ArrayValue(Array[Expr])
  RecordValue(Array[(String, Expr)])
  Index(Expr, Expr)
  Not(Expr)
  Conditional(Expr, Expr, Expr)
  Method(Expr, String, Array[Expr])
  Collection(Expr, String, String, Expr)
  JsonDecode(String, Expr)
  JsonEncode(Expr)
}

///|
priv struct Field {
  name : String
  ty : String
  optional : Bool
  constraints : Array[Constraint]
}

///|
priv struct StateDecl {
  name : String
  ty : String
  initial : Expr
}

///|
priv struct Derived {
  name : String
  start : Int32
  end : Int32
  ty : String
  value : Expr
}

///|
priv struct Statement {
  target : String
  op : String
  value : Expr
}

///|
priv struct Handler {
  id : String
  event : String
  is_async : Bool
  start : Int32
  end : Int32
  statements : Array[Statement]
}

///|
priv struct Attribute {
  name : String
  value : Expr
}

///|
priv enum Node {
  Element(String, Array[Attribute], Array[Node], Array[Handler], Int32)
  Invocation(String, Array[Attribute], Array[Node], Int32)
  Select(Array[(Expr, Array[Node])], Array[Node], Int32)
  Each(String, String, Expr, Expr, Array[Node], Array[Node], Int32)
  Boundary(Array[Node], String, Array[Node], Int32)
  Text(String)
  Expression(Expr)
}

///|
priv struct Component {
  name : String
  side : String
  props : Array[Field]
  states : Array[StateDecl]
  derives : Array[Derived]
  root : Node
}

///|
priv struct Constraint {
  kind : String
  value : Json
  field : String
  start : Int32
  end : Int32
}

///|
priv struct Schema {
  name : String
  kind : String
  fields : Array[Field]
}

///|
priv enum CallArg {
  Grant
  Input(String)
}

///|
priv struct Action {
  name : String
  input_schema : String
  output_schema : String
  input_name : String
  request_name : String
  grant_name : String
  policy_name : String
  target_field : String
  validation : String
  effects : Array[String]
  call_name : String
  args : Array[CallArg]
}
