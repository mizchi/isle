///|
#derive(Eq, ToJson)
pub(all) struct State {
  count : Int32
  width : Int32
  gutter : Int32
  horizontal : Bool
  compact : Bool
}

///|
pub extend State with Eq::{equal, not_equal}

///|
pub extend State with ToJson::{to_json}

///|
#derive(Eq)
pub(all) enum Action {
  Add
  Clear
  Toggle
  Width(Int32)
  Gutter(Int32)
  Horizontal
}

///|
pub extend Action with Eq::{equal, not_equal}

///|
pub fn client(
  unbounded : Bool,
  ignore_gutter : Bool,
) -> @model_check.Client[State, Action, Json] raise {
  let actions = [
    ("add", Add),
    ("clear", Clear),
    ("toggle", Toggle),
    ("horizontal", Horizontal),
    ("overlay", Gutter(0)),
    ("classic", Gutter(15)),
  ]
  for width in [95, 159, 160, 174, 175, 200] {
    actions.push(("width \{width}", Width(width)))
  }
  @model_check.build_client(
    {
      initial: {
        count: 1,
        width: 95,
        gutter: 0,
        horizontal: false,
        compact: false,
      },
      actions,
      step: (state, action) => {
        let next = match action {
          Add => {
            let limit = if unbounded { 5 } else { 4 }
            {
              ..state,
              count: if state.count < limit {
                state.count + 1
              } else {
                state.count
              },
            }
          }
          Clear => { ..state, count: 0, }
          Toggle => { ..state, compact: !state.compact, }
          Width(width) => { ..state, width, }
          Gutter(gutter) => { ..state, gutter, }
          Horizontal => { ..state, horizontal: !state.horizontal, }
        }
        if next == state {
          None
        } else {
          Some(next)
        }
      },
      predicates: [
        ("bounded-count", s => s.count >= 0 && s.count <= 4),
        (
          "fits-with-gutters",
          s => {
            let breakpoint = if ignore_gutter { 160 } else { 175 }
            let columns = if s.width < breakpoint { 2 } else { 4 }
            let height = 100 - (if s.horizontal { 15 } else { 0 })
            s.count == 0 || (s.width - s.gutter >= 40 * columns && height >= 20)
          },
        ),
      ],
      snapshot: s => s.to_json(),
      justice: [],
    },
    max_depth=16,
    max_states=1024,
  )
}

///|
#derive(ToJson)
pub(all) struct Report {
  complete : Bool
  states : Int32
  bounded_safe : Bool
  gutter_safe : Bool
  unbounded_witness : Array[Json]
  ignored_gutter_witness : Array[Json]
}

///|
pub extend Report with ToJson::{to_json}

///|
pub fn report() -> Report raise {
  let strict = client(false, false)
  let growing = client(true, false)
  let ignored = client(false, true)
  let bound = @model_check.Safety("bounded-count")
  let fit = @model_check.Safety("fits-with-gutters")
  let growth = @smt.exhaustive(growing.model, bound).witness.unwrap()
  let gutter = @smt.exhaustive(ignored.model, fit).witness.unwrap()
  guard growing.accepts(bound, growth) && ignored.accepts(fit, gutter) else {
    abort("layout counterexamples could not be replayed")
  }
  {
    complete: strict.model.exploration.unwrap().complete,
    states: strict.model.states.length(),
    bounded_safe: @smt.exhaustive(strict.model, bound).witness is None,
    gutter_safe: @smt.exhaustive(strict.model, fit).witness is None,
    unbounded_witness: growth.states.map(id => growing.model.states[id]),
    ignored_gutter_witness: gutter.states.map(id => ignored.model.states[id]),
  }
}
