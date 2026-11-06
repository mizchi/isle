///|
test "CSS readiness and owner validity gate activation and commit" {
  let c = client(Strict)
  assert_true(c.model.exploration.unwrap().complete)
  assert_true(@smt.exhaustive(c.model, Safety("safe")).witness is None)
  for predicate in ["activated", "committed", "cancelled"] {
    let property = @model_check.Reachability(predicate)
    let witness = @smt.exhaustive(c.model, property).witness.unwrap()
    assert_true(c.accepts(property, witness))
  }
}

///|
test "missing readiness or lifetime checks produce replayable counterexamples" {
  for policy in [SkipCSS, IgnoreOwner] {
    let c = client(policy)
    assert_true(c.model.exploration.unwrap().complete)
    let property = @model_check.Safety("safe")
    let witness = @smt.exhaustive(c.model, property).witness.unwrap()
    assert_true(c.accepts(property, witness))
  }
}
