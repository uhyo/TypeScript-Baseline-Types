### `@baseline-types/dom-{{year}}` - DOM types frozen to Baseline {{year}}

This package contains the DOM types for the web APIs that reached
[Baseline](https://web.dev/baseline) **Newly available** status in **{{year}}** or
earlier. It is a drop-in replacement for `@types/web` / the built-in `dom` library
that lets you pin your project to the web platform surface that was broadly
available by a given year, instead of always tracking the latest specs.

The types are [generated from](https://github.com/uhyo/TypeScript-Baseline-Types/)
the same spec data (`@webref/idl` + `@mdn/browser-compat-data`) as `@types/web`,
then cut down with [`compute-baseline`](https://www.npmjs.com/package/compute-baseline)
to the Baseline {{year}} set. The cut is referentially closed, so the output is a
valid superset of the strict "Baseline ≤ {{year}}" set (an older API that depends on
a type which only reached Baseline later keeps that type).

## Installation

With TypeScript 4.5+ using [lib replacement](https://www.typescriptlang.org/tsconfig/#libReplacement),
swap the built-in DOM lib for this package:

```sh
npm install @typescript/lib-dom@npm:@baseline-types/dom-{{year}} --save-dev
pnpm add @typescript/lib-dom@npm:@baseline-types/dom-{{year}} --save-dev
yarn add @typescript/lib-dom@npm:@baseline-types/dom-{{year}} --dev
```

If you are using TypeScript 6.0+, set [`libReplacement`](https://www.typescriptlang.org/tsconfig/#libReplacement)
to `true` in your `tsconfig.json`.

That's all — your project now sees only the DOM APIs that were Baseline Newly
available by {{year}}.

<details>
<summary>TypeScript 4.4 and below</summary>

<br/>
To use this package without lib replacement you need to do two things:

1. Install the dependency: `npm install @baseline-types/dom-{{year}} --save-dev`.

1. Update your [`tsconfig.json`](https://www.typescriptlang.org/tsconfig). There are
   two cases depending on whether you have `lib` defined.

    1. **Without "lib"** - Add `"lib": []` plus the entry matching your
       [`"target"`](https://www.typescriptlang.org/tsconfig#target) (e.g.
       `"lib": ["es2017"]` for `"target": "es2017"`).
    1. **With "lib"** - Remove `"dom"`.

Removing `"dom"` lets this package provide the global declarations instead.

</details>

## What "Baseline {{year}}" means here

- **Newly available**, not Widely available: an API is included if every core
  browser shipped it by the end of {{year}} (`baseline_low_date`).
- A few references that can't be satisfied in a given scope (e.g. an enum whose
  only interface was cut) are degraded to `any`.
- When unsure whether an API has Baseline data at all (e.g. `WebAssembly`), it is
  kept rather than dropped.

## SemVer

This project does not respect semantic versioning — the underlying spec data and
Baseline computation change over time, and any update could add or remove types.
The year in the package name is the stable axis; the version only tracks data
refreshes.

## Deploy Metadata

You can read what changed in version {{version}} at {{release_href}}.
