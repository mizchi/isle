///|
test "verification report checks repaired and broken finite models" {
  let report = run()
  assert_true(report.passed)
  assert_eq(report.version, 2)
  assert_eq(report.veri_version, "0.2.1")
  assert_eq(report.cases.length(), 92)
  let broken = report.cases.filter(case => case.actual == "counterexample")
  assert_eq(broken.length(), 35)
  assert_true(broken.all(case => case.witness_replayed))
  assert_true(report.cases.all(case => case.complete))
}

///|
test "response report records assumptions and cyclic witnesses explicitly" {
  let report = run()
  let responses = report.cases.filter(c => c.property.has_prefix("response:"))
  assert_eq(responses.length(), 16)
  let violations = responses.filter(c => c.actual == "counterexample")
  assert_eq(violations.length(), 9)
  assert_true(
    violations.all(c => c.witness_loop_start is Some(_) && c.witness_replayed),
  )
  assert_true(
    responses
    .filter(c => c.actual != "counterexample")
    .all(c => !c.weak_fairness.is_empty()),
  )
  assert_eq(
    report.cases.filter(c => c.category == "missing-assumption").length(),
    4,
  )
  assert_eq(
    report.cases.filter(c => c.category == "insufficient-contract").length(),
    2,
  )
}
