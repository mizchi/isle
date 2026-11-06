///|
test "Once safety holds for cold and SSR-settled lifetimes" {
  for scenario in [Cold, SSRReady] {
    let c = client(Strict, scenario)
    assert_true(c.model.exploration.unwrap().complete)
    for
      predicate in [
        "start_once", "settle_once", "current_owner", "terminal_stable", "retain_readable",
      ] {
      assert_true(@smt.exhaustive(c.model, Safety(predicate)).witness is None)
    }
  }
}

///|
test "weakened capabilities and lifetime guards have executable counterexamples" {
  for
    (policy, scenario, predicate) in [
      (DuplicateStart, Cold, "start_once"),
      (DuplicateSettle, Cold, "settle_once"),
      (IgnoreGeneration, Cold, "current_owner"),
      (IgnoreDisposal, Cold, "current_owner"),
      (RestartSnapshot, SSRReady, "terminal_stable"),
      (DropReadable, Cold, "retain_readable"),
    ] {
    let c = client(policy, scenario)
    let property = @model_check.Safety(predicate)
    let witness = @smt.exhaustive(c.model, property).witness.unwrap()
    assert_true(c.accepts(property, witness))
  }
}

///|
test "response is checked over fair infinite paths for each lifetime separately" {
  let c = client(Strict, Cold)
  for
    (trigger, goal) in [
      ("pending_first", "done_first"),
      ("pending_second", "done_second"),
    ] {
    assert_true(
      @smt.exhaustive(c.model, Response(trigger, goal), justice=c.model.justice).witness
      is None,
    )
  }
}

///|
test "unfair infinite waiting and unfair delivery are real lasso counterexamples" {
  let c = client(Strict, Cold)
  let property = @model_check.Response("pending_first", "done_first")
  for justice in [[], producer_fairness(c)] {
    let witness = @smt.exhaustive(c.model, property, justice~).witness.unwrap()
    assert_true(witness.loop_start is Some(_))
    assert_true(c.accepts(property, witness, justice~))
    assert_false(c.accepts(property, witness, justice=c.model.justice))
  }
}

///|
test "dropping a completed message violates response even under the declared fairness" {
  let c = client(LoseCompletion, Cold)
  let property = @model_check.Response("pending_first", "done_first")
  let witness = @smt.exhaustive(c.model, property, justice=c.model.justice).witness.unwrap()
  assert_true(witness.loop_start is Some(_))
  assert_true(c.accepts(property, witness, justice=c.model.justice))
}

///|
test "success failure cancellation and a second lifetime are reachable" {
  let c = client(Strict, Cold)
  for predicate in ["ready_first", "failed_first", "disposed", "ready_second"] {
    let property = @model_check.Reachability(predicate)
    let witness = @smt.exhaustive(c.model, property).witness.unwrap()
    assert_true(c.accepts(property, witness))
  }
}

///|
test "the same stale-result trace rejects old data and accepts current data" {
  let mut s = initial(Cold)
  for
    event in [
      Resume,
      Start,
      Dispose,
      Recreate,
      Resume,
      Start,
      Succeed(0),
      Publish(0),
    ] {
    s = step(Strict, s, event).unwrap()
  }
  assert_true(s.phase == Pending)
  assert_false(s.invalid_commit)
  s = step(Strict, s, Succeed(1)).unwrap()
  s = step(Strict, s, Publish(1)).unwrap()
  assert_true(s.phase == Ready(Right))
  assert_eq(s.settlements, 1)
}

///|
test "two Once values do not imply a once-updated component" {
  let c = pair_client()
  assert_true(@smt.exhaustive(c.model, Safety("values_once")).witness is None)
  let property = @model_check.Safety("component_once")
  let witness = @smt.exhaustive(c.model, property).witness.unwrap()
  assert_true(c.accepts(property, witness))
  assert_true(
    @smt.exhaustive(
      c.model,
      Response("pending", "done"),
      justice=c.model.justice,
    ).witness
    is None,
  )
}

///|
test "fairness does not demand a response from an abandoned request" {
  let mut s = initial(Cold)
  for event in [Resume, Start, Dispose, Recreate, Resume, Start] {
    s = step(Strict, s, event).unwrap()
  }
  assert_true(step(Strict, s, AdvanceProducer(0)) is None)
  assert_true(step(Strict, s, Succeed(0)) is Some(_))
  assert_true(step(Strict, s, AdvanceProducer(1)) is Some(_))
}
