///|
fn main {
  let result = @layout_subgrid.report() catch {
    _ => abort("subgrid model verification could not complete")
  }
  println(result.to_json().stringify())
  guard result.complete &&
    result.strict_safe &&
    result.independent_counterexample_replayed else {
    abort("subgrid model verification failed")
  }
}
