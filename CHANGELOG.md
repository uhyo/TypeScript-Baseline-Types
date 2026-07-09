# Changelog — `@baseline-types/*`

Release notes for the [`@baseline-types`](https://www.npmjs.com/org/baseline-types)
packages published from this fork. All `@baseline-types/dom-<target>` packages are
versioned and released together, so each entry below applies to every package
unless noted.

This file tracks the **packages**, not the upstream generator. See the git history
for changes to the build pipeline itself.

## Unreleased

- **Fix: a cut no longer carries interfaces that nothing references.** The
  referential-closure pass has a raw-text fallback that scans the manual input
  files (`inputfiles/patches/*.kdl`, `addedTypes.jsonc`, `overridingTypes.jsonc`)
  for mentions of a removed interface's name, to catch references hidden inside
  raw signature strings. It used to match a removed interface's *own
  declaration* — a patch that only *modifies* `WebTransport` mentions the name
  in its record key, so `WebTransport` was resurrected even though no surviving
  API used it as a type. Cuts like `@baseline-types/dom-2024` therefore emitted
  a batch of interfaces they didn't need — the `WebTransport` family, the
  `PaymentRequest` API and its dictionaries, `ScriptProcessorNode`,
  `SharedWorker`, `PerformanceTiming`/`PerformanceNavigation`, and more — none
  of which is Baseline in the cut or referenced by anything that is. The
  fallback now looks only at string *values* with declaration identifiers
  (record keys and `name` fields) stripped, so patching an interface no longer
  counts as referencing it; genuine references in raw signature strings are
  still caught.
- **Fix: interfaces that fail the Baseline bar never expose a constructor,
  even when re-exposed by an override.** A few interfaces fail the bar but are
  deliberately re-exposed as a *type* by an `"exposed"` override (e.g.
  `MIDIAccess`, `SourceBuffer`, which the overrides scope to `Window`). Their
  `declare var` — the runtime constructor and statics — is now suppressed in
  cuts where the API isn't Baseline-available, so `new MIDIAccess()` no longer
  type-checks there; the type still resolves for references. This extends the
  same type-only treatment already applied to interfaces kept purely for
  referential closure (below) to the override-re-exposed case.
- **Fix: interfaces kept only for referential closure no longer expose a
  constructor.** When a cut removes an interface that is still referenced as a
  *type* by a surviving API, the build resurrects it so the reference resolves.
  Previously that resurrection restored the interface's full runtime object,
  which let `new WebTransport()` (and other not-yet-Baseline constructors)
  type-check in cuts predating the API — e.g. `@baseline-types/dom-2024`
  emitted a usable `WebTransport` constructor even though WebTransport is
  Baseline 2026. Such interfaces are now emitted as a type-only shell (no
  `declare var`, so no constructor or statics); the type still resolves, but the
  runtime object the cut can't vouch for is gone. Interfaces that clear the
  Baseline bar on their own keep their constructor unchanged.
- **New: moving-target packages `@baseline-types/dom-newly-available` and
  `@baseline-types/dom-widely-available`.** Alongside the frozen per-year cuts,
  these two packages track the latest Baseline state and advance as APIs qualify:
  `dom-newly-available` contains every API that is currently Baseline "Newly
  available" (status `low` or `high`), and `dom-widely-available` the stricter
  subset that is currently "Widely available" (status `high`). "Currently" is
  resolved from the `@mdn/browser-compat-data` snapshot's `__meta.timestamp` (not
  wall-clock), so the cuts stay deterministic and only move on a data refresh. The
  build knob generalizes from `BASELINE_YEAR` to `BASELINE_TARGET`, which accepts a
  year, `newly-available`, or `widely-available`.

## Versioning scheme change

Starting with the next release, the packages use a **date-based patch version**:
`1.0.YYYYMMDD` (e.g. `1.0.20260707`). Previously the patch was incremented by one
on each release (`0.0.1`, `0.0.2`, …). The major and minor are now fixed at `1.0`
and the patch records the UTC day each data refresh was cut, so the version
itself tells you how fresh the Baseline data is.

## 0.0.2

- **Fix: the cut is now a strict subset of the full lib.** Previously, when
  Baseline had no data for an IDL member (no resolvable `api.*` entry), the cut
  kept it unconditionally. That let the cut emit members the normal build drops
  for lack of multi-engine support (e.g. `PerformanceEntry.id`,
  `PerformanceEntry.navigationId`). `isSuitable` now defers to the upstream
  "2+ engines" rule for those cases, so the cut never adds members the full lib
  omits. APIs genuinely outside BCD (e.g. `WebAssembly`) are unaffected.
- **Fix: `@baseline-types/dom-2025` is now type-valid.** The spurious
  `PerformanceEntry.id: number` clashed with `LargestContentfulPaint.id: string`
  once LCP reached Baseline 2025, producing a `TS2430`
  ("incorrectly extends") error. Removing the spurious member resolves it.
- All of 2022 / 2023 / 2024 / 2025 are verified standalone `tsc`-valid
  (`tsc --lib es2022` over `index` + `iterable` + `asynciterable`).

## 0.0.1

- Initial release of `@baseline-types/dom-2022`, `@baseline-types/dom-2023`,
  `@baseline-types/dom-2024`, and `@baseline-types/dom-2025`: DOM type
  definitions cut to each Baseline "Newly available" year, shipped as drop-in
  `@types/web` replacements consumed via TypeScript lib replacement.
