set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

build-compiler:
    pnpm build:compiler

check:
    moon check --deny-warn

check-types:
    pnpm exec tsc -p tsconfig.contracts.json

test-models:
    moon test models/owner --target js
    moon test models/regions --target js
    moon test models/style_resolution --target js
    moon test models/layout_subgrid --target js
    moon test models/layout_dynamic --target js
    moon test models/resource_once --target js
    moon test models/resource_disposal --target js
    moon test models/security --target js
    moon test models/forms --target js
    moon test models/form_session --target js
    moon test models/verification --target js
    moon test models/permit --target js

verify:
    node tools/verify-models.mjs
    moon prove models/permit
    node models/check-negative.mjs

test: build-compiler
    moon test --target js --deny-warn
    pnpm test

eval: build-compiler
    pnpm eval

dev: build-compiler
    pnpm dev

dev-form: build-compiler
    pnpm exec vite --config examples/form/vite.config.mjs

dev-schema-form: build-compiler
    pnpm exec vite --config examples/schema-form/vite.config.mjs

dev-composition: build-compiler
    pnpm exec vite --config examples/composition/vite.config.mjs

# Build a production form; check structure, keyboard use, contrast and target sizes.
a11y-form: build-compiler
    node tools/check-form-a11y.mjs

a11y-schema-form: build-compiler
    node tools/check-form-a11y.mjs --schema

build:
    pnpm build
    node tools/check-build.mjs

e2e: build
    pnpm test:e2e

ci: check check-types test verify eval build e2e control-check resource-binding-check loading-check style-check layout-check layout-subgrid-check layout-build-quality layout-dynamic-quality a11y-form a11y-schema-form examples-check critical-path-check

# The same SSR + counters + remote action in Isle, Qwik 1/2 RC and Preact.
compare-build: build-compiler
    node benchmarks/build.mjs

compare-test:
    node --test benchmarks/metrics.test.mjs
    NODE_ENV=production node benchmarks/run.mjs

compare-visual:
    NODE_ENV=production node benchmarks/visual.mjs

compare: compare-build compare-test compare-visual

compare-serve:
    NODE_ENV=production node benchmarks/serve.mjs

# TodoMVC: identical CRUD, hash filters, persistence and host capabilities.
todomvc-build: build-compiler
    node benchmarks/todomvc/build.mjs

todomvc-check: todomvc-build
    node --test tests/collections.test.mjs tests/todomvc-metrics.test.mjs
    NODE_ENV=production node benchmarks/todomvc/check.mjs

todomvc-size: todomvc-check
    NODE_ENV=production node benchmarks/todomvc/size.mjs

todomvc-serve: todomvc-build
    NODE_ENV=production node benchmarks/todomvc/serve.mjs

todomvc-quality: todomvc-build
    NODE_ENV=production node benchmarks/todomvc/quality.mjs

# CDP CPU profiles + Chrome traces, separate precise coverage, loading-policy controls.
todomvc-profile: todomvc-build
    node --test tests/todomvc-profile.test.mjs
    NODE_ENV=production node benchmarks/todomvc/profile-build.mjs
    NODE_ENV=production node benchmarks/todomvc/profile-run.mjs
    node benchmarks/todomvc/profile-report.mjs

# Paint SSR before any JavaScript; delay code/CSS and reject initial raw shifts.
critical-path-check: todomvc-build
    node --test tests/critical-path.test.mjs tests/region-optimization.test.mjs
    NODE_ENV=production node benchmarks/critical-path/build.mjs
    NODE_ENV=production node benchmarks/critical-path/run.mjs

critical-path-report:
    node benchmarks/critical-path/report.mjs

# 64 work packages + validated form, four implementations, cold/warm browser timings.
dashboard-build: build-compiler
    node benchmarks/dashboard/build.mjs

dashboard-check: dashboard-build
    node --test tests/dashboard-*.test.mjs
    NODE_ENV=production node benchmarks/dashboard/check.mjs

dashboard-bench samples='12' warm='12': dashboard-check
    BENCH_SAMPLES={{quote(samples)}} BENCH_WARM={{quote(warm)}} NODE_ENV=production node benchmarks/dashboard/run.mjs

