# TypeScript Baseline Types

This is a fork of [`microsoft/TypeScript-DOM-lib-generator`](https://github.com/microsoft/TypeScript-DOM-lib-generator)
that generates and publishes the [`@baseline-types`](https://www.npmjs.com/org/baseline-types)
npm packages: DOM type definitions frozen to a given [Web Platform Baseline](https://web.dev/baseline)
year.

Where `@types/web` always tracks the latest specs, `@baseline-types/dom-<year>`
gives you the web platform surface that was broadly available by a specific year,
so you can lint your code against the APIs your users' browsers actually support.

> This fork is **not** intended to be contributed back upstream. It exists to host
> the `@baseline-types` packages. The original generator's documentation is kept
> verbatim in the [foldable section at the bottom](#upstream-readme).

## Packages

One package per Baseline year, each a drop-in replacement for `@types/web`:

| Package | Contents |
| --- | --- |
| [`@baseline-types/dom-2022`](https://www.npmjs.com/package/@baseline-types/dom-2022) | DOM APIs Baseline "Newly available" by 2022 |
| [`@baseline-types/dom-2023`](https://www.npmjs.com/package/@baseline-types/dom-2023) | …by 2023 |
| [`@baseline-types/dom-2024`](https://www.npmjs.com/package/@baseline-types/dom-2024) | …by 2024 |
| [`@baseline-types/dom-2025`](https://www.npmjs.com/package/@baseline-types/dom-2025) | …by 2025 |

### Usage

Install the year you want to target and swap it in for the built-in DOM lib using
[lib replacement](https://www.typescriptlang.org/tsconfig/#libReplacement)
(TypeScript 4.5+):

```sh
npm install @typescript/lib-dom@npm:@baseline-types/dom-2024 --save-dev
```

If you are on TypeScript 6.0+, also set [`libReplacement`](https://www.typescriptlang.org/tsconfig/#libReplacement)
to `true` in your `tsconfig.json`. Each package ships the same `index.d.ts` +
`ts5.5`/`ts5.6`/`ts5.9` downlevel layout and `typesVersions` as `@types/web`, so no
other configuration is needed. See a package's own README for the pre-4.5 setup.

## How the Baseline cut works

Setting the `BASELINE_YEAR` environment variable restricts the generated lib to
APIs that became Baseline **Newly available** (`baseline_low_date` — supported by
all core browser engines) in that year or earlier, instead of the generator's
default "supported by 2+ engines" rule. Baseline status is computed with
[`compute-baseline`](https://www.npmjs.com/package/compute-baseline) from the same
browser-compat-data the build already uses.

```sh
BASELINE_YEAR=2024 npm run build   # generated/ holds the Baseline 2024 cut
```

Notes:

- When `BASELINE_YEAR` is unset the output is byte-identical to a normal build, so
  the fork stays in sync with upstream behavior.
- The cut is referentially closed: an older API that references a type which only
  reached Baseline later (e.g. `ImageBitmapRenderingContext` referencing
  `ImageBitmap`) keeps that type, so the output is a valid superset of the strict
  "Baseline ≤ N" set.
- A few references that can't be satisfied in a given scope (e.g. an enum whose
  only interface was removed) are degraded to `any`; the build logs each one.

## Building and publishing

```sh
npm install

# 1. Generate the cuts (writes baseline-<year>/ at the repo root)
npm run baseline-years -- 2022 2023 2024 2025

# 2. Build the npm package folders under deploy/generated/
npm run baseline-packages              # defaults to 2022..2025
npm run baseline-packages -- 2024      # or a specific year

# 3. Dry-run, then publish (only packages whose .d.ts changed are pushed)
npm run baseline-publish               # dry run — prints what would publish
npm run baseline-publish -- --publish  # requires `npm login` to the org
```

The set of scopes and the default year list live near the top of
`deploy/createBaselineTypesPackages.js` (`SCOPES` and `DEFAULT_YEARS`); add `2026`
or the worker scopes there as needed.

## Keeping in sync with upstream

`main` mirrors `upstream/main`; the fork's work lives on `baseline-filter`.

```sh
git checkout main && git fetch upstream && git merge --ff-only upstream/main && git push
git checkout baseline-filter && git merge main   # then rebuild & re-run the year cuts
```

## License

Licensed under the [Apache License, Version 2.0](./LICENSE.txt), the same license
as the upstream project.

This repository is a derivative work of
[`microsoft/TypeScript-DOM-lib-generator`](https://github.com/microsoft/TypeScript-DOM-lib-generator),
Copyright © Microsoft Corporation, used under the Apache License 2.0. Modifications
in this fork — the Baseline-year cut and the `@baseline-types` packaging — are
Copyright © 2026 uhyo, and are likewise released under the Apache License 2.0. The
generated `@baseline-types/*` type definitions are derived from the same upstream
spec data ([`@webref/idl`](https://github.com/w3c/webref) and
[`@mdn/browser-compat-data`](https://github.com/mdn/browser-compat-data)) as
`@types/web`.

---

<a id="upstream-readme"></a>
<details>
<summary><strong>Upstream README (microsoft/TypeScript-DOM-lib-generator)</strong></summary>

<br/>

The following is the original generator documentation, kept verbatim for
reference and to minimize merge conflicts when syncing with upstream.

# TypeScript and JavaScript lib generator

This tool is used to generate the web-based `lib.dom.d.ts` file which is included with TypeScript releases, and as the `@types/web` package.

## Why is my fancy API still not available here?

A feature needs to be supported by two or more major browser engines to be included here, to make sure there is a good consensus among vendors: __Gecko__ (Firefox), __Blink__ (Chrome/Edge), and __WebKit__ (Safari).

If the condition is met but still is not available here, first check the [contribution guidelines](#contribution-guidelines) below and then please [file an issue](https://github.com/microsoft/TypeScript-DOM-lib-generator/issues/new).

## Build Instructions

To get things setup:

```sh
npm install
```

To generate the `.d.ts` files

```sh
npm run build
```

To test:

```sh
npm run test
```


## `@types/[lib]` to TypeScript Versions

| `@types/[lib]` version | TypeScript Version  | Minimum TypeScript Support |
| ------------------------------------------------------------------------- | ----------- | -------------- |
| `@types/web` [0.0.1](https://www.npmjs.com/package/@types/web/v/0.0.1)    | ~4.3        | 4.4            |
| `@types/web` [0.0.2](https://www.npmjs.com/package/@types/web/v/0.0.2)    | ~4.4 beta   | 4.4            |
| `@types/web` [0.0.25](https://www.npmjs.com/package/@types/web/v/0.0.25)  | 4.4         | 4.4            |
| `@types/web` [0.0.28](https://www.npmjs.com/package/@types/web/v/0.0.28)  | 4.5 beta    | 4.4            |
| `@types/web` [0.0.37](https://www.npmjs.com/package/@types/web/v/0.0.37)  | 4.5 rc      | 4.4            |
| `@types/web` [0.0.37](https://www.npmjs.com/package/@types/web/v/0.0.37)  | 4.5         | 4.4            |
| `@types/web` [0.0.50](https://www.npmjs.com/package/@types/web/v/0.0.50)  | 4.6 beta    | 4.4            |
| `@types/web` [0.0.51](https://www.npmjs.com/package/@types/web/v/0.0.51)  | 4.6 rc      | 4.4            |
| `@types/web` [0.0.51](https://www.npmjs.com/package/@types/web/v/0.0.51)  | 4.6         | 4.4            |
| `@types/web` [0.0.61](https://www.npmjs.com/package/@types/web/v/0.0.61)  | 4.7 beta    | 4.4            |
| `@types/web` [0.0.61](https://www.npmjs.com/package/@types/web/v/0.0.61)  | 4.7 rc      | 4.4            |
| `@types/web` [0.0.61](https://www.npmjs.com/package/@types/web/v/0.0.61)  | 4.7         | 4.4            |
| `@types/web` [0.0.68](https://www.npmjs.com/package/@types/web/v/0.0.68)  | 4.8 beta    | 4.4            |
| `@types/web` [0.0.69](https://www.npmjs.com/package/@types/web/v/0.0.69)  | 4.8 rc      | 4.4            |
| `@types/web` [0.0.69](https://www.npmjs.com/package/@types/web/v/0.0.69)  | 4.8         | 4.4            |
| `@types/web` [0.0.76](https://www.npmjs.com/package/@types/web/v/0.0.76)  | 4.9         | 4.4            |

## `@types/[lib]` Minimum Target

The libraries available on `@types/` like `@types/web` require a [`"target"`](https://www.typescriptlang.org/tsconfig#target) of ES6 or above, because [iterator](https://www.typescriptlang.org/docs/handbook/iterators-and-generators.html) APIs are included.

## Contribution Guidelines

The files in the `baselines/` directory from the TypeScript repo are used as baselines.
For each pull request, we will run the script and compare the generated files with the baseline files.
In order to make the tests pass, please update the baseline as well in any pull requests.

### When the type is missing

It's possible that the automated algorithm decided that it's not well supported by browsers and thus removed it. Say we want to add a new interface named `Foo`. Check if there is a document about that interface in [MDN](https://developer.mozilla.org/). If there is, see the browser compatibility section and check whether it's supported by two or more browser engines. (Note that Chromium-based browsers use the same browser engine and thus support from them counts as a single support.)

If all the conditions are fulfilled, it could be that the type is incorrectly removed by `inputfiles/removedTypes.jsonc`. Try finding and removing the relevant item there and run `npm run generate`.

If conditions are not fulfilled but you think MDN is wrong, please file an issue at https://github.com/mdn/browser-compat-data/issues/. The type will be automatically added in a few weeks when MDN fixes their data.

### When the type exists but is wrong

It's possible that the type is too specific or too general. First you need to check whether `inputfiles/overridingTypes.jsonc` or `inputfiles/addedTypes.jsonc` have a relevant item, which can be fixed if exists. If they don't, add one in `overridingTypes.jsonc`. Run `npm run generate` to make sure the resulting changes are what you want.

If you are familiar with Web IDL, you may also want to check whether the upstream IDL itself can be made more specific. Doing so will reduce the need for manual overrides in this repository and thus can be more helpful.

# This repo

## Code Structure

- `src/build.ts`: handles the emitting of the `.d.ts` files.
- `src/test.ts`: verifies the output by comparing the `generated/` and `baseline/` contents.

## Input Files

- `addedTypes.jsonc`: types that should exist but are missing from the spec data.
- `overridingTypes.jsonc`: types that are defined in the spec but have TypeScript-friendly modifications in the json files.
- `removedTypes.jsonc`: types that are defined in the spec but should be removed.
- `patches/*.kdl`: KDL types
- `comments.json`: comment strings to be embedded in the generated .d.ts files.
- `deprecatedMessage.json`: the reason why one type is deprecated.

</details>
