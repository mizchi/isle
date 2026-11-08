# Consumer task: review queue

Build a small interactive application using the supplied preview npm package,
without editing the framework. Work as an application developer from the public
README and guides. Your friction, failed attempts and interpretation of the
abstractions are as important as completing the app.

Create `app.isle`, `index.html`, `vite.config.mjs` and a consumer `package.json`.
Use Node24+, pnpm, Vite8 and the provided tarball as `@isle/prototype`.

Requirements:

- `client component ReviewQueue` owns three initial records:
  `a / Read proposal / open`, `b / Check constraints / done`,
  `c / Ship demo / open`.
- Use a universal `component ReviewCard` for each record. Both components
  declare `layout SafeGrid` and own their CSS. The child can require at least
  160px inline allocation and96px block allocation; choose compatible upper
  bounds and CSS. Keep the declarations meaningful rather than making them0.
- The deployed domain is width320–960px and height640–960px. Cards form one
  column below600px and two columns at600px and above. At most four cards exist.
- Buttons named `All`, `Open`, `Done` change the filter. Each card has a button
  named `Toggle` that updates its completion in the parent state. Buttons are
  native buttons with explicit types.
- `Add review` appends `d / New review / open` while capacity permits. Further
  additions leave the count at4. No text input, network or storage is required.
- Two labelled outputs, `Total reviews` and `Open reviews`, expose numeric
  counts. Each card root has `data-review` equal to its stable id. Titles and
  an Open/Done status are visible. Use the record id for the `For` key.
- The final production build must pass layout checks. Do not narrow the domain,
  remove checks, change the framework, add imperative DOM code or relax the
  child requirements to get success.
- The same app in SSR-only mode must emit no JavaScript or Wasm chunks. The
  resume build must support the interactions in `goals/author.json` and keep a
  card's root DOM node when only its completion changes under the All filter.

Harness: `vite build` produces the resume app; `vite build --mode ssr`
produces the same app in SSR-only mode. The grader supplies `--outDir`.

Budget: four edit/check rounds. Installation and reading docs do not count as
an edit/check round. A round ends when you run the supplied acceptance grader;
you may run the installed CLI/build/browser tools while preparing that round.
After each round, log the command, result, literal signal that motivated your
next edit, and the next action in `log.jsonl`. Preserve first failure output.

Stop when the acceptance grader passes or four rounds are used. Write
`report.md` (at most300 English words or1000 Japanese characters) with success,
rounds used, what you inferred from `requires`/`ensures`, specific useful output,
specific confusing/missing output or syntax, and at most three requested changes.
Do not invent a positive result; partial completion is useful evidence.
