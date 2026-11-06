// Shared checker for instantaneous dependency graphs, independent of source language.

///|
priv struct DependencySource {
  file : String
  start : Int32
  end : Int32
}

///|
priv struct DependencyEdge {
  id : String
  source : DependencySource
}

///|
priv struct DependencyNode {
  id : String
  source : DependencySource
  dependencies : Array[DependencyEdge]
}

///|
priv struct DependencyFrame {
  node : Int32
  mut next : Int32
}

///|
fn dependency_diagnostic(
  code : String,
  message : String,
  source : DependencySource,
) -> Diagnostic {
  {
    code,
    message,
    start: source.start,
    end: source.end,
    file: source.file,
    hint: "Use a closed graph with unique node IDs and valid dependency endpoints.",
    cycle: [],
    related: [],
  }
}

///|
fn order_dependencies(
  nodes : Array[DependencyNode],
) -> Array[String] raise CompileError {
  let indices : Map[String, Int32] = Map([])
  for i = 0; i < nodes.length(); i = i + 1 {
    let node = nodes[i]
    if indices.contains(node.id) {
      raise Invalid(
        dependency_diagnostic(
          "E_DEPENDENCY_DUPLICATE",
          "Duplicate dependency node '" + node.id + "'",
          node.source,
        ),
      )
    }
    indices.set(node.id, i)
  }
  // Validate the entire graph, including components not reachable from an output root.
  for node in nodes {
    for edge in node.dependencies {
      if !indices.contains(edge.id) {
        raise Invalid(
          dependency_diagnostic(
            "E_DEPENDENCY_UNKNOWN",
            "Unknown dependency '" + edge.id + "' from '" + node.id + "'",
            edge.source,
          ),
        )
      }
    }
  }
  let colors = Array::make(nodes.length(), 0)
  let positions = Array::make(nodes.length(), -1)
  let stack : Array[DependencyFrame] = []
  let ordered : Array[String] = []
  for root = 0; root < nodes.length(); root = root + 1 {
    if colors[root] != 0 {
      continue
    }
    colors[root] = 1
    positions[root] = 0
    stack.push({ node: root, next: 0, })
    while stack.length() > 0 {
      let frame = stack[stack.length() - 1]
      let node = nodes[frame.node]
      if frame.next == node.dependencies.length() {
        colors[frame.node] = 2
        positions[frame.node] = -1
        ordered.push(node.id)
        let _ = stack.pop()
        continue
      }
      let edge = node.dependencies[frame.next]
      frame.next += 1
      let target = indices.get(edge.id).unwrap()
      if colors[target] == 0 {
        colors[target] = 1
        positions[target] = stack.length()
        stack.push({ node: target, next: 0, })
      } else if colors[target] == 1 {
        let cycle : Array[String] = []
        let related : Array[RelatedDiagnostic] = []
        for i = positions[target]; i < stack.length(); i = i + 1 {
          let cycle_node = nodes[stack[i].node]
          cycle.push(cycle_node.id)
          related.push({
            message: "'" + cycle_node.id + "' is declared here",
            file: cycle_node.source.file,
            start: cycle_node.source.start,
            end: cycle_node.source.end,
          })
        }
        cycle.push(edge.id)
        let diagnostic = dependency_diagnostic(
          "E_DEPENDENCY_CYCLE",
          "Dependency cycle: " + cycle.join(" -> "),
          edge.source,
        )
        raise Invalid({
          ..diagnostic,
          cycle,
          related,
          hint: "Break a dependency in this path; instantaneous computations must form a DAG.",
        })
      }
    }
  }
  ordered
}

///|
fn[T] invalid_dependency_graph(message : String) -> T raise CompileError {
  raise Invalid(
    dependency_diagnostic("E_DEPENDENCY_GRAPH", message, {
      file: "",
      start: 0,
      end: 0,
    }),
  )
}

///|
fn graph_object(value : Json) -> Map[String, Json] raise CompileError {
  match value {
    Object(fields) => fields
    _ => invalid_dependency_graph("Expected a dependency graph object")
  }
}

///|
fn graph_field(
  fields : Map[String, Json],
  name : String,
) -> Json raise CompileError {
  match fields.get(name) {
    Some(value) => value
    None => invalid_dependency_graph("Missing graph field '" + name + "'")
  }
}

///|
fn graph_array(value : Json) -> Array[Json] raise CompileError {
  match value {
    Array(items) => items
    _ => invalid_dependency_graph("Expected a dependency array")
  }
}

///|
fn graph_string(value : Json) -> String raise CompileError {
  match value {
    String(text) => text
    _ => invalid_dependency_graph("Expected a dependency string")
  }
}

///|
fn graph_id(value : Json) -> String raise CompileError {
  let id = graph_string(value)
  if id == "" {
    invalid_dependency_graph("Dependency IDs must be non-empty")
  }
  id
}

///|
fn graph_offset(value : Json) -> Int32 raise CompileError {
  match value {
    Number(number, ..) => {
      if !(number >= 0 && number <= 2147483647.0) {
        invalid_dependency_graph(
          "Dependency offsets must be non-negative Int32 values",
        )
      }
      let offset = number.to_int()
      if offset.to_double() != number {
        invalid_dependency_graph("Dependency offsets must be integers")
      }
      offset
    }
    _ => invalid_dependency_graph("Expected a dependency offset")
  }
}

///|
fn graph_source(value : Json) -> DependencySource raise CompileError {
  let fields = graph_object(value)
  let start = graph_offset(graph_field(fields, "start"))
  let end = graph_offset(graph_field(fields, "end"))
  if end < start {
    invalid_dependency_graph("Dependency ranges must have end >= start")
  }
  let file = match fields.get("file") {
    Some(value) => graph_string(value)
    None => ""
  }
  { file, start, end, }
}

///|
fn decode_dependency_graph(
  value : Json,
) -> Array[DependencyNode] raise CompileError {
  let fields = graph_object(value)
  if graph_field(fields, "version") != Json::number(1) {
    invalid_dependency_graph("Unsupported dependency graph version")
  }
  let nodes : Array[DependencyNode] = []
  for value in graph_array(graph_field(fields, "nodes")) {
    let fields = graph_object(value)
    let dependencies : Array[DependencyEdge] = []
    for value in graph_array(graph_field(fields, "dependencies")) {
      let fields = graph_object(value)
      dependencies.push({
        id: graph_id(graph_field(fields, "id")),
        source: graph_source(graph_field(fields, "source")),
      })
    }
    nodes.push({
      id: graph_id(graph_field(fields, "id")),
      source: graph_source(graph_field(fields, "source")),
      dependencies,
    })
  }
  nodes
}

///|
#export_name("checkDependencies")
pub fn check_dependencies(source : String) -> String {
  let result = try {
    let nodes = decode_dependency_graph(@json.parse(source))
    let ordered = order_dependencies(nodes)
    obj([
      ("ok", Json::boolean(true)),
      ("order", json_array(ordered, string_json)),
      ("diagnostics", Json::array([])),
    ])
  } catch {
    Invalid(diagnostic) =>
      obj([
        ("ok", Json::boolean(false)),
        ("diagnostics", Json::array([diagnostic.to_json()])),
      ])
    _ => {
      let diagnostic = dependency_diagnostic(
        "E_DEPENDENCY_GRAPH",
        "Invalid dependency graph JSON",
        { file: "", start: 0, end: 0, },
      )
      obj([
        ("ok", Json::boolean(false)),
        ("diagnostics", Json::array([diagnostic.to_json()])),
      ])
    }
  }
  result.stringify()
}
