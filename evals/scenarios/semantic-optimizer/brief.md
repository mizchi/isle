# Observation, one-way branches and readonly projections

Read [the fixture](../../../examples/semantic-optimizer/app.isle) before inspecting generated output. Predict:

1. Which state updates can be removed, and whether their event attributes remain.
2. Which Show arm can need a factory after the initial HTML, and what would change with a toggle or a For row.
3. Which fields must be captured from User, and what would change with `JSON.stringify(user)`.
4. Why input validation, possible exceptions, synchronous cancellation and external setup remain observable.

Run `just semantic-optimizer-check` to compare those predictions with executable output. [The guide](../../../docs/semantic-optimizer.md) describes the boundaries. Automated tests cover output, bounded boolean transitions and browser behavior; no independent authoring/reading participant study or grader has been run for this scenario.

[The result](../../results/semantic-optimizer/latest.json) compares the same checked input with the three transformations enabled versus stopped by an opaque-observer barrier. JSON/source byte counts are not transfer bytes, timings or framework comparisons. Initial visible HTML must match.
