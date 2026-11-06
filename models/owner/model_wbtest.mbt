///|
test "missing generation guard has a replayable stale-owner counterexample" {
  let client = client(MissingGeneration)
  let property = @model_check.Safety("safe")
  let result = @smt.exhaustive(client.model, property)
  guard result.witness is Some(witness) else {
    abort("the broken model must expose a stale-owner update")
  }
  assert_true(client.accepts(property, witness))
  let labels = witness.actions.map(id => client.model.actions[id])
  assert_true(labels.contains("Dispatch"))
  assert_true(labels.contains("Dispose"))
  assert_true(labels.contains("Recreate"))
  assert_true(labels.contains("Drain"))
  assert_true(client.states[witness.states.last().unwrap()].stale_write)
}

///|
test "strict generation guard is safe over the complete finite closure" {
  let client = client(Strict)
  guard client.model.exploration is Some(scope) else {
    abort("the explorer must report its scope")
  }
  assert_true(scope.complete)
  let result = @smt.exhaustive(client.model, @model_check.Safety("safe"))
  assert_true(result.witness is None)
  assert_eq(result.visited, client.states.length())
}

///|
test "strict model can apply, cancel and report a loading failure" {
  let client = client(Strict)
  for name in ["applied", "cancelled", "failed"] {
    let property = @model_check.Reachability(name)
    let result = @smt.exhaustive(client.model, property)
    guard result.witness is Some(witness) else {
      abort("expected a reachable outcome: " + name)
    }
    assert_true(client.accepts(property, witness))
  }
}

///|
test "late chunk completion cannot transfer an old event into a new generation" {
  let events = [Dispatch, Dispose, Recreate, LoadSucceeded, Drain]
  for pair in [(MissingGeneration, Applied), (Strict, Cancelled)] {
    let (policy, expected) = pair
    let mut state = initial()
    for event in events {
      guard step(policy, state, event) is Some(next) else {
        abort("the regression trace must remain executable")
      }
      state = next
    }
    assert_true(state.delivery == expected)
    assert_eq(state.stale_write, policy == MissingGeneration)
  }
}
