///|
pub(all) enum Generation {
  First
  Second
} derive(Eq, ToJson)

///|
pub extend Generation with Eq::{equal, not_equal}

///|
pub extend Generation with ToJson::{to_json}

///|
pub(all) enum Delivery {
  Idle
  Waiting(Generation)
  Applied
  Cancelled
  Failed
} derive(Eq, ToJson)

///|
pub extend Delivery with Eq::{equal, not_equal}

///|
pub extend Delivery with ToJson::{to_json}

///|
pub(all) enum Chunk {
  Dormant
  Loading
  Ready
  Unavailable
} derive(Eq, ToJson)

///|
pub extend Chunk with Eq::{equal, not_equal}

///|
pub extend Chunk with ToJson::{to_json}

///|
pub(all) enum Policy {
  Strict
  MissingGeneration
} derive(Eq)

///|
pub extend Policy with Eq::{equal, not_equal}

///|
pub(all) enum Event {
  Dispatch
  LoadSucceeded
  LoadFailed
  Dispose
  Recreate
  Drain
}

///|
/// One logical scope ID, two distinct lifetimes, one event, one lazy chunk.
pub(all) struct State {
  alive : Bool
  generation : Generation
  delivery : Delivery
  chunk : Chunk
  stale_write : Bool
} derive(Eq, ToJson)

///|
pub extend State with Eq::{equal, not_equal}

///|
pub extend State with ToJson::{to_json}

///|
pub fn initial() -> State {
  {
    alive: true,
    generation: First,
    delivery: Idle,
    chunk: Dormant,
    stale_write: false,
  }
}

///|
pub fn step(policy : Policy, state : State, event : Event) -> State? {
  match event {
    Dispatch => {
      guard state.alive && state.delivery == Idle else { return None }
      Some({ ..state, delivery: Waiting(state.generation), chunk: Loading, })
    }
    LoadSucceeded => {
      guard state.chunk == Loading else { return None }
      Some({ ..state, chunk: Ready, })
    }
    LoadFailed => {
      guard state.chunk == Loading else { return None }
      Some({ ..state, chunk: Unavailable, })
    }
    Dispose => {
      guard state.alive else { return None }
      Some({ ..state, alive: false, })
    }
    Recreate => {
      guard !state.alive && state.generation == First else { return None }
      Some({ ..state, alive: true, generation: Second, })
    }
    Drain => {
      guard state.delivery is Waiting(captured) else { return None }
      match state.chunk {
        Ready => {
          let current = state.alive && captured == state.generation
          if !state.alive || (policy == Strict && captured != state.generation) {
            Some({ ..state, delivery: Cancelled, })
          } else {
            Some({
              ..state,
              delivery: Applied,
              stale_write: state.stale_write || !current,
            })
          }
        }
        Unavailable => Some({ ..state, delivery: Failed, })
        Dormant | Loading => None
      }
    }
  }
}

///|
pub fn client(policy : Policy) -> @model_check.Client[State, Event, Json] raise {
  let spec : @model_check.Spec[State, Event, Json] = {
    initial: initial(),
    actions: [
      ("Dispatch", Dispatch),
      ("LoadSucceeded", LoadSucceeded),
      ("LoadFailed", LoadFailed),
      ("Dispose", Dispose),
      ("Recreate", Recreate),
      ("Drain", Drain),
    ],
    step: (state, event) => step(policy, state, event),
    predicates: [
      ("safe", state => !state.stale_write),
      ("applied", state => state.delivery == Applied),
      ("cancelled", state => state.delivery == Cancelled),
      ("failed", state => state.delivery == Failed),
    ],
    snapshot: state => state.to_json(),
    justice: [],
  }
  @model_check.build_client(spec, max_depth=16, max_states=256)
}
