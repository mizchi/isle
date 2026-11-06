///|
#export_name("compile")
pub fn compile(source : String) -> String {
  let parser : Parser = { source, pos: 0, handler_id: 0, }
  let result = try {
    let ir = parser.program()
    obj([
      ("ok", Json::boolean(true)),
      ("ir", ir),
      ("diagnostics", Json::array([])),
    ])
  } catch {
    Invalid(diagnostic) =>
      obj([
        ("ok", Json::boolean(false)),
        ("diagnostics", Json::array([diagnostic.to_json()])),
      ])
  }
  result.stringify()
}
