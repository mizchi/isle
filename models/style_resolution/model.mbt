///|
#derive(Eq)
pub(all) enum Policy {
  Strict
  SkipCSS
  IgnoreOwner
}

///|
pub extend Policy with Eq::{equal, not_equal}

///|
#derive(Eq)
pub(all) enum Event {
  FetchCode
  FetchCSS
  Resume
  ResolveCode
  PrepareCSS
  ApplyCSS
  Unmount
  Activate
  Commit
}

///|
pub extend Event with Eq::{equal, not_equal}

///|
#derive(Eq, ToJson)
pub(all) struct State {
  code_fetched : Bool
  css_fetched : Bool
  resumed : Bool
  resolved : Bool
  css_ready : Bool
  css_applied : Bool
  live : Bool
  activated : Bool
  committed : Bool
  early : Bool
  stale : Bool
}

///|
pub extend State with Eq::{equal, not_equal}

///|
pub extend State with ToJson::{to_json}

///|
pub fn step(policy : Policy, s : State, event : Event) -> State? {
  match event {
    FetchCode => {
      guard !s.code_fetched else { return None }
      Some({ ..s, code_fetched: true, })
    }
    FetchCSS => {
      guard !s.css_fetched else { return None }
      Some({ ..s, css_fetched: true, })
    }
    Resume => {
      guard s.live && !s.resumed else { return None }
      Some({ ..s, resumed: true, })
    }
    ResolveCode => {
      guard s.resumed && s.code_fetched && s.css_applied && !s.resolved else {
        return None
      }
      Some({ ..s, resolved: true, })
    }
    PrepareCSS => {
      guard s.resumed && s.css_fetched && !s.css_ready else { return None }
      Some({ ..s, css_ready: true, })
    }
    ApplyCSS => {
      guard s.resumed &&
        !s.css_applied &&
        (s.css_ready || policy == SkipCSS) &&
        (s.live || policy == IgnoreOwner) else {
        return None
      }
      Some({ ..s, css_applied: true, early: !s.css_ready, stale: !s.live, })
    }
    Unmount => {
      guard s.live else { return None }
      Some({ ..s, live: false, })
    }
    Activate => {
      guard s.resolved &&
        !s.activated &&
        s.css_applied &&
        (s.live || policy == IgnoreOwner) else {
        return None
      }
      Some({
        ..s,
        activated: true,
        early: s.early || !s.css_ready,
        stale: s.stale || !s.live,
      })
    }
    Commit => {
      guard s.activated && !s.committed && (s.live || policy == IgnoreOwner) else {
        return None
      }
      Some({ ..s, committed: true, stale: s.stale || !s.live, })
    }
  }
}

///|
pub fn client(policy : Policy) -> @model_check.Client[State, Event, Json] raise {
  @model_check.build_client(
    {
      initial: {
        code_fetched: false,
        css_fetched: false,
        resumed: false,
        resolved: false,
        css_ready: false,
        css_applied: false,
        live: true,
        activated: false,
        committed: false,
        early: false,
        stale: false,
      },
      actions: [
        ("FetchCode", FetchCode),
        ("FetchCSS", FetchCSS),
        ("Resume", Resume),
        ("ResolveCode", ResolveCode),
        ("PrepareCSS", PrepareCSS),
        ("ApplyCSS", ApplyCSS),
        ("Unmount", Unmount),
        ("Activate", Activate),
        ("Commit", Commit),
      ],
      step: (state, event) => step(policy, state, event),
      predicates: [
        ("safe", state => !state.early && !state.stale),
        ("activated", state => state.activated),
        ("committed", state => state.committed),
        ("cancelled", state => state.resumed && !state.live && !state.activated),
      ],
      snapshot: state => state.to_json(),
      justice: [],
    },
    max_depth=12,
    max_states=512,
  )
}
