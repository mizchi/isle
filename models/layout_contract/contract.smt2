; Independent reference: four equal tracks, zero outer insets, 40px rows.
; Minimum sizes are border-box sizes. All counts are fixed, so QF_LRA suffices.
(define-fun four-fit ((w Real) (h Real) (gap Real) (minimum Real)) Bool
  (and (>= w (+ (* 4 minimum) (* 3 gap))) (>= h 40)))
(define-fun responsive-fit ((w Real) (h Real)) Bool
  (ite (< w 160)
    (and (>= w 80) (>= h 80))
    (and (>= w 160) (>= h 40))))
(define-fun four-child-inputs ((w Real) (minimum-inline Real) (minimum-block Real)) Bool
  (and (>= w (* 4 minimum-inline)) (>= 40 minimum-block)))
