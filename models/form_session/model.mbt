///|
pub(all) enum Policy {
  Strict
  IgnoreRevision
  IgnoreGeneration
  AllowDuplicate
} derive(Eq)

///|
pub extend Policy with Eq::{equal, not_equal}

///|
pub(all) enum Event {
  Edit
  Validate
  ValidationDone
  Submit
  SubmissionDone
  Reset
}

///|
pub(all) struct State {
  revision : Bool
  generation : Bool
  validation_started : Bool
  validation_done : Bool
  validation_revision : Bool
  validation_generation : Bool
  submit_started : Bool
  submit_done : Bool
  submit_revision : Bool
  submit_generation : Bool
  pending : Bool
  dirty : Bool
  touched : Bool
  issues : Bool
  bad : Bool
} derive(Eq, ToJson)

///|
pub extend State with Eq::{equal, not_equal}

///|
pub extend State with ToJson::{to_json}

///|
pub fn initial() -> State {
  {
    revision: false,
    generation: false,
    validation_started: false,
    validation_done: false,
    validation_revision: false,
    validation_generation: false,
    submit_started: false,
    submit_done: false,
    submit_revision: false,
    submit_generation: false,
    pending: false,
    dirty: false,
    touched: false,
    issues: false,
    bad: false,
  }
}

///|
pub fn step(policy : Policy, state : State, event : Event) -> State? {
  match event {
    Edit => {
      guard !state.revision else { return None }
      Some({ ..state, revision: true, dirty: true, touched: true, })
    }
    Validate => {
      guard !state.validation_started else { return None }
      Some({
        ..state,
        validation_started: true,
        validation_revision: state.revision,
        validation_generation: state.generation,
      })
    }
    ValidationDone => {
      guard state.validation_started && !state.validation_done else {
        return None
      }
      let fresh = state.revision == state.validation_revision &&
        state.generation == state.validation_generation
      let apply = (
          state.revision == state.validation_revision ||
          policy == IgnoreRevision
        ) &&
        (
          state.generation == state.validation_generation ||
          policy == IgnoreGeneration
        )
      Some({
        ..state,
        validation_done: true,
        issues: state.issues || apply,
        bad: state.bad || (apply && !fresh),
      })
    }
    Submit => {
      if state.pending && policy == AllowDuplicate {
        return Some({ ..state, bad: true, })
      }
      guard !state.submit_started else { return None }
      Some({
        ..state,
        submit_started: true,
        pending: true,
        submit_revision: state.revision,
        submit_generation: state.generation,
      })
    }
    SubmissionDone => {
      guard state.submit_started && !state.submit_done else { return None }
      let fresh = state.revision == state.submit_revision &&
        state.generation == state.submit_generation
      let same_owner = state.generation == state.submit_generation ||
        policy == IgnoreGeneration
      let apply = same_owner &&
        (state.revision == state.submit_revision || policy == IgnoreRevision)
      Some({
        ..state,
        submit_done: true,
        pending: if same_owner {
          false
        } else {
          state.pending
        },
        issues: state.issues || apply,
        bad: state.bad || (apply && !fresh),
      })
    }
    Reset => {
      guard !state.generation else { return None }
      Some({
        ..state,
        generation: true,
        revision: false,
        pending: false,
        dirty: false,
        touched: false,
        issues: false,
      })
    }
  }
}

///|
pub fn client(policy : Policy) -> @model_check.Client[State, Event, Json] raise {
  let spec : @model_check.Spec[State, Event, Json] = {
    initial: initial(),
    actions: [
      ("Edit", Edit),
      ("Validate", Validate),
      ("ValidationDone", ValidationDone),
      ("Submit", Submit),
      ("SubmissionDone", SubmissionDone),
      ("Reset", Reset),
    ],
    step: (state, event) => step(policy, state, event),
    predicates: [
      ("safe", state => !state.bad),
      (
        "validated",
        state => state.validation_done && state.issues && !state.bad,
      ),
      ("submitted", state => state.submit_done && !state.pending && !state.bad),
      (
        "reset_clean",
        state => {
          state.generation &&
          !state.revision &&
          !state.dirty &&
          !state.touched &&
          !state.pending &&
          !state.issues
        },
      ),
    ],
    snapshot: state => state.to_json(),
    justice: [],
  }
  @model_check.build_client(spec, max_depth=20, max_states=4096)
}
