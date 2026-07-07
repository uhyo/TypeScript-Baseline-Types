### `@baseline-types/dom-{{target}}` - DOM types for Baseline {{state}}

This package contains the DOM types for the web APIs that are currently
[Baseline](https://web.dev/baseline) **{{state}}**. Unlike the per-year
`@baseline-types/dom-<year>` packages, it is not frozen to a fixed year — it
tracks the latest Baseline state and moves forward as more APIs reach
**{{state}}**. It is a drop-in replacement for `@types/web` / the built-in `dom`
library that lets you pin your project to the {{state_lower}} web platform surface
instead of always tracking the latest specs.

The types are [generated from](https://github.com/uhyo/TypeScript-Baseline-Types/)
the same spec data (`@webref/idl` + `@mdn/browser-compat-data`) as `@types/web`,
then cut down with [`compute-baseline`](https://www.npmjs.com/package/compute-baseline)
to the Baseline {{state}} set. The cut is referentially closed, so the output is a
valid superset of the strict "Baseline {{state}}" set (an API that depends on a
type which is not yet {{state_lower}} keeps that type).

## Installation

With TypeScript 4.5+ using [lib replacement](https://www.typescriptlang.org/tsconfig/#libReplacement),
swap the built-in DOM lib for this package:

```sh
npm install @typescript/lib-dom@npm:@baseline-types/dom-{{target}} --save-dev
pnpm add @typescript/lib-dom@npm:@baseline-types/dom-{{target}} --save-dev
yarn add @typescript/lib-dom@npm:@baseline-types/dom-{{target}} --dev
```

If you are using TypeScript 6.0+, set [`libReplacement`](https://www.typescriptlang.org/tsconfig/#libReplacement)
to `true` in your `tsconfig.json`.

That's all — your project now sees only the DOM APIs that are Baseline {{state}}.

<details>
<summary>TypeScript 4.4 and below</summary>

<br/>
To use this package without lib replacement you need to do two things:

1. Install the dependency: `npm install @baseline-types/dom-{{target}} --save-dev`.

1. Update your [`tsconfig.json`](https://www.typescriptlang.org/tsconfig). There are
   two cases depending on whether you have `lib` defined.

    1. **Without "lib"** - Add `"lib": []` plus the entry matching your
       [`"target"`](https://www.typescriptlang.org/tsconfig#target) (e.g.
       `"lib": ["es2017"]` for `"target": "es2017"`).
    1. **With "lib"** - Remove `"dom"`.

Removing `"dom"` lets this package provide the global declarations instead.

</details>

## What "Baseline {{state}}" means here

- An API is included if its Baseline status is **{{state}}** as of the underlying
  browser-compat-data snapshot. "Newly available" means every core browser has
  shipped it (`baseline_low_date`); "Widely available" additionally means ~30
  months have passed since then (`baseline_high_date`).
- The cut moves over time: each data refresh can promote more APIs into this set
  (and, for the newly-available cut, some of those APIs later also appear in the
  widely-available cut).
- A few references that can't be satisfied in a given scope (e.g. an enum whose
  only interface was cut) are degraded to `any`.
- When unsure whether an API has Baseline data at all (e.g. `WebAssembly`), it is
  kept rather than dropped.

## SemVer

This project does not respect semantic versioning — the underlying spec data and
Baseline computation change over time, and any update could add or remove types.
The Baseline state in the package name is the stable axis. The version's patch
component is the release date (`1.0.YYYYMMDD`, e.g. `1.0.20260707`), so the
version simply records the day each data refresh was cut.

## Deploy Metadata

You can read what changed in version {{version}} at {{release_href}}.
