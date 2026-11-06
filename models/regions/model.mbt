///|
pub(all) enum Policy {
  Strict
  KeyOnly
} derive(Eq)

///|
pub extend Policy with Eq::{equal, not_equal}

///|
pub(all) enum Event {
  Dispatch
  Remove
  Reinsert
  Move
  Drain
} derive(Eq)

///|
pub extend Event with Eq::{equal, not_equal}

///|
/// All actions leave the parent owner alive; only one keyed row changes lifetime.
pub(all) struct State {
  present : Bool
  second : Bool
  moved : Bool
  waiting : Bool
  captured_second : Bool
  dispatched : Bool
  applied : Bool
  cancelled : Bool
  stale : Bool
} derive(Eq, ToJson)

///|
pub extend State with Eq::{equal, not_equal}

///|
pub extend State with ToJson::{to_json}

///|
pub fn step(policy : Policy, s : State, event : Event) -> State? {
  match event {
    Dispatch => {
      guard s.present && !s.dispatched else { return None }
      Some({ ..s, dispatched: true, waiting: true, captured_second: s.second, })
    }
    Remove => {
      guard s.present else { return None }
      Some({ ..s, present: false, })
    }
    Reinsert => {
      guard !s.present && !s.second else { return None }
      Some({ ..s, present: true, second: true, })
    }
    Move => {
      guard s.present else { return None }
      Some({ ..s, moved: !s.moved, })
    }
    Drain => {
      guard s.waiting else { return None }
      let current = s.present && s.second == s.captured_second
      let accepts = s.present && (policy == KeyOnly || current)
      Some({
        ..s,
        waiting: false,
        applied: accepts,
        cancelled: !accepts,
        stale: accepts && !current,
      })
    }
  }
}

///|
pub fn client(policy : Policy) -> @model_check.Client[State, Event, Json] raise {
  @model_check.build_client(
    {
      initial: {
        present: true,
        second: false,
        moved: false,
        waiting: false,
        captured_second: false,
        dispatched: false,
        applied: false,
        cancelled: false,
        stale: false,
      },
      actions: [
        ("Dispatch", Dispatch),
        ("Remove", Remove),
        ("Reinsert", Reinsert),
        ("Move", Move),
        ("Drain", Drain),
      ],
      step: (state, event) => step(policy, state, event),
      predicates: [
        ("safe", state => !state.stale),
        ("applied", state => state.applied),
        ("cancelled", state => state.cancelled),
      ],
      snapshot: state => state.to_json(),
      justice: [],
    },
    max_depth=16,
    max_states=256,
  )
}
