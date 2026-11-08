///|
#derive(Eq)
pub(all) enum Policy {
  Strict
  ReadDomAfterImport
  LatePreventDefault
  IgnoreValidation
}

///|
pub extend Policy with Eq::{equal, not_equal}

///|
pub(all) enum Event {
  EditValid
  EditInvalid
  Input
  Submit
  Load
  DefaultAction
  Drain
}

///|
#derive(Eq, ToJson)
pub(all) struct State {
  value : Bool
  valid : Bool
  fired : Bool
  input : Bool
  submit : Bool
  rejected : Bool
  ready : Bool
  captured_value : Bool
  captured_valid : Bool
  prevented : Bool
  applied : Bool
  bad : Bool
  navigated : Bool
}

///|
pub extend State with Eq::{equal, not_equal}

///|
pub extend State with ToJson::{to_json}

///|
pub fn initial() -> State {
  {
    value: false,
    valid: false,
    fired: false,
    input: false,
    submit: false,
    rejected: false,
    ready: false,
    captured_value: false,
    captured_valid: false,
    prevented: false,
    applied: false,
    bad: false,
    navigated: false,
  }
}

///|
pub fn step(policy : Policy, state : State, event : Event) -> State? {
  match event {
    EditValid => Some({ ..state, value: true, valid: true, })
    EditInvalid => Some({ ..state, value: false, valid: false, })
    Input => {
      guard !state.fired else { return None }
      Some({
        ..state,
        fired: true,
        input: true,
        captured_value: state.value,
        captured_valid: state.valid,
      })
    }
    Submit => {
      guard !state.fired else { return None }
      Some({
        ..state,
        fired: true,
        submit: state.valid || policy == IgnoreValidation,
        rejected: !state.valid && policy != IgnoreValidation,
        captured_valid: state.valid,
        prevented: policy != LatePreventDefault,
      })
    }
    Load => {
      guard state.fired && !state.rejected else { return None }
      Some({ ..state, ready: true, })
    }
    DefaultAction => {
      guard state.fired && !state.input && state.captured_valid else {
        return None
      }
      Some({ ..state, navigated: state.navigated || !state.prevented, })
    }
    Drain => {
      guard state.ready && !state.applied && (state.input || state.submit) else {
        return None
      }
      let mismatch = state.input &&
        policy == ReadDomAfterImport &&
        (
          state.value != state.captured_value ||
          state.valid != state.captured_valid
        )
      Some({
        ..state,
        applied: true,
        prevented: state.prevented || state.submit,
        bad: state.bad || mismatch || (state.submit && !state.captured_valid),
      })
    }
  }
}

///|
/// One captured input OR submit, two sample DOM/validity pairs, one lazy import.
pub fn client(policy : Policy) -> @model_check.Client[State, Event, Json] raise {
  let spec : @model_check.Spec[State, Event, Json] = {
    initial: initial(),
    actions: [
      ("EditValid", EditValid),
      ("EditInvalid", EditInvalid),
      ("Input", Input),
      ("Submit", Submit),
      ("Load", Load),
      ("DefaultAction", DefaultAction),
      ("Drain", Drain),
    ],
    step: (state, event) => step(policy, state, event),
    predicates: [
      ("safe", state => !state.bad && !state.navigated),
      ("input_applied", state => state.input && state.applied),
      ("submit_applied", state => state.submit && state.applied),
      ("invalid_rejected", state => state.rejected && !state.applied),
    ],
    snapshot: state => state.to_json(),
    justice: [],
  }
  @model_check.build_client(spec, max_depth=16, max_states=256)
}
