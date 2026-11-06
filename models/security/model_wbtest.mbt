///|
test "three broken security policies expose replayable counterexamples" {
  for
    pair in [
      (TrustPayloadIdentity, "ReceiveAliceAsBobOther"),
      (TrustExpiredPermit, "Revoke"),
      (IgnoreResource, "CommitOther"),
    ] {
    let (policy, important_action) = pair
    let client = client(policy)
    let property = @model_check.Safety("safe")
    let result = @smt.exhaustive(client.model, property)
    guard result.witness is Some(witness) else {
      abort("the broken policy must expose an unauthorized write")
    }
    assert_true(client.accepts(property, witness))
    let actions = witness.actions.map(id => client.model.actions[id])
    assert_true(actions.contains(important_action))
    assert_true(
      client.states[witness.states.last().unwrap()].unauthorized_write,
    )
  }
}

///|
test "strict policy is safe over its complete finite closure" {
  let client = client(Strict)
  guard client.model.exploration is Some(scope) else {
    abort("scope metadata is required")
  }
  assert_true(scope.complete)
  let result = @smt.exhaustive(client.model, @model_check.Safety("safe"))
  assert_true(result.witness is None)
  assert_eq(result.visited, client.states.length())
}

///|
test "strict policy permits both actors and rejects unauthorized or revoked calls" {
  let client = client(Strict)
  for
    name in ["alice_committed", "bob_committed", "rejected", "revoked_rejected"] {
    let property = @model_check.Reachability(name)
    let result = @smt.exhaustive(client.model, property)
    guard result.witness is Some(witness) else {
      abort("the healthy outcome must be reachable: " + name)
    }
    assert_true(client.accepts(property, witness))
  }
}
