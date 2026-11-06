; Reference semantics for the four equal-track fixture.
; In-flow, border-box, zero gap/insets, fixed 40px row height.
; The caller provides a nonempty viewport domain and positive column/row counts.
(define-fun cell_inline () Real 40)
(define-fun cell_block () Real 40)
(define-fun layout_bad ((w Real) (h Real) (columns Real) (rows Real)) Bool
  (or (< w (* columns cell_inline)) (< h (* rows cell_block))))
