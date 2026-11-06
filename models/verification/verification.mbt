///|
pub(all) struct CaseReport {
  name : String
  property : String
  formula : String
  category : String
  weak_fairness : Array[String]
  witness_loop_start : Int32?
  expected : String
  actual : String
  passed : Bool
  complete : Bool
  reachable_states : Int32
  visited : Int32
  witness_replayed : Bool
  witness_actions : Array[String]
  witness_states : Array[Json]
} derive(ToJson)

///|
pub extend CaseReport with ToJson::{to_json}

///|
pub(all) struct Report {
  version : Int32
  veri_version : String
  verification_method : String
  scope : String
  passed : Bool
  cases : Array[CaseReport]
} derive(ToJson)

///|
pub extend Report with ToJson::{to_json}

///|
fn[S : Eq, E] check(
  name : String,
  client : @model_check.Client[S, E, Json],
  property : @model_check.Property,
  expected : String,
  justice~ : Array[Int32] = [],
  category~ : String = "",
) -> CaseReport raise {
  guard client.model.exploration is Some(exploration) && exploration.complete else {
    abort("a truncated graph is not a complete finite model")
  }
  let result = @smt.exhaustive(client.model, property, justice~)
  let actual = match property {
    Safety(_) =>
      if result.witness is Some(_) {
        "counterexample"
      } else {
        "safe-for-complete-model"
      }
    Reachability(_) =>
      if result.witness is Some(_) {
        "witness"
      } else {
        "unreachable-in-complete-model"
      }
    Response(_, _) =>
      if result.witness is Some(_) {
        "counterexample"
      } else {
        "response-holds-for-complete-model-under-assumptions"
      }
    Deadlock(_) =>
      if result.witness is Some(_) {
        "counterexample"
      } else {
        "no-nonterminal-deadlock-in-complete-model"
      }
  }
  let (replayed, actions, states) = match result.witness {
    Some(witness) =>
      (
        client.accepts(property, witness, justice~),
        witness.actions.map(id => client.model.actions[id]),
        witness.states.map(id => client.model.states[id]),
      )
    None => (true, [], [])
  }
  {
    name,
    property: match property {
      Safety(predicate) => "safety:" + predicate
      Reachability(predicate) => "reachability:" + predicate
      Response(trigger, goal) => "response:" + trigger + "->" + goal
      Deadlock(terminal) => "deadlock:" + terminal
    },
    formula: match property {
      Safety(predicate) => "G(" + predicate + ")"
      Reachability(predicate) => "EF(" + predicate + ")"
      Response(trigger, goal) => "G(" + trigger + " -> F(" + goal + "))"
      Deadlock(terminal) => "AG(" + terminal + " or enabled)"
    },
    category: if category != "" {
      category
    } else if expected == "counterexample" {
      "broken-implementation"
    } else {
      "positive"
    },
    weak_fairness: justice.map(id => client.model.actions[id]),
    witness_loop_start: match result.witness {
      Some(witness) => witness.loop_start
      None => None
    },
    expected,
    actual,
    passed: actual == expected && replayed,
    complete: exploration.complete,
    reachable_states: client.states.length(),
    visited: result.visited,
    witness_replayed: result.witness is Some(_) && replayed,
    witness_actions: actions,
    witness_states: states,
  }
}

