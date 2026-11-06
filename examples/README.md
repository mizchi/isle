# Isle examples

English · [日本語](README.ja.md) · [Package setup](../README.md#quick-start)

These examples demonstrate the package API. Copy the feature source and configuration into your Vite app after installing the package. The shared shell/config helper only avoids repetition between demos; it is not a runtime requirement.

| Feature | Try and observe |
| --- | --- |
| [TodoMVC](todomvc/) | Add, edit, filter and persist todos; compare production sizes with Qwik and Preact. |
| [Minimal counter](hello/) | Increment and reset a server-rendered value. |
| [HTML without browser JS](ssr-only/) | Inspect the build: HTML and CSS, with no Isle runtime, snapshots or handler chunks. |
| [Selective DOM updates](partial-updates/) | Change one value while the static heading and unrelated output keep their DOM identity. |
| [Nested components](composition/) | Resume a child independently of its parent; project children through a pure component. |
| [Branches, keyed lists and errors](control-flow/) | Switch branches, reorder keyed rows, then empty the list to reach @empty and synchronous @catch. |
| [Manifest-driven loading](loading/) | Inspect preload decisions in the manifest; typing activates Search while Details stays inactive. |
| [Resource lifetime and cleanup](resources/) | Activate an owned timer and listener, remove the component, and observe one cleanup. |
| [Lazy CSS readiness](styles/) | Load component CSS with its setup module and inspect the style seen by setup. |
| [Native navigation hints](navigation/) | Inspect a native Speculation Rules data block and follow an ordinary link; no Isle browser JS is emitted. |
| [Native form validation](form/) | Try invalid input, required consent and successful submission with accessible labels. |
| [Shared schema and server validation](schema-form/) | Submit taken@example.com, correct it, then submit and reset the shared-schema form. |
| [Explicit server action](counter/) | Compare independent counters and rename a document through a validated, authorized server boundary. |
| [CSS contract outcomes](layout-contracts/) | Run verified, overflow/violated and unsupported/unknown cases using reset-aware Grid contracts. |
| [Portable Web Components](portable-widget/) | Mount independent widgets, compare shared and standalone distributions, and reject a version mismatch. |
| [Cloudflare Workers widget](worker-widget/) | Use two terminals for widget-dev and widget-host; embed fixed-size Shadow DOM widgets on another origin. |

## Run this checkout

Repository demos require the [contributor toolchain](../docs/contributing.md), including MoonBit for compiler development. This is separate from installing the npm package in an app.

```sh
just examples-list
just example hello
just example-build hello
just examples-build
just examples-check
```

Browser demos use the port listed in each README. Use the dedicated commands for widgets and CSS contract outcomes. Inspect `isle.manifest.json` and `isle.cost.json` in built output for chunk references, loading decisions and work bounds.
