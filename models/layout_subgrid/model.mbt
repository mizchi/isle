///|
#derive(Eq, ToJson)
pub(all) struct Configuration {
  start : Int32
  span : Int32
  gap : Int32
  before : Int32
  after : Int32
}

///|
pub extend Configuration with Eq::{equal, not_equal}

///|
pub extend Configuration with ToJson::{to_json}

///|
/// Result is in doubled input units; half-gap adjustments remain exact.
pub fn inherit_axis(
  tracks : Array[Int32],
  parent_gap : Int32,
  gap : Int32,
  before : Int32,
  after : Int32,
) -> Array[Int32] {
  tracks.mapi((i, size) => {
    let left = if i == 0 { -2 * before } else { parent_gap - gap }
    let right = if i == tracks.length() - 1 {
      -2 * after
    } else {
      parent_gap - gap
    }
    2 * size + left + right
  })
}

///|
fn parent(c : Configuration) -> Array[Int32] {
  let tracks = [4, 8, 12]
  Array::makei(c.span, i => tracks[c.start + i])
}

///|
fn geometry(c : Configuration, independent : Bool) -> Array[Int32] {
  let result = inherit_axis(parent(c), 2, c.gap, c.before, c.after)
  if independent {
    // Broken nested grid: redistributes space and loses the parent's lines.
    let total = result.fold(init=0, (sum, value) => sum + value)
    Array::make(c.span, total / c.span)
  } else {
    result
  }
}

///|
fn shared_lines(c : Configuration, independent : Bool) -> Bool {
  let tracks = parent(c)
  let sizes = geometry(c, independent)
  let mut child_prefix = 2 * c.before
  let mut parent_prefix = 0
  for i = 0; i < c.span; i = i + 1 {
    child_prefix = child_prefix + sizes[i]
    parent_prefix = parent_prefix + 2 * tracks[i]
    if i < c.span - 1 {
      // Compare gutter centers, rather than either edge of a different gap.
      if child_prefix + c.gap != parent_prefix + 2 {
        return false
      }
      child_prefix = child_prefix + 2 * c.gap
      parent_prefix = parent_prefix + 4
    }
  }
  child_prefix + 2 * c.after == parent_prefix
}

///|
pub fn client(
  independent : Bool,
) -> @model_check.Client[Configuration, Configuration, Json] raise {
  let configurations = []
  for start = 0; start < 3; start = start + 1 {
    for span = 1; span <= 3 - start; span = span + 1 {
      for gap in [0, 2, 4] {
        for before in [0, 1, 2] {
          for after in [0, 1, 2] {
            configurations.push({ start, span, gap, before, after, })
          }
        }
      }
    }
  }
  @model_check.build_client(
    {
      initial: configurations[0],
      // These are parameter selections, not UI events or lifecycle claims.
      actions: configurations.map(c => {
        (
          "select \{c.start}:\{c.span}, gap \{c.gap}, insets \{c.before}/\{c.after}",
          c,
        )
      }),
      step: (current, selected) => {
        if current == selected {
          None
        } else {
          Some(selected)
        }
      },
      predicates: [
        ("shared-lines-and-extent", c => shared_lines(c, independent)),
        ("three-tracks", c => c.span == 3),
      ],
      snapshot: c => c.to_json(),
      justice: [],
    },
    max_depth=2,
    max_states=256,
  )
}

///|
#derive(ToJson)
pub(all) struct AxisCase {
  configuration : Configuration
  doubled : Array[Int32]
  nested_quadrupled : Array[Int32]
}

///|
pub extend AxisCase with ToJson::{to_json}

///|
#derive(ToJson)
pub(all) struct Report {
  veri_version : String
  complete : Bool
  reachable_configurations : Int32
  strict_safe : Bool
  independent_counterexample_replayed : Bool
  witness : Array[Json]
  cases : Array[AxisCase]
}

///|
pub extend Report with ToJson::{to_json}

///|
pub fn report() -> Report raise {
  let strict = client(false)
  let broken = client(true)
  let property = @model_check.Safety("shared-lines-and-extent")
  let witness = @smt.exhaustive(broken.model, property).witness.unwrap()
  {
    veri_version: "0.2.1",
    complete: strict.model.exploration.unwrap().complete &&
    broken.model.exploration.unwrap().complete,
    reachable_configurations: strict.states.length(),
    strict_safe: @smt.exhaustive(strict.model, property).witness is None,
    independent_counterexample_replayed: broken.accepts(property, witness),
    witness: witness.states.map(id => broken.model.states[id]),
    cases: strict.states.map(c => {
      let doubled = geometry(c, false)
      {
        configuration: c,
        doubled,
        nested_quadrupled: inherit_axis(doubled, 2 * c.gap, 2, 2, 0),
      }
    }),
  }
}