///|
/// No external solver is used: the finite reachable closures are exhausted.
pub fn run() -> Report raise {
  let owner = @owner.client(Strict)
  let security = @security.client(Strict)
  let cases = [
    check("owner/strict", owner, Safety("safe"), "safe-for-complete-model"),
    check(
      "owner/missing-generation",
      @owner.client(MissingGeneration),
      Safety("safe"),
      "counterexample",
    ),
  ]
  for predicate in ["applied", "cancelled", "failed"] {
    cases.push(
      check("owner/" + predicate, owner, Reachability(predicate), "witness"),
    )
  }
  cases.push(
    check(
      "security/strict",
      security,
      Safety("safe"),
      "safe-for-complete-model",
    ),
  )
  for
    pair in [
      ("payload-identity", @security.TrustPayloadIdentity),
      ("expired-permit", @security.TrustExpiredPermit),
      ("wrong-resource", @security.IgnoreResource),
    ] {
    let (name, policy) = pair
    cases.push(
      check(
        "security/" + name,
        @security.client(policy),
        Safety("safe"),
        "counterexample",
      ),
    )
  }
  for
    predicate in [
      "alice_committed", "bob_committed", "rejected", "revoked_rejected",
    ] {
    cases.push(
      check(
        "security/" + predicate,
        security,
        Reachability(predicate),
        "witness",
      ),
    )
  }
  let regions = @regions.client(Strict)
  cases.push(
    check("regions/strict", regions, Safety("safe"), "safe-for-complete-model"),
  )
  cases.push(
    check(
      "regions/key-only",
      @regions.client(KeyOnly),
      Safety("safe"),
      "counterexample",
    ),
  )
  for predicate in ["applied", "cancelled"] {
    cases.push(
      check("regions/" + predicate, regions, Reachability(predicate), "witness"),
    )
  }
  let forms = @forms.client(Strict)
  cases.push(
    check("forms/strict", forms, Safety("safe"), "safe-for-complete-model"),
  )
  for
    pair in [
      ("read-dom-after-import", @forms.ReadDomAfterImport),
      ("late-prevent-default", @forms.LatePreventDefault),
      ("ignore-validation", @forms.IgnoreValidation),
    ] {
    let (name, policy) = pair
    cases.push(
      check(
        "forms/" + name,
        @forms.client(policy),
        Safety("safe"),
        "counterexample",
      ),
    )
  }
  for predicate in ["input_applied", "submit_applied", "invalid_rejected"] {
    cases.push(
      check("forms/" + predicate, forms, Reachability(predicate), "witness"),
    )
  }
  let session = @form_session.client(Strict)
  cases.push(
    check(
      "form-session/strict",
      session,
      Safety("safe"),
      "safe-for-complete-model",
    ),
  )
  for
    pair in [
      ("ignore-revision", @form_session.IgnoreRevision),
      ("ignore-generation", @form_session.IgnoreGeneration),
      ("allow-duplicate", @form_session.AllowDuplicate),
    ] {
    let (name, policy) = pair
    cases.push(
      check(
        "form-session/" + name,
        @form_session.client(policy),
        Safety("safe"),
        "counterexample",
      ),
    )
  }
  for predicate in ["validated", "submitted", "reset_clean"] {
    cases.push(
      check(
        "form-session/" + predicate,
        session,
        Reachability(predicate),
        "witness",
      ),
    )
  }
  let cold = @resource_once.client(Strict, Cold)
  let seeded = @resource_once.client(Strict, SSRReady)
  for (label, model) in [("cold", cold), ("ssr-ready", seeded)] {
    for
      predicate in [
        "start_once", "settle_once", "current_owner", "terminal_stable", "retain_readable",
      ] {
      cases.push(
        check(
          "resource-once/" + label + "/" + predicate,
          model,
          Safety(predicate),
          "safe-for-complete-model",
        ),
      )
    }
  }
  for
    (label, policy, scenario, predicate) in [
      (
        "duplicate-start",
        @resource_once.DuplicateStart,
        @resource_once.Cold,
        "start_once",
      ),
      (
        "duplicate-settle",
        @resource_once.DuplicateSettle,
        @resource_once.Cold,
        "settle_once",
      ),
      (
        "ignore-generation",
        @resource_once.IgnoreGeneration,
        @resource_once.Cold,
        "current_owner",
      ),
      (
        "ignore-disposal",
        @resource_once.IgnoreDisposal,
        @resource_once.Cold,
        "current_owner",
      ),
      (
        "restart-snapshot",
        @resource_once.RestartSnapshot,
        @resource_once.SSRReady,
        "terminal_stable",
      ),
      (
        "drop-readable",
        @resource_once.DropReadable,
        @resource_once.Cold,
        "retain_readable",
      ),
    ] {
    cases.push(
      check(
        "resource-once/" + label,
        @resource_once.client(policy, scenario),
        Safety(predicate),
        "counterexample",
      ),
    )
  }
  for
    (trigger, goal) in [
      ("pending_first", "done_first"),
      ("pending_second", "done_second"),
    ] {
    cases.push(
      check(
        "resource-once/fair-response/" + trigger,
        cold,
        Response(trigger, goal),
        "response-holds-for-complete-model-under-assumptions",
        justice=cold.model.justice,
      ),
    )
  }
  for
    (label, justice) in [
      ("without-fairness", []),
      ("without-delivery-fairness", @resource_once.producer_fairness(cold)),
    ] {
    cases.push(
      check(
        "resource-once/" + label,
        cold,
        Response("pending_first", "done_first"),
        "counterexample",
        justice~,
        category="missing-assumption",
      ),
    )
  }
  let lost = @resource_once.client(LoseCompletion, Cold)
  cases.push(
    check(
      "resource-once/lost-completion",
      lost,
      Response("pending_first", "done_first"),
      "counterexample",
      justice=lost.model.justice,
    ),
  )
  for predicate in ["ready_first", "failed_first", "disposed", "ready_second"] {
    cases.push(
      check(
        "resource-once/reachable/" + predicate,
        cold,
        Reachability(predicate),
        "witness",
      ),
    )
  }
  let pair = @resource_once.pair_client()
  cases.push(
    check(
      "resource-pair/values-once",
      pair,
      Safety("values_once"),
      "safe-for-complete-model",
    ),
  )
  cases.push(
    check(
      "resource-pair/component-once",
      pair,
      Safety("component_once"),
      "counterexample",
      category="insufficient-contract",
    ),
  )
  cases.push(
    check(
      "resource-pair/fair-response",
      pair,
      Response("pending", "done"),
      "response-holds-for-complete-model-under-assumptions",
      justice=pair.model.justice,
    ),
  )
  cases.push(
    check(
      "resource-pair/two-commits",
      pair,
      Reachability("two_commits"),
      "witness",
    ),
  )
  let disposal = @resource_disposal.client(Strict)
  for
    predicate in [
      "release_once", "only_acquired", "no_early_release", "current_publication",
      "abort_requested", "abort_once",
    ] {
    cases.push(
      check(
        "resource-disposal/strict/" + predicate,
        disposal,
        Safety(predicate),
        "safe-for-complete-model",
      ),
    )
  }
  for index in ["0", "1"] {
    cases.push(
      check(
        "resource-disposal/eventual-release-attempt/" + index,
        disposal,
        Response("needs_release" + index, "release_attempted" + index),
        "response-holds-for-complete-model-under-assumptions",
        justice=@resource_disposal.release_fairness(disposal),
      ),
    )
    cases.push(
      check(
        "resource-disposal/eventual-release-settlement/" + index,
        disposal,
        Response("releasing" + index, "release_settled" + index),
        "response-holds-for-complete-model-under-assumptions",
        justice=disposal.model.justice,
      ),
    )
  }
  for
    (label, policy, predicate) in [
      ("double-release", @resource_disposal.DoubleRelease, "release_once"),
      (
        "release-unacquired",
        @resource_disposal.ReleaseWithoutAcquire,
        "only_acquired",
      ),
      (
        "premature-release",
        @resource_disposal.PrematureRelease,
        "no_early_release",
      ),
      ("ignore-owner", @resource_disposal.IgnoreOwner, "current_publication"),
      ("forget-abort", @resource_disposal.ForgetAbort, "abort_requested"),
      ("double-abort", @resource_disposal.DoubleAbort, "abort_once"),
    ] {
    cases.push(
      check(
        "resource-disposal/" + label,
        @resource_disposal.client(policy),
        Safety(predicate),
        "counterexample",
      ),
    )
  }
  for
    (label, policy) in [
      ("drop-late", @resource_disposal.DropLate),
      ("leak-ready", @resource_disposal.LeakReady),
      ("stop-after-failure", @resource_disposal.StopAfterFailure),
    ] {
    let broken = @resource_disposal.client(policy)
    cases.push(
      check(
        "resource-disposal/" + label,
        broken,
        Response("needs_release1", "release_attempted1"),
        "counterexample",
        justice=@resource_disposal.release_fairness(broken),
      ),
    )
  }
  for
    predicate in [
      "released", "release_failed", "late_released", "new_owner_ready",
    ] {
    cases.push(
      check(
        "resource-disposal/reachable/" + predicate,
        disposal,
        Reachability(predicate),
        "witness",
      ),
    )
  }
  cases.push(
    check(
      "resource-disposal/no-release-fairness",
      disposal,
      Response("needs_release0", "release_attempted0"),
      "counterexample",
      category="missing-assumption",
    ),
  )
  cases.push(
    check(
      "resource-disposal/no-destructor-completion",
      disposal,
      Response("releasing0", "release_settled0"),
      "counterexample",
      justice=@resource_disposal.release_fairness(disposal),
      category="missing-assumption",
    ),
  )
  cases.push(
    check(
      "resource-disposal/physical-release-is-not-guaranteed",
      disposal,
      Response("needs_release0", "released0"),
      "counterexample",
      justice=disposal.model.justice,
      category="insufficient-contract",
    ),
  )
  let styles = @style_resolution.client(Strict)
  cases.push(
    check(
      "style-resolution/strict",
      styles,
      Safety("safe"),
      "safe-for-complete-model",
    ),
  )
  for predicate in ["activated", "committed", "cancelled"] {
    cases.push(
      check(
        "style-resolution/" + predicate,
        styles,
        Reachability(predicate),
        "witness",
      ),
    )
  }
  for
    (name, policy) in [
      ("skip-css", @style_resolution.SkipCSS),
      ("ignore-owner", @style_resolution.IgnoreOwner),
    ] {
    cases.push(
      check(
        "style-resolution/" + name,
        @style_resolution.client(policy),
        Safety("safe"),
        "counterexample",
      ),
    )
  }
  {
    version: 2,
    veri_version: "0.2.1",
    verification_method: "finite-exhaustive-safety-and-fair-response-with-witness-replay",
    scope: "style_resolution: 1 owner lifetime, code/CSS fetch, export/CSS readiness, activation/commit/unmount; resource_disposal: 2 resources, 2 owner lifetimes, acquisition/abort/release/error, infinite paths in finite graph; resource_once: 1 resource, 2 owner lifetimes, 2 tickets, 3 payloads and a freed-value marker, cold/SSR-ready, infinite paths in the finite graph; resource_pair: 2 resources, 2 commits; regions: 1 live parent, 1 row key, 2 element lifetimes, 1 move, 1 event; owner: 1 scope ID, 2 generations, 1 event, 1 chunk; security: 2 actors, 2 documents, 1 request, 1 revocation; forms: 1 input or submit, 2 DOM/validity samples, 1 import; form-session: 2 revisions, 2 generations, 1 validation, 1 submit with a duplicate attempt, 1 reset",
    passed: cases.all(case => case.passed),
    cases,
  }
}