dashboard-visual: dashboard-build
    NODE_ENV=production node benchmarks/dashboard/visual.mjs

# Instrumented module-body marks and Chromium traces; separate from performance samples.
dashboard-diagnose: dashboard-build
    NODE_ENV=production node benchmarks/dashboard/diagnose.mjs

dashboard: dashboard-bench dashboard-visual

dashboard-serve: dashboard-build
    NODE_ENV=production node benchmarks/dashboard/serve.mjs

# Isolate static-heavy output and compare SSR with its resumable initial display.
compare-static: build-compiler
    node benchmarks/static.mjs
    node benchmarks/static-visual.mjs
    pnpm exec vlmkit diff html benchmarks/results/static/visual/ssr.html benchmarks/results/static/visual/resume.html --output benchmarks/results/static/visual/diff
    pnpm exec vlmkit diff agent benchmarks/results/static/visual/diff/diff-report.json --no-history --out benchmarks/results/static/visual/diff.md

# Source boundaries, retained state and the deduplicated cold code closure.
chunks manifest='dist/isle.manifest.json':
    node tools/isle.mjs chunks {{quote(manifest)}}

# Static work bounds; budgets fail on excess or unknown cost. No browser instrumentation.
cost source='examples/counter/app.isle' budgets='': build-compiler
    node tools/isle.mjs cost {{quote(source)}} {{quote(budgets)}}

# 4,096 real product rows: static work bounds, browser mutations, cold/warm timings.
heavy-build: build-compiler
    NODE_ENV=production node benchmarks/heavy-render/build.mjs

heavy-check: heavy-build
    node benchmarks/heavy-render/check.mjs

heavy-bench samples='5' warm='8': heavy-check
    HEAVY_SAMPLES={{quote(samples)}} HEAVY_WARM={{quote(warm)}} NODE_ENV=production node benchmarks/heavy-render/run.mjs

heavy-serve: heavy-build
    node benchmarks/heavy-render/serve.mjs

heavy-quality: heavy-build
    node benchmarks/heavy-render/quality.mjs

# Workers Static Assets + explicit CORS RPC, embedded as a fixed-size Web Component.
widget-build: build-compiler
    node examples/worker-widget/build.mjs

widget-dev: widget-build
    pnpm exec wrangler dev --config examples/worker-widget/wrangler.jsonc --ip 127.0.0.1 --port 8787

widget-dry-run: widget-build
    pnpm exec wrangler deploy --config examples/worker-widget/wrangler.jsonc --dry-run --outdir {{quote(justfile_directory())}}/dist/worker-widget/worker

widget-check: widget-dry-run
    node examples/portable-widget/build.mjs
    node --test tests/widget-*.test.mjs tests/shared-runtime.test.mjs
    pnpm exec playwright test --config playwright.widget.config.mjs

# Run against widget-dev, or supply the deployed HTTPS URL.
widget-quality url='http://127.0.0.1:8787/' runtime='shared':
    node tools/check-widget-quality.mjs {{quote(url)}} {{quote(runtime)}}

widget-check-remote url:
    WIDGET_URL={{quote(url)}} pnpm exec playwright test --config playwright.widget.config.mjs

widget-deploy: widget-build
    pnpm exec wrangler deploy --config examples/worker-widget/wrangler.jsonc

widget-embed url width='640' height='640' runtime='shared':
    node tools/widget-embed.mjs {{quote(url)}} {{quote(width)}} {{quote(height)}} 'Work planner widget' {{quote(runtime)}}

widget-host url='http://127.0.0.1:8787/' runtime='shared':
    node tools/widget-host.mjs {{quote(url)}} {{quote(runtime)}}

# The same widget contract under a custom path, served by Node rather than Workers.
widget-portable-build: build-compiler
    node examples/portable-widget/build.mjs

widget-portable-dev: widget-portable-build
    node examples/portable-widget/server.mjs

# Typed template regions, key identity, selective patches and render failure boundaries.
control-check: build-compiler
    node --test tests/control-components.test.mjs tests/control-flow*.test.mjs tests/removed-control-syntax.test.mjs
    pnpm exec playwright test --config playwright.control-flow.config.mjs

