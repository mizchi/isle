///|
test "authorized writes update exactly the owned record" {
  assert_eq(@permit.commit(0, 0, 0, 0, false, 3, 4, 9), { alpha: 9, beta: 4, })
  assert_eq(@permit.commit(1, 1, 1, 1, false, 3, 4, 9), { alpha: 3, beta: 9, })
}

///|
test "forged, wrong-resource and revoked permits preserve the store" {
  assert_eq(@permit.commit(0, 1, 1, 1, false, 3, 4, 9), { alpha: 3, beta: 4, })
  assert_eq(@permit.commit(0, 1, 0, 0, false, 3, 4, 9), { alpha: 3, beta: 4, })
  assert_eq(@permit.commit(0, 0, 0, 0, true, 3, 4, 9), { alpha: 3, beta: 4, })
}
