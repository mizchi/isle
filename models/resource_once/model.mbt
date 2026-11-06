///|
pub(all) enum Policy {
  Strict
  DuplicateStart
  DuplicateSettle
  IgnoreGeneration
  IgnoreDisposal
  RestartSnapshot
  DropReadable
  LoseCompletion
} derive(Eq)

///|
pub extend Policy with Eq::{equal, not_equal}

///|
pub(all) enum Scenario {
  Cold
  SSRReady
} derive(Eq)

///|
pub extend Scenario with Eq::{equal, not_equal}

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
/// Three observable payloads plus an invalid freed-payload marker.
pub(all) enum Value {
  Seed
  Left
  Right
  Missing
} derive(Eq, ToJson)

///|
pub extend Value with Eq::{equal, not_equal}

///|
pub extend Value with ToJson::{to_json}

///|
pub(all) enum Phase {
  Dormant
  Pending
  Ready(Value)
  Failed
  Disposed
} derive(Eq, ToJson)

///|
pub extend Phase with Eq::{equal, not_equal}

///|
pub extend Phase with ToJson::{to_json}

///|
pub(all) enum Outcome {
  Success(Value)
  Failure
} derive(Eq, ToJson)

///|
pub extend Outcome with Eq::{equal, not_equal}

///|
pub extend Outcome with ToJson::{to_json}

///|
/// The producer and delivery are distinct asynchronous steps.
pub(all) enum Job {
  Unused
  Running(Generation)
  Completed(Generation, Outcome)
  Delivered(Generation, Outcome)
} derive(Eq, ToJson)

///|
pub extend Job with Eq::{equal, not_equal}

///|
pub extend Job with ToJson::{to_json}

///|
pub(all) enum Event {
  Resume
  Start
  Succeed(Int32)
  Fail(Int32)
  Publish(Int32)
  AdvanceProducer(Int32)
  DeliverCurrent(Int32)
  Dispose
  Recreate
  ReleaseContinuation
  Read
  Tick
}

///|
/// One resource, two owner lifetimes and two in-flight tickets in total.
/// Counters saturate at two; two is the first violating value, never a wraparound.
/// The violation bits are history monitors, not runtime data structures.
pub(all) struct State {
  alive : Bool
  generation : Generation
  resumed : Bool
  phase : Phase
  jobs : FixedArray[Job]
  starts : Int32
  settlements : Int32
  invalid_commit : Bool
  terminal_changed : Bool
  continuation : Bool
} derive(Eq, ToJson)

///|
pub extend State with Eq::{equal, not_equal}

///|
pub extend State with ToJson::{to_json}

///|
pub fn initial(scenario : Scenario) -> State {
  let seeded = scenario == SSRReady
  {
    alive: true,
    generation: First,
    resumed: false,
    phase: if seeded {
      Ready(Seed)
    } else {
      Dormant
    },
    jobs: [Unused, Unused],
    starts: if seeded {
      1
    } else {
      0
    },
    settlements: if seeded {
      1
    } else {
      0
    },
    invalid_commit: false,
    terminal_changed: false,
    continuation: false,
  }
}

///|
fn terminal(phase : Phase) -> Bool {
  match phase {
    Ready(_) | Failed => true
    _ => false
  }
}

///|
fn replace_job(s : State, index : Int32, job : Job) -> State {
  let jobs = s.jobs.copy()
  jobs[index] = job
  { ..s, jobs, }
}

