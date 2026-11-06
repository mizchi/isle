///|
test "resource destruction is safe across two owner lifetimes" {
  let c = client(Strict)
  assert_true(c.model.exploration.unwrap().complete)
  for
    predicate in [
      "release_once", "only_acquired", "no_early_release", "current_publication",
      "abort_requested", "abort_once",
    ] {
    assert_true(@smt.exhaustive(c.model, Safety(predicate)).witness is None)
  }
}

///|
test "cleanup eventually starts and settles under explicit separate assumptions" {
  let c = client(Strict)
  for index in ["0", "1"] {
    assert_true(
      @smt.exhaustive(
        c.model,
        Response("needs_release" + index, "release_attempted" + index),
        justice=release_fairness(c),
      ).witness
      is None,
    )
    assert_true(
      @smt.exhaustive(
        c.model,
        Response("releasing" + index, "release_settled" + index),
        justice=c.model.justice,
      ).witness
      is None,
    )
  }
}

///|
test "broken teardown policies have replayable counterexamples" {
  for
    (policy, predicate) in [
      (DoubleRelease, "release_once"),
      (ReleaseWithoutAcquire, "only_acquired"),
      (PrematureRelease, "no_early_release"),
      (IgnoreOwner, "current_publication"),
      (ForgetAbort, "abort_requested"),
      (DoubleAbort, "abort_once"),
    ] {
    let c = client(policy)
    let property = @model_check.Safety(predicate)
    let witness = @smt.exhaustive(c.model, property).witness.unwrap()
    assert_true(c.accepts(property, witness))
  }
}

///|
test "lost late acquisitions and skipped cleanup violate fair liveness" {
  for policy in [DropLate, LeakReady, StopAfterFailure] {
    let c = client(policy)
    let property = @model_check.Response("needs_release1", "release_attempted1")
    let justice = release_fairness(c)
    let witness = @smt.exhaustive(c.model, property, justice~).witness.unwrap()
    assert_true(witness.loop_start is Some(_))
    assert_true(c.accepts(property, witness, justice~))
  }
}

///|
test "a rejecting destructor is observable rather than modeled as successful release" {
  let c = client(Strict)
  for
    predicate in [
      "released", "release_failed", "late_released", "new_owner_ready",
    ] {
    let property = @model_check.Reachability(predicate)
    assert_true(
      c.accepts(property, @smt.exhaustive(c.model, property).witness.unwrap()),
    )
  }
}
