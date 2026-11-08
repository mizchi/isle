///|
#derive(Eq, ToJson)
pub(all) enum Actor {
  Alice
  Bob
}

///|
pub extend Actor with Eq::{equal, not_equal}

///|
pub extend Actor with ToJson::{to_json}

///|
#derive(Eq, ToJson)
pub(all) enum Document {
  Alpha
  Beta
}

///|
pub extend Document with Eq::{equal, not_equal}

///|
pub extend Document with ToJson::{to_json}

///|
#derive(Eq, ToJson)
pub(all) enum Phase {
  Idle
  Received
  Decoded
  Authenticated
  Authorized
  Suspended
  Committed
  Rejected
  Responded
}

///|
pub extend Phase with Eq::{equal, not_equal}

///|
pub extend Phase with ToJson::{to_json}

///|
#derive(Eq)
pub(all) enum Policy {
  Strict
  TrustPayloadIdentity
  TrustExpiredPermit
  IgnoreResource
}

///|
pub extend Policy with Eq::{equal, not_equal}

///|
#derive(Eq, ToJson)
pub(all) struct Permit {
  actor : Actor
  target : Document
}

///|
pub extend Permit with Eq::{equal, not_equal}

///|
pub extend Permit with ToJson::{to_json}

///|
#derive(Eq, ToJson)
pub(all) struct State {
  phase : Phase
  actual_actor : Actor
  supplied_actor : Actor
  authenticated_actor : Actor?
  target : Document
  permit : Permit?
  revoked : Bool
  effect_target : Document?
  unauthorized_write : Bool
}

///|
pub extend State with Eq::{equal, not_equal}

///|
pub extend State with ToJson::{to_json}

///|
pub(all) enum Event {
  Receive(Actor, Actor, Document)
  Decode
  Authenticate
  Authorize
  Suspend
  Revoke
  CommitRequested
  CommitOther
  Respond
}

///|
pub fn initial() -> State {
  {
    phase: Idle,
    actual_actor: Alice,
    supplied_actor: Alice,
    authenticated_actor: None,
    target: Alpha,
    permit: None,
    revoked: false,
    effect_target: None,
    unauthorized_write: false,
  }
}

///|
pub fn owner(document : Document) -> Actor {
  match document {
    Alpha => Alice
    Beta => Bob
  }
}

///|
pub fn step(policy : Policy, state : State, event : Event) -> State? {
  match event {
    Receive(actual, supplied, target) => {
      guard state.phase == Idle else { return None }
      Some({
        ..state,
        phase: Received,
        actual_actor: actual,
        supplied_actor: supplied,
        target,
      })
    }
    Decode => {
      guard state.phase == Received else { return None }
      Some({ ..state, phase: Decoded, })
    }
    Authenticate => {
      guard state.phase == Decoded else { return None }
      let actor = if policy == TrustPayloadIdentity {
        state.supplied_actor
      } else {
        state.actual_actor
      }
      Some({ ..state, phase: Authenticated, authenticated_actor: Some(actor), })
    }
    Authorize => {
      guard state.phase == Authenticated else { return None }
      guard state.authenticated_actor is Some(actor) else { return None }
      if owner(state.target) == actor {
        Some({
          ..state,
          phase: Authorized,
          permit: Some({ actor, target: state.target, }),
        })
      } else {
        Some({ ..state, phase: Rejected, })
      }
    }
    Suspend => {
      guard state.phase == Authorized else { return None }
      Some({ ..state, phase: Suspended, })
    }
    Revoke => {
      guard state.phase == Suspended && !state.revoked else { return None }
      Some({ ..state, revoked: true, })
    }
    CommitRequested => {
      guard state.phase == Authorized || state.phase == Suspended else {
        return None
      }
      Some(commit(policy, state, state.target))
    }
    CommitOther => {
      guard state.phase == Authorized || state.phase == Suspended else {
        return None
      }
      let other = match state.target {
        Alpha => Beta
        Beta => Alpha
      }
      Some(commit(policy, state, other))
    }
    Respond => {
      guard state.phase == Committed || state.phase == Rejected else {
        return None
      }
      Some({ ..state, phase: Responded, })
    }
  }
}

///|
fn commit(policy : Policy, state : State, target : Document) -> State {
  guard state.permit is Some(permit) else {
    return { ..state, phase: Rejected, }
  }
  let allowed = state.authenticated_actor == Some(permit.actor) &&
    (policy == IgnoreResource || permit.target == target) &&
    (policy == TrustExpiredPermit || !state.revoked)
  if allowed {
    let actually_allowed = owner(target) == state.actual_actor && !state.revoked
    {
      ..state,
      phase: Committed,
      effect_target: Some(target),
      unauthorized_write: state.unauthorized_write || !actually_allowed,
    }
  } else {
    { ..state, phase: Rejected, }
  }
}

///|
pub fn client(policy : Policy) -> @model_check.Client[State, Event, Json] raise {
  let spec : @model_check.Spec[State, Event, Json] = {
    initial: initial(),
    actions: [
      ("ReceiveAliceOwn", Receive(Alice, Alice, Alpha)),
      ("ReceiveAliceAsBobOther", Receive(Alice, Bob, Beta)),
      ("ReceiveAliceOther", Receive(Alice, Alice, Beta)),
      ("ReceiveAliceOwnFalseClaim", Receive(Alice, Bob, Alpha)),
      ("ReceiveBobOwn", Receive(Bob, Bob, Beta)),
      ("ReceiveBobAsAliceOther", Receive(Bob, Alice, Alpha)),
      ("ReceiveBobOther", Receive(Bob, Bob, Alpha)),
      ("ReceiveBobOwnFalseClaim", Receive(Bob, Alice, Beta)),
      ("Decode", Decode),
      ("Authenticate", Authenticate),
      ("Authorize", Authorize),
      ("Suspend", Suspend),
      ("Revoke", Revoke),
      ("CommitRequested", CommitRequested),
      ("CommitOther", CommitOther),
      ("Respond", Respond),
    ],
    step: (state, event) => step(policy, state, event),
    predicates: [
      ("safe", state => !state.unauthorized_write),
      ("committed", state => state.effect_target is Some(_)),
      (
        "alice_committed",
        state => state.effect_target is Some(_) && state.actual_actor == Alice,
      ),
      (
        "bob_committed",
        state => state.effect_target is Some(_) && state.actual_actor == Bob,
      ),
      ("rejected", state => state.phase == Rejected),
      ("revoked_rejected", state => state.revoked && state.phase == Rejected),
    ],
    snapshot: state => state.to_json(),
    justice: [],
  }
  @model_check.build_client(spec, max_depth=16, max_states=1024)
}
