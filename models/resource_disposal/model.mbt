///|
pub(all) enum Policy {
  Strict
  DoubleRelease
  ReleaseWithoutAcquire
  PrematureRelease
  IgnoreOwner
  ForgetAbort
  DoubleAbort
  DropLate
  LeakReady
  StopAfterFailure
} derive(Eq)

///|
pub extend Policy with Eq::{equal, not_equal}

///|
pub(all) enum Phase {
  Unused
  Acquiring
  Acquired
  Published
  AcquireFailed
  Releasing
  Released
  ReleaseFailed
} derive(Eq, ToJson)

///|
pub extend Phase with Eq::{equal, not_equal}

///|
pub extend Phase with ToJson::{to_json}

///|
pub(all) struct Resource {
  phase : Phase
  second : Bool
  acquired : Bool
  published : Bool
  late : Bool
  aborts : Int32
  releases : Int32
} derive(Eq, ToJson)

///|
pub extend Resource with Eq::{equal, not_equal}

///|
pub extend Resource with ToJson::{to_json}

///|
pub(all) struct State {
  alive : Bool
  second : Bool
  resources : FixedArray[Resource]
  early_release : Bool
  invalid_publish : Bool
} derive(Eq, ToJson)

///|
pub extend State with Eq::{equal, not_equal}

///|
pub extend State with ToJson::{to_json}

///|
pub(all) enum Event {
  Start(Int32)
  Acquire(Int32)
  AcquireFails(Int32)
  Publish(Int32)
  Unmount
  Recreate
  BeginRelease(Int32)
  FinishRelease(Int32)
  FailRelease(Int32)
  Tick
}

///|
pub fn initial() -> State {
  let empty = {
    phase: Unused,
    second: false,
    acquired: false,
    published: false,
    late: false,
    aborts: 0,
    releases: 0,
  }
  {
    alive: true,
    second: false,
    resources: [empty, empty],
    early_release: false,
    invalid_publish: false,
  }
}

///|
fn abandoned(s : State, r : Resource) -> Bool {
  !s.alive || s.second != r.second
}

///|
fn needs_release(s : State, r : Resource) -> Bool {
  r.acquired && r.releases == 0 && abandoned(s, r)
}

///|
fn replace(s : State, index : Int32, r : Resource) -> State {
  let resources = s.resources.copy()
  resources[index] = r
  { ..s, resources, }
}

///|
pub fn step(policy : Policy, s : State, event : Event) -> State? {
  match event {
    Unmount => {
      if !s.alive && policy != DoubleAbort {
        return Some(s)
      }
      let resources = s.resources.map(r => {
        if r.phase == Unused || r.second != s.second || policy == ForgetAbort {
          r
        } else {
          { ..r, aborts: if r.aborts < 2 { r.aborts + 1 } else { 2 }, }
        }
      })
      Some({ ..s, alive: false, resources, })
    }
    Recreate => {
      guard !s.alive && !s.second else { return None }
      Some({ ..s, alive: true, second: true, })
    }
    Tick => Some(s)
    Start(index)
    | Acquire(index)
    | AcquireFails(index)
    | Publish(index)
    | BeginRelease(index)
    | FinishRelease(index)
    | FailRelease(index) => {
      guard index >= 0 && index < 2 else { return None }
      let r = s.resources[index]
      match event {
        Start(_) => {
          guard s.alive && r.phase == Unused else { return None }
          Some(replace(s, index, { ..r, phase: Acquiring, second: s.second, }))
        }
        Acquire(_) => {
          guard r.phase == Acquiring else { return None }
          Some(
            replace(s, index, {
              ..r,
              phase: Acquired,
              acquired: true,
              late: abandoned(s, r),
            }),
          )
        }
        AcquireFails(_) => {
          guard r.phase == Acquiring else { return None }
          Some(replace(s, index, { ..r, phase: AcquireFailed, }))
        }
        Publish(_) => {
          guard r.phase == Acquired &&
            (!abandoned(s, r) || policy == IgnoreOwner) else {
            return None
          }
          Some({
            ..replace(s, index, { ..r, phase: Published, published: true, }),
            invalid_publish: s.invalid_publish || abandoned(s, r),
          })
        }
        BeginRelease(_) => {
          let bad_empty = policy == ReleaseWithoutAcquire &&
            (r.phase == Acquiring || r.phase == AcquireFailed)
          let repeat = policy == DoubleRelease && r.releases == 1
          guard (r.acquired || bad_empty) &&
            (r.releases == 0 || repeat) &&
            (abandoned(s, r) || policy == PrematureRelease) else {
            return None
          }
          if (policy == DropLate && r.late) ||
            (policy == LeakReady && r.published) ||
            (
              policy == StopAfterFailure &&
              s.resources.any(other => other.phase == ReleaseFailed)
            ) {
            return None
          }
          Some({
            ..replace(s, index, {
              ..r,
              phase: Releasing,
              releases: r.releases + 1,
            }),
            early_release: s.early_release || !abandoned(s, r),
          })
        }
        FinishRelease(_) | FailRelease(_) => {
          guard r.phase == Releasing else { return None }
          Some(
            replace(s, index, {
              ..r,
              phase: if event is FinishRelease(_) {
                Released
              } else {
                ReleaseFailed
              },
            }),
          )
        }
        _ => None
      }
    }
  }
}

