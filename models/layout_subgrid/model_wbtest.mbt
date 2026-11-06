///|
test "all finite subgrid configurations preserve shared gutter centers and extent" {
  let result = report()
  assert_true(result.complete)
  assert_true(result.strict_safe)
  assert_eq(result.reachable_configurations, 162)
  assert_true(result.independent_counterexample_replayed)
  let c = client(false)
  let reachable = @model_check.Reachability("three-tracks")
  assert_true(
    c.accepts(reachable, @smt.exhaustive(c.model, reachable).witness.unwrap()),
  )
}
