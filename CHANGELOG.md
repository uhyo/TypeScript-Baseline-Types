# Changelog — `@baseline-types/*`

Release notes for the [`@baseline-types`](https://www.npmjs.com/org/baseline-types)
packages published from this fork. All `@baseline-types/dom-<target>` packages are
versioned and released together, so each entry below applies to every package
unless noted.

This file tracks the **packages**, not the upstream generator. See the git history
for changes to the build pipeline itself.

## Unreleased

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