///|
pub fn client(policy : Policy) -> @model_check.Client[State, Event, Json] raise {
  let predicates : Array[(String, (State) -> Bool)] = [
    ("release_once", s => s.resources.all(r => r.releases <= 1)),
    ("only_acquired", s => s.resources.all(r => r.releases == 0 || r.acquired)),
    ("no_early_release", s => !s.early_release),
    ("current_publication", s => !s.invalid_publish),
    (
      "abort_requested",
      s => {
        s.resources.all(r => {
          r.phase != Acquiring || !abandoned(s, r) || r.aborts == 1
        })
      },
    ),
    ("abort_once", s => s.resources.all(r => r.aborts <= 1)),
    ("released", s => s.resources.any(r => r.phase == Released)),
    ("release_failed", s => s.resources.any(r => r.phase == ReleaseFailed)),
    ("late_released", s => s.resources.any(r => r.phase == Released && r.late)),
    (
      "new_owner_ready",
      s => {
        s.alive &&
        s.second &&
        s.resources.any(r => r.second && r.phase == Published)
      },
    ),
  ]
  for index in [0, 1] {
    predicates.push(
      (
        "needs_release" + index.to_string(),
        s => needs_release(s, s.resources[index]),
      ),
    )
    predicates.push(
      (
        "released" + index.to_string(),
        s => s.resources[index].phase == Released,
      ),
    )
    predicates.push(
      (
        "release_attempted" + index.to_string(),
        s => s.resources[index].releases > 0,
      ),
    )
    predicates.push(
      (
        "releasing" + index.to_string(),
        s => s.resources[index].phase == Releasing,
      ),
    )
    predicates.push(
      (
        "release_settled" + index.to_string(),
        s => {
          s.resources[index].phase == Released ||
          s.resources[index].phase == ReleaseFailed
        },
      ),
    )
  }
  @model_check.build_client(
    {
      initial: initial(),
      actions: [
        ("Start0", Start(0)),
        ("Start1", Start(1)),
        ("Acquire0", Acquire(0)),
        ("Acquire1", Acquire(1)),
        ("AcquireFails0", AcquireFails(0)),
        ("AcquireFails1", AcquireFails(1)),
        ("Publish0", Publish(0)),
        ("Publish1", Publish(1)),
        ("Unmount", Unmount),
        ("Recreate", Recreate),
        ("BeginRelease0", BeginRelease(0)),
        ("BeginRelease1", BeginRelease(1)),
        ("FinishRelease0", FinishRelease(0)),
        ("FinishRelease1", FinishRelease(1)),
        ("FailRelease0", FailRelease(0)),
        ("FailRelease1", FailRelease(1)),
        ("Tick", Tick),
      ],
      step: (s, event) => step(policy, s, event),
      predicates,
      snapshot: s => s.to_json(),
      justice: [
        "BeginRelease0", "BeginRelease1", "FinishRelease0", "FinishRelease1",
      ],
    },
    max_depth=40,
    max_states=10000,
  )
}

///|
pub fn release_fairness(
  c : @model_check.Client[State, Event, Json],
) -> Array[Int32] {
  c.model.justice.filter(id => c.model.actions[id].has_prefix("BeginRelease"))
}
