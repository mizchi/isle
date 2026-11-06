///|
test "bounded updates and every gutter state preserve layout; broken versions have witnesses" {
  let strict = client(false, false)
  assert_true(strict.model.exploration.unwrap().complete)
  assert_eq(strict.model.states.length(), 240)
  for property in ["bounded-count", "fits-with-gutters"] {
    assert_true(
      @smt.exhaustive(strict.model, @model_check.Safety(property)).witness
      is None,
    )
  }
  let growing = client(true, false)
  let bound = @model_check.Safety("bounded-count")
  assert_true(
    growing.accepts(
      bound,
      @smt.exhaustive(growing.model, bound).witness.unwrap(),
    ),
  )
  let no_gutter = client(false, true)
  let fit = @model_check.Safety("fits-with-gutters")
  assert_true(
    no_gutter.accepts(
      fit,
      @smt.exhaustive(no_gutter.model, fit).witness.unwrap(),
    ),
  )
}
