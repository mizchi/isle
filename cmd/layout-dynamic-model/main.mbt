///|
fn main {
  let result = @layout_dynamic.report() catch {
    _ => abort("dynamic layout model did not complete")
  }
  println(result.to_json().stringify())
  guard result.complete && result.bounded_safe && result.gutter_safe else {
    abort("dynamic layout verification failed")
  }
}
