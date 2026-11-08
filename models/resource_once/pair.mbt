///|
/// Independent resources may publish in different transactions.
/// This model permits that schedule; it does not require all implementations to avoid batching.
#derive(Eq, ToJson)
pub(all) struct PairState {
  left : Int32
  right : Int32
  commits : Int32
}

///|
pub extend PairState with Eq::{equal, not_equal}

///|
pub extend PairState with ToJson::{to_json}

///|
pub(all) enum PairEvent {
  LeftCompletes
  RightCompletes
  PairTick
}

///|
pub fn pair_client() -> @model_check.Client[PairState, PairEvent, Json] raise {
  @model_check.build_client(
    {
      initial: { left: 0, right: 0, commits: 0, },
      actions: [
        ("LeftCompletes", LeftCompletes),
        ("RightCompletes", RightCompletes),
        ("Tick", PairTick),
      ],
      step: (s, event) => {
        match event {
          LeftCompletes =>
            if s.left == 0 {
              Some({ ..s, left: 1, commits: s.commits + 1, })
            } else {
              None
            }
          RightCompletes =>
            if s.right == 0 {
              Some({ ..s, right: 1, commits: s.commits + 1, })
            } else {
              None
            }
          PairTick => Some(s)
        }
      },
      predicates: [
        ("values_once", s => s.left <= 1 && s.right <= 1),
        ("component_once", s => s.commits <= 1),
        ("pending", s => s.left == 0 || s.right == 0),
        ("done", s => s.left == 1 && s.right == 1),
        ("two_commits", s => s.commits == 2),
      ],
      snapshot: s => s.to_json(),
      justice: ["LeftCompletes", "RightCompletes"],
    },
    max_depth=8,
    max_states=16,
  )
}