# Fixed DOM/keyboard gates and desktop/phone states for the executable control-flow fixture.
control-quality: build-compiler
    node tools/check-control-quality.mjs

# Public control-component example, with responsive and keyboard gates.
control-components-quality: build-compiler
    pnpm exec vite build --config examples/control-flow/vite.config.mjs
    node tools/check-playground.mjs control-flow

# Teardown safety/liveness plus model-derived schedules against the resource owner kernel.
resource-disposal-check:
    moon test models/resource_disposal --target js --deny-warn
    node --test tests/resource-owner.test.mjs tests/resource-disposal-replay.test.mjs

# Optional setup CodeRefs, first-resume initialization and component/widget teardown.
resource-binding-check: build-compiler
    node --test tests/resource-binding-build.test.mjs tests/resource-bindings.test.mjs
    pnpm exec playwright test --config playwright.resources.config.mjs
    ISLE_RESOURCE_PLAIN=1 pnpm exec playwright test --config playwright.resources.config.mjs

resource-binding-size: build-compiler
    pnpm exec vite build --config examples/counter/vite.config.mjs
    pnpm exec vite build --config examples/composition/vite.config.mjs
    pnpm exec vite build --config examples/schema-form/vite.config.mjs
    node tools/check-resource-size.mjs

# Compiler decisions, final chunk bytes and fetch/evaluate/activate separation.
loading-check: build-compiler
    node --test tests/loading-plan.test.mjs tests/loading-optimizer-build.test.mjs
    pnpm exec playwright test --config playwright.loading.config.mjs

# CSS fetch/readiness/application, root ownership and deterministic cascade order.
style-check: build-compiler
    moon test models/style_resolution --target js --deny-warn
    node --test tests/style-loading.test.mjs tests/style-build.test.mjs
    pnpm exec playwright test --config playwright.styles.config.mjs
    ISLE_STYLE_PLAIN=1 pnpm exec playwright test --config playwright.styles.config.mjs

style-size: build-compiler
    pnpm exec vite build --config examples/counter/vite.config.mjs
    pnpm exec vite build --config examples/composition/vite.config.mjs
    pnpm exec vite build --config examples/schema-form/vite.config.mjs
    node tools/check-style-size.mjs

# Closed horizontal CSS/Grid contracts; exact media intervals and browser witnesses.
layout source='evals/scenarios/layout/fixture.isle' config='evals/scenarios/layout/layout.json': build-compiler
    node tools/isle.mjs layout {{quote(source)}} {{quote(config)}}

layout-check: build-compiler
    node --test tests/layout*.test.mjs tests/eval-layout*.test.mjs
    pnpm exec playwright test --config playwright.layout.config.mjs

# Closed production HTML/CSS; both width and height must be fully verified.
layout-build: build-compiler
    pnpm exec vite build --config examples/responsive-checked/vite.config.mjs

layout-build-quality: layout-build
    node tools/check-responsive-build.mjs

layout-dynamic: build-compiler
    pnpm exec vite build --config examples/responsive-dynamic/vite.config.mjs

layout-dynamic-quality: layout-dynamic
    node tools/check-responsive-build.mjs responsive-dynamic

# Test-fixture geometry only, within its declared 352..1280 CSS-pixel domain.
layout-quality: layout-check
    pnpm exec vlmkit check integrity evals/results/layout/fixed.html --json > evals/results/layout/integrity.json
    pnpm exec vlmkit check responsive evals/results/layout/fixed.html --min-width 352 --max-width 1280 --json > evals/results/layout/responsive.json
    pnpm exec vlmkit check integrity evals/results/layout-axes/fixed.html --viewport 480x400 --json > evals/results/layout-axes/integrity-phone.json
    pnpm exec vlmkit check integrity evals/results/layout-axes/fixed.html --viewport 1000x500 --json > evals/results/layout-axes/integrity-desktop.json
    pnpm exec vlmkit check responsive evals/results/layout-axes/fixed.html --min-width 432 --max-width 1000 --min-height 320 --max-height 600 --height 400 --json > evals/results/layout-axes/responsive.json
    pnpm exec vlmkit check integrity evals/results/layout-reset/fixed.html --viewport 375x400 --json > evals/results/layout-reset/integrity-phone.json
    pnpm exec vlmkit check integrity evals/results/layout-reset/fixed.html --viewport 1000x600 --json > evals/results/layout-reset/integrity-desktop.json
    pnpm exec vlmkit check responsive evals/results/layout-reset/fixed.html --min-width 240 --max-width 1000 --min-height 200 --max-height 600 --height 400 --json > evals/results/layout-reset/responsive.json

