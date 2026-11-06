///|
fn main {
  let report = @verification.run() catch {
    _ => abort("finite model verification could not complete")
  }
  println(report.to_json().stringify())
  guard report.passed else {
    abort("finite model results did not match the expected outcomes")
  }
}
