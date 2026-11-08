///|
#derive(Eq, Debug)
pub(all) struct Store {
  alpha : Int32
  beta : Int32
}

///|
pub extend Store with Eq::{equal, not_equal}

///|
pub extend Store with @debug.Debug::{to_repr}

///|
/// Pure two-record store model: actor 0 owns record 0; actor 1 owns record 1.
/// This verifies returned values, not an external database or generated JS.
pub fn commit(
  actor : Int32,
  target : Int32,
  permit_actor : Int32,
  permit_target : Int32,
  revoked : Bool,
  before_alpha : Int32,
  before_beta : Int32,
  value : Int32,
) -> Store where {
  proof_ensure: result => {
    !authorized(actor, target, permit_actor, permit_target, revoked) →
    result.alpha == before_alpha && result.beta == before_beta
  },
  proof_ensure: result => target != 0 → result.alpha == before_alpha,
  proof_ensure: result => target != 1 → result.beta == before_beta,
  proof_ensure: result => {
    authorized(actor, target, permit_actor, permit_target, revoked) &&
    target == 0 →
    result.alpha == value && result.beta == before_beta
  },
  proof_ensure: result => {
    authorized(actor, target, permit_actor, permit_target, revoked) &&
    target == 1 →
    result.alpha == before_alpha && result.beta == value
  },
} {
  if (actor != 0 && actor != 1) ||
    actor != target ||
    permit_actor != actor ||
    permit_target != target ||
    revoked {
    { alpha: before_alpha, beta: before_beta, }
  } else if target == 0 {
    { alpha: value, beta: before_beta, }
  } else {
    { alpha: before_alpha, beta: value, }
  }
}
