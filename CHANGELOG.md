# Changelog — `@baseline-types/*`

Release notes for the [`@baseline-types`](https://www.npmjs.com/org/baseline-types)
packages published from this fork. All `@baseline-types/dom-<year>` packages are
versioned and released together, so each entry below applies to every year unless
noted.

This file tracks the **packages**, not the upstream generator. See the git history
for changes to the build pipeline itself.

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
