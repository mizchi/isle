# Async local map: authoring and lifecycle experiment

Run [Harbor](../../../examples/async-map/README.md), then read `app.isle`, `model.mjs`, and `setup.mjs` in that order. Predict which state the compiler controls, which state the trusted adapter controls, and when code/data/instances are fetched or activated.

Try search and category changes while a request is pending, drag and pinch, select two results rapidly, fail a search and retry, hold receiver and optional detail chunks, keep typing, and remove a map during acquisition. Browser tests inject those schedules without an external map service.

```sh
just async-map-check
just async-map-eval
just async-map-quality
```

Accept only current live-channel results. Preserve old rows on errors, keep controls editable, and release each owner's resources once. Record initial/active/details code separately, first-paint shifts, requests during/after drag, and how much logic stays outside the DSL.

[The report](../../../docs/async-map-experiment.md) documents current limitations. Node/browser and bounded schedule checks have run; no independent authoring/reading participant study or automatic intent grader has run. Single local diagnostic timings are not framework performance comparisons. The resource receiver now checks closed input and owner/epoch/publication at commit; adapter TypeScript types remain manual. SDK request/cache logic and opaque DOM ownership are still outside compiler analysis.