///|
pub fn step(policy : Policy, s : State, event : Event) -> State? {
  match event {
    Resume => {
      guard s.alive && !s.resumed else { return None }
      let restart = policy == RestartSnapshot && terminal(s.phase)
      Some({
        ..s,
        resumed: true,
        phase: if restart {
          Dormant
        } else {
          s.phase
        },
        terminal_changed: s.terminal_changed || restart,
      })
    }
    Start => {
      guard s.alive &&
        s.resumed &&
        s.starts < 2 &&
        (s.phase == Dormant || (policy == DuplicateStart && s.phase == Pending)) else {
        return None
      }
      let free = if s.jobs[0] == Unused {
        0
      } else if s.jobs[1] == Unused {
        1
      } else {
        return None
      }
      Some({
        ..replace_job(s, free, Running(s.generation)),
        phase: Pending,
        starts: s.starts + 1,
        continuation: true,
      })
    }
    Succeed(index) | Fail(index) => {
      guard index >= 0 && index < 2 else { return None }
      guard s.jobs[index] is Running(generation) else { return None }
      let outcome = match event {
        Succeed(_) => Success(if index == 0 { Left } else { Right })
        _ => Failure
      }
      Some(replace_job(s, index, Completed(generation, outcome)))
    }
    Publish(index) => {
      guard index >= 0 && index < 2 else { return None }
      let (generation, outcome) = match s.jobs[index] {
        Completed(generation, outcome) => (generation, outcome)
        Delivered(generation, outcome) => {
          guard policy == DuplicateSettle && s.settlements < 2 else {
            return None
          }
          (generation, outcome)
        }
        _ => return None
      }
      let next = replace_job(s, index, Delivered(generation, outcome))
      let owns = (s.alive || policy == IgnoreDisposal) &&
        (generation == s.generation || policy == IgnoreGeneration)
      let writable = s.phase == Pending ||
        (policy == IgnoreDisposal && s.phase == Disposed) ||
        (policy == DuplicateSettle && terminal(s.phase) && s.settlements < 2)
      if !owns || !writable || policy == LoseCompletion {
        return Some(next)
      }
      let phase = match outcome {
        Success(value) => Ready(value)
        Failure => Failed
      }
      Some({
        ..next,
        phase,
        settlements: if s.settlements < 2 {
          s.settlements + 1
        } else {
          2
        },
        invalid_commit: s.invalid_commit ||
        !s.alive ||
        generation != s.generation,
        terminal_changed: s.terminal_changed ||
        (terminal(s.phase) && phase != s.phase),
      })
    }
    AdvanceProducer(index) => {
      guard index >= 0 && index < 2 && s.alive && s.phase == Pending else {
        return None
      }
      guard s.jobs[index] is Running(generation) && generation == s.generation else {
        return None
      }
      step(policy, s, Succeed(index))
    }
    DeliverCurrent(index) => {
      guard index >= 0 && index < 2 && s.alive && s.phase == Pending else {
        return None
      }
      guard s.jobs[index] is Completed(generation, _) &&
        generation == s.generation else {
        return None
      }
      step(policy, s, Publish(index))
    }
    Dispose => {
      guard s.alive else { return None }
      Some({ ..s, alive: false, phase: Disposed, continuation: false, })
    }
    Recreate => {
      guard !s.alive && s.generation == First else { return None }
      Some({
        ..s,
        alive: true,
        generation: Second,
        resumed: false,
        phase: Dormant,
        starts: 0,
        settlements: 0,
        continuation: false,
      })
    }
    ReleaseContinuation => {
      guard s.alive && terminal(s.phase) && s.continuation else { return None }
      let phase = if policy == DropReadable && s.phase is Ready(_) {
        Ready(Missing)
      } else {
        s.phase
      }
      Some({
        ..s,
        continuation: false,
        phase,
        terminal_changed: s.terminal_changed || phase != s.phase,
      })
    }
    // Reads do not consume the value or its capability. Tick permits infinite stuttering.
    Read => if s.alive && s.phase is Ready(_) { Some(s) } else { None }
    Tick => Some(s)
  }
}

///|
fn done_for(s : State, generation : Generation) -> Bool {
  s.generation != generation || !s.alive || terminal(s.phase)
}

///|
pub fn client(
  policy : Policy,
  scenario : Scenario,
) -> @model_check.Client[State, Event, Json] raise {
  @model_check.build_client(
    {
      initial: initial(scenario),
      actions: [
        ("Resume", Resume),
        ("Start", Start),
        ("Succeed0", Succeed(0)),
        ("Succeed1", Succeed(1)),
        ("Fail0", Fail(0)),
        ("Fail1", Fail(1)),
        ("Publish0", Publish(0)),
        ("Publish1", Publish(1)),
        ("AdvanceProducer0", AdvanceProducer(0)),
        ("AdvanceProducer1", AdvanceProducer(1)),
        ("DeliverCurrent0", DeliverCurrent(0)),
        ("DeliverCurrent1", DeliverCurrent(1)),
        ("Dispose", Dispose),
        ("Recreate", Recreate),
        ("ReleaseContinuation", ReleaseContinuation),
        ("Read", Read),
        ("Tick", Tick),
      ],
      step: (s, event) => step(policy, s, event),
      predicates: [
        ("start_once", s => s.starts <= 1),
        ("settle_once", s => s.settlements <= 1),
        ("current_owner", s => !s.invalid_commit),
        ("terminal_stable", s => !s.terminal_changed),
        ("retain_readable", s => !(s.alive && s.phase == Ready(Missing))),
        (
          "pending_first",
          s => s.alive && s.generation == First && s.phase == Pending,
        ),
        (
          "pending_second",
          s => s.alive && s.generation == Second && s.phase == Pending,
        ),
        ("done_first", s => done_for(s, First)),
        ("done_second", s => done_for(s, Second)),
        (
          "ready_first",
          s => s.alive && s.generation == First && s.phase is Ready(_),
        ),
        (
          "ready_second",
          s => s.alive && s.generation == Second && s.phase is Ready(_),
        ),
        (
          "failed_first",
          s => s.alive && s.generation == First && s.phase == Failed,
        ),
        ("disposed", s => !s.alive),
      ],
      snapshot: s => s.to_json(),
      // Explicit assumptions apply only to currently live work, not to abandoned requests.
      // Failure can disable Succeed; either result suffices. These IDs are NOT applied implicitly.
      justice: [
        "AdvanceProducer0", "AdvanceProducer1", "DeliverCurrent0", "DeliverCurrent1",
      ],
    },
    max_depth=40,
    max_states=10000,
  )
}

///|
pub fn producer_fairness(
  c : @model_check.Client[State, Event, Json],
) -> Array[Int32] {
  c.model.justice.filter(id => c.model.actions[id].has_prefix("AdvanceProducer"))
}
