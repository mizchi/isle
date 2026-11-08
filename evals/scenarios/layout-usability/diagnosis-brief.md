# Consumer task: repair a responsive boundary

You receive `broken.isle` and the same preview npm package/documentation an app
developer would use. Diagnose the failure and write the repaired `app.isle` plus
a working Vite consumer project. Keep contracts, CSS minimum sizes, padding,
gaps, native roots, number of cards and the deployment domain unchanged.

The four tiles must occupy one column for widths below408px and two columns at
408px and above, over width320–960px and height640–960px. Each tile requires
180px inline and100px block allocation. At the critical boundary, preserve the
intended two-column layout rather than avoiding the issue with one column
everywhere. See `goals/diagnosis.json` for observable acceptance facts.

Use CLI/build diagnostics to decide what to change. Do not read implementation
code or the grader source. Record the FIRST diagnostic literally before editing,
what you thought it meant, each edit, and the signal guiding the next edit.
Do not weaken or remove guarantees, narrow the deployment interval, or replace
the application with hand-written HTML/imperative DOM code.

Budget: four edit/check rounds, with the same round definition as the author
task. Stop when the acceptance grader passes or the budget is exhausted. Write
`log.jsonl`, preserve first failure output, and write `report.md` (at most300
English words or1000 Japanese characters) explaining the actual cause, whether
you could infer the correct boundary, what the output lacked, and up to three
concrete improvements. Failed/partial runs are useful; do not hide them.