layout-axes: build-compiler
    node tools/isle.mjs layout evals/scenarios/layout-axes/fixture.isle evals/scenarios/layout-axes/layout.json

layout-reset: build-compiler
    node tools/isle.mjs layout evals/scenarios/layout-reset/fixture.isle evals/scenarios/layout-reset/layout.json

# Shared parent tracks: exact static regions, finite MoonBit model and native geometry.
layout-subgrid: build-compiler
    node tools/isle.mjs layout examples/layout-contracts/subgrid.isle examples/layout-contracts/subgrid.json

layout-subgrid-check: build-compiler
    moon test models/layout_subgrid --target js --deny-warn
    node --test tests/layout-subgrid.test.mjs tests/subgrid-model.test.mjs
    node tools/check-subgrid.mjs

# Executable violated/unknown examples and accepted counterparts; optionally select one ID.
layout-rejections case='': build-compiler
    node tools/layout-rejections.mjs {{quote(case)}}

# README infographic, rendered from HTML/CSS and checked against an executable example.
overview-build: build-compiler
    node tools/readme-overview.mjs

overview-check: build-compiler
    node tools/readme-overview.mjs --check

# Fixed gates for the diagram source and actual README picture markup.
overview-quality: overview-check
    pnpm exec vlmkit check integrity docs/overview/dist/figure-preview.html
    pnpm exec vlmkit check a11y contrast docs/overview/dist/figure-preview.html
    pnpm exec vlmkit check responsive docs/overview/dist/figure-preview.html --min-width 375 --max-width 1040 --runs 24
    pnpm exec vlmkit check integrity docs/overview/dist/readme-preview.html
    pnpm exec vlmkit check integrity docs/overview/dist/figure-preview.en.html
    pnpm exec vlmkit check a11y contrast docs/overview/dist/figure-preview.en.html
    pnpm exec vlmkit check responsive docs/overview/dist/figure-preview.en.html --min-width 375 --max-width 1040 --runs 24
    pnpm exec vlmkit check integrity docs/overview/dist/readme-preview.en.html

# Browse or run the feature catalog. Repository contributors build the compiler once.
examples-list:
    node tools/examples.mjs list

example name='hello': build-compiler
    node tools/examples.mjs dev {{quote(name)}}

example-build name='hello': build-compiler
    node tools/examples.mjs build {{quote(name)}}

examples-build: build-compiler
    node tools/examples.mjs build

examples-check: build-compiler
    node --test tests/examples.test.mjs
    pnpm exec playwright test --config playwright.examples.config.mjs

examples-quality: build-compiler
    node tools/check-examples.mjs

package-check: build-compiler
    node --test tests/package-consumer.test.mjs

# Produce a local preview archive; this does not publish to the npm registry.
package-build:
    mkdir -p artifacts
    pnpm pack --pack-destination artifacts

# Self-hosted documentation, static demos and GitHub Pages project-prefix checks.
site-build: build-compiler
    node tools/build-site.mjs

site-dev: site-build
    node tools/serve-site.mjs

site-check: site-build
    node --test tests/site.test.mjs tests/links.test.mjs
    node tools/check-site.mjs
    pnpm exec playwright test --config playwright.site.config.mjs

site-quality: site-build
    node tools/check-site-quality.mjs

# Browser-only compiler and sandboxed live preview.
playground: build-compiler
    pnpm exec vite --config playground/vite.config.mjs

playground-build: build-compiler
    pnpm exec vite build --config playground/vite.config.mjs

playground-check: build-compiler
    node --test tests/browser-compiler.test.mjs tests/preview.test.mjs
    pnpm exec playwright test --config playwright.playground.config.mjs

playground-quality: playground-build
    node tools/check-playground.mjs
