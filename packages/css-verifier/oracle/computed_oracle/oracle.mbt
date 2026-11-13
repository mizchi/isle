// Development-only differential oracle. It converts a finite box tree and one
// stylesheet into mizchi/css computed values. It is never linked into Isle
// runtime output; the CSS verifier compares its own cascade against this.

///|
fn dimension(value : @values.Dimension) -> String {
  match value {
    Length(v) => "\{v}px"
    Percent(v) => "\{v * 100.0}%"
    Auto => "auto"
    other => "other:\{other}"
  }
}

///|
fn min_track(value : @values.MinTrackSizing) -> String {
  match value {
    Length(v) => "\{v}px"
    Auto => "auto"
    other => "other:\{other}"
  }
}

///|
fn single_track(value : @values.SingleTrackSizing) -> String {
  match value {
    Length(v) => "fixed:\{v}"
    Auto => "auto"
    MinMax(min, Fr(w)) => "fr:\{min_track(min)}:\{w}"
    other => "other:\{other}"
  }
}

///|
fn tracks(values : Array[@values.TrackSizingFunction]) -> Json {
  let out : Array[Json] = []
  for value in values {
    match value {
      Length(v) => out.push(Json::string("fixed:\{v}"))
      Auto => out.push(Json::string("auto"))
      MinMax(min, Fr(w)) => out.push(Json::string("fr:\{min_track(min)}:\{w}"))
      Repeat(Count(n), inner, _) =>
        for _ in 0..<n {
          for track in inner {
            out.push(Json::string(single_track(track)))
          }
        }
      other => out.push(Json::string("other:\{other}"))
    }
  }
  Json::array(out)
}

///|
fn rect(prefix : String, value : @values.Rect[@values.Dimension], out : Map[String, Json]) -> Unit {
  out["\{prefix}-left"] = Json::string(dimension(value.left))
  out["\{prefix}-right"] = Json::string(dimension(value.right))
  out["\{prefix}-top"] = Json::string(dimension(value.top))
  out["\{prefix}-bottom"] = Json::string(dimension(value.bottom))
}

///|
fn snapshot(path : String, style : @style.Style) -> Json {
  let out : Map[String, Json] = Map([])
  out["path"] = Json::string(path)
  out["display"] = Json::string("\{style.display}")
  out["position"] = Json::string("\{style.position}")
  out["box-sizing"] = Json::string("\{style.box_sizing}")
  out["overflow-x"] = Json::string("\{style.overflow_x}")
  out["overflow-y"] = Json::string("\{style.overflow_y}")
  out["inline-size"] = Json::string(dimension(style.width))
  out["min-inline-size"] = Json::string(dimension(style.min_width))
  out["max-inline-size"] = Json::string(dimension(style.max_width))
  out["block-size"] = Json::string(dimension(style.height))
  out["min-block-size"] = Json::string(dimension(style.min_height))
  out["max-block-size"] = Json::string(dimension(style.max_height))
  rect("padding", style.padding, out)
  rect("border", style.border, out)
  rect("margin", style.margin, out)
  out["column-gap"] = Json::string(
    if style.column_gap_is_normal {
      "normal"
    } else {
      dimension(style.column_gap)
    },
  )
  out["row-gap"] = Json::string(dimension(style.row_gap))
  out["flex-direction"] = Json::string("\{style.flex_direction}")
  out["flex-wrap"] = Json::string("\{style.flex_wrap}")
  out["flex-grow"] = Json::number(style.flex_grow)
  out["flex-shrink"] = Json::number(style.flex_shrink)
  out["flex-basis"] = Json::string(dimension(style.flex_basis))
  out["justify-content"] = Json::string("\{style.justify_content}")
  out["align-items"] = Json::string("\{style.align_items}")
  out["order"] = Json::number(style.order.to_double())
  out["grid-template-columns"] = tracks(style.grid_template_columns)
  out["grid-template-rows"] = tracks(style.grid_template_rows)
  Json::object(out)
}

///|
fn strings(value : Json?) -> Array[String] {
  match value {
    Some(Array(items)) =>
      items.filter_map(item => match item {
        String(s) => Some(s)
        _ => None
      })
    _ => []
  }
}

///|
fn visit(
  node : Json,
  path : String,
  parent : @selector.Element?,
  parent_style : @style.Style?,
  parent_vars : Map[String, String],
  index : Int,
  count : Int,
  sheets : Array[@cascade.Stylesheet],
  env : @media.MediaEnvironment,
  viewport : (Double, Double),
  out : Array[Json],
) -> Unit {
  guard node is Object(fields) else { return }
  let tag = match fields.get("tag") {
    Some(String(t)) => t
    _ => "div"
  }
  let id = match fields.get("id") {
    Some(String(v)) => Some(v)
    _ => None
  }
  let children = match fields.get("children") {
    Some(Array(items)) => items
    _ => []
  }
  let element : @selector.Element = {
    tag_name: tag,
    id,
    classes: strings(fields.get("classes")),
    attributes: [],
    custom_states: [],
    parent,
    prev_sibling: None,
    next_sibling: None,
    children: [],
    sibling_index: index + 1,
    sibling_count: count,
  }
  let cascaded = @cascade.cascade_element_with_media(element, sheets, [], Some(env))
  let ctx = match parent_style {
    Some(p) => @computed.ComputeContext::with_parent_and_vars(p, parent_vars.copy())
    None => @computed.ComputeContext::with_viewport(viewport.0, viewport.1)
  }
  let (style, vars) = @computed.compute_with_vars(cascaded, ctx)
  out.push(snapshot(path, style))
  for i, child in children {
    visit(child, "\{path}/\{i}", Some(element), Some(style), vars, i, children.length(), sheets, env, viewport, out)
  }
}

///|
/// Input: {"css": string, "width": number, "height": number, "tree": node}
/// where node is {"tag", "id"?, "classes"?, "children"?}. Output: preorder
/// array of computed snapshots; paths follow the CSS verifier convention.
pub fn compute_tree(input : String, name : String) -> String {
  let parsed = @json.parse(input) catch { _ => return "{\"error\":\"invalid json\"}" }
  guard parsed is Object(fields) else { return "{\"error\":\"invalid input\"}" }
  let css = match fields.get("css") {
    Some(String(s)) => s
    _ => ""
  }
  let width = match fields.get("width") {
    Some(Number(n, ..)) => n
    _ => 1024.0
  }
  let height = match fields.get("height") {
    Some(Number(n, ..)) => n
    _ => 768.0
  }
  let sheet = @parser.parse_stylesheet(css)
  let env = @media.MediaEnvironment::new(width, height)
  let out : Array[Json] = []
  match fields.get("tree") {
    Some(tree) => visit(tree, name, None, None, Map([]), 0, 1, [sheet], env, (width, height), out)
    None => ()
  }
  Json::array(out).stringify()
}
