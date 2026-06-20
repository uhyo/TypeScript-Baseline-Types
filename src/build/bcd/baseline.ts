import bcd from "@mdn/browser-compat-data" with { type: "json" };
import type { Identifier } from "bcd-idl-mapper";
import { computeBaseline } from "compute-baseline";
import { Compat } from "compute-baseline/browser-compat-data";
import type * as Browser from "../types.ts";
import { baseTypeConversionMap, collectTypeReferences } from "../helpers.ts";

// Optional "Baseline year" cut-off, controlled by the BASELINE_YEAR env var.
// When set, the build keeps only APIs that became Baseline "Newly available"
// (i.e. gained support across the whole core browser set) in that year or
// earlier, instead of the default "supported by 2+ engines" rule. When unset,
// the build is identical to upstream and none of the machinery below runs.
function parseBaselineYear(): number | null {
  const raw = process.env.BASELINE_YEAR;
  if (!raw) {
    return null;
  }
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error(
      `Invalid BASELINE_YEAR: ${JSON.stringify(raw)} (expected a year like 2024)`,
    );
  }
  return year;
}

export const baselineYear: number | null = parseBaselineYear();

// `compute-baseline` resolves the same @mdn/browser-compat-data copy this
// project already loads (node dedupes the JSON module), so the dates here are
// consistent with the rest of the build. Built lazily so non-baseline builds
// pay nothing.
let compat: Compat | undefined;
function getCompat(): Compat {
  return (compat ??= new Compat(bcd));
}

function keyExists(key: string): boolean {
  try {
    return !!getCompat().query(key);
  } catch {
    return false;
  }
}

/** BCD compat key for an interface/namespace itself, if BCD knows about it. */
export function interfaceCompatKeys(name: string): string[] {
  const key = `api.${name}`;
  return keyExists(key) ? [key] : [];
}

/**
 * Resolve the real BCD compat key(s) for a member. bcd-idl-mapper exposes
 * members one of three ways, and only some map directly to a dotted BCD path:
 *
 * - own member: `__compat` lives on the node  -> `api.<Interface>.<member>`
 * - shared/mixin member: no top-level `__compat`, instead a sub-entry per
 *   consuming interface (context)             -> `api.<Context>.<member>`
 * - global member (e.g. atob, structuredClone): lives at the BCD top level
 *                                               -> `api.<member>`
 *
 * Returns only keys that actually exist in BCD; computeBaseline throws on
 * unknown keys, so callers must check existing ones.
 */
export function memberCompatKeys(
  interfaceName: string,
  member: string,
  node: Identifier | undefined,
): string[] {
  const keys = new Set<string>();
  if (!node) {
    return [];
  }
  if (node.__compat) {
    const key = `api.${interfaceName}.${member}`;
    if (keyExists(key)) {
      keys.add(key);
    }
  } else {
    for (const context of Object.keys(node)) {
      if (context === "__compat") {
        continue;
      }
      const sub = node[context] as Identifier | undefined;
      if (sub?.__compat) {
        const key = `api.${context}.${member}`;
        if (keyExists(key)) {
          keys.add(key);
        }
      }
    }
    if (keys.size === 0) {
      const key = `api.${member}`;
      if (keyExists(key)) {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

const keyYearCache = new Map<string, number | null>();

/** Baseline "Newly available" year for a single BCD key, or null if it has none. */
function newlyAvailableYear(key: string): number | null {
  const cached = keyYearCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let year: number | null = null;
  try {
    const status = computeBaseline(
      { compatKeys: [key], checkAncestors: true },
      getCompat(),
    );
    if (status.baseline_low_date) {
      // Dates are ISO (`2024-03-05`) but may be ranged (`<=2020-01-01`); grab
      // the first 4-digit year either way.
      const match = status.baseline_low_date.match(/\d{4}/);
      if (match) {
        year = Number(match[0]);
      }
    }
  } catch {
    year = null;
  }
  keyYearCache.set(key, year);
  return year;
}

/**
 * True if the API is Baseline "Newly available" in `year` or earlier on ANY of
 * its consuming interfaces.
 *
 * A mixin member shared across interfaces has one BCD key per interface; keys
 * are combined with OR rather than AND, because the member should survive as
 * long as at least one consuming interface had it by `year`. A later context
 * (such as MathMLElement, which the cut removes anyway) must not drag the whole
 * member out. Since a member can't predate its interface, an early key implies
 * that interface survives too.
 */
export function isNewlyAvailableWithin(
  year: number,
  compatKeys: string[] | undefined,
): boolean {
  // No resolvable BCD entry means we can't prove the item is newer than the
  // cut-off (e.g. JS builtins like WebAssembly live outside the `api.*` tree,
  // and webref-only types may be absent from BCD). Only remove on positive
  // evidence of being too new, so keep when there's nothing to check.
  if (!compatKeys || compatKeys.length === 0) {
    return true;
  }
  return compatKeys.some((key) => {
    const keyYear = newlyAvailableYear(key);
    return keyYear !== null && keyYear <= year;
  });
}

/** Type references carried by an entity's members that survive baseline removal. */
function survivingMemberReferences(
  members: Record<string, unknown> | undefined,
  removedMembers: Record<string, { exposed?: string }> | undefined,
): string[] {
  if (!members) {
    return [];
  }
  const references: string[] = [];
  for (const [name, member] of Object.entries(members)) {
    if (removedMembers?.[name]?.exposed === "") {
      continue;
    }
    references.push(...collectTypeReferences(member));
  }
  return references;
}

/** All type references an interface/mixin/namespace contributes once baseline removal is applied. */
function survivingReferences(
  full: Browser.Interface,
  removalEntry: Browser.Interface | undefined,
): string[] {
  // Structural references (extends, implements, constructor, anonymous
  // methods, events, etc.) minus the methods/properties handled member-by-member.
  const structural = collectTypeReferences({
    ...full,
    methods: undefined,
    properties: undefined,
  });
  return [
    ...structural,
    ...survivingMemberReferences(
      full.methods?.method,
      removalEntry?.methods?.method,
    ),
    ...survivingMemberReferences(
      full.properties?.property,
      removalEntry?.properties?.property,
    ),
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Value types (dictionaries/enums/typedefs/callback functions) are never
 * baseline-removed, but the per-scope emit only keeps the ones still reachable
 * from a surviving interface. One whose only remaining reference is a raw-string
 * manual override (e.g. `getContext(...): CanvasRenderingContext2DSettings`,
 * after its structured anchor was removed) would otherwise be dropped, leaving a
 * dangling reference. Collect such names from the manual inputs so they can be
 * forced known at emit time.
 *
 * Excludes base types (ArrayBufferView) and names that also have a nominal
 * declaration — interface/callback-interface/mixin (EventListener) — since
 * forcing a same-named value type would emit a duplicate declaration.
 */
export function manuallyReferencedValueTypes(
  webidl: Browser.WebIdl,
  manualInputs: unknown[],
): Set<string> {
  const text = JSON.stringify(manualInputs);
  // Keyed by the emitted `.name`, not the record key, since a patch can rename a
  // type (e.g. enum ClientType -> ClientTypes) and references use the new name.
  const named = (record: Record<string, { name: string }> | undefined) =>
    Object.values(record ?? {}).map((value) => value.name);
  const nominal = new Set<string>([
    ...named(webidl.interfaces?.interface),
    ...named(webidl.callbackInterfaces?.interface),
    ...named(webidl.mixins?.mixin),
  ]);
  // Value-type definitions, used to close the forced set under its own
  // references. Callback functions are excluded: they are often scope-specific
  // (e.g. AudioWorkletProcessorConstructor) and forcing them into every scope
  // drags their own references (AudioWorkletProcessorImpl) cross-scope.
  const valueDefs = new Map<string, unknown>();
  for (const def of Object.values(webidl.dictionaries?.dictionary ?? {})) {
    valueDefs.set(def.name, def);
  }
  for (const def of Object.values(webidl.enums?.enum ?? {})) {
    valueDefs.set(def.name, def);
  }
  for (const def of webidl.typedefs?.typedef ?? []) {
    valueDefs.set(def.name, def);
  }

  const forced = new Set<string>();
  const queue: string[] = [];
  const add = (name: string) => {
    if (
      forced.has(name) ||
      baseTypeConversionMap.has(name) ||
      nominal.has(name) ||
      !valueDefs.has(name)
    ) {
      return;
    }
    forced.add(name);
    queue.push(name);
  };

  // Seed with value types named in the manual inputs, then close over their
  // own references so a forced type never dangles its parent/member types
  // (e.g. forcing KeyboardEventInit must also force EventModifierInit).
  for (const name of valueDefs.keys()) {
    if (
      !baseTypeConversionMap.has(name) &&
      !nominal.has(name) &&
      new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text)
    ) {
      add(name);
    }
  }
  while (queue.length) {
    const name = queue.shift()!;
    for (const reference of collectTypeReferences(valueDefs.get(name))) {
      add(reference);
    }
  }
  return forced;
}

/**
 * A pure Baseline-year cut is not referentially closed: an API kept for year N
 * may reference an interface that only reached Baseline later (e.g.
 * ImageBitmapRenderingContext, 2020, references ImageBitmap, 2021). Walk the
 * surviving graph and "resurrect" any baseline-removed interface that is still
 * referenced, so the emitted .d.ts stays valid. Only interfaces can be both
 * fully removed and referenced as a type (dictionaries/typedefs/enums/
 * callbacks/mixins are never baseline-removed, and namespaces aren't used as
 * types), so interfaces are the only resurrection targets.
 *
 * References come from several places: the surviving IDL graph, the
 * `webidl.events` map (event handler/map types), and the manual input files
 * (added/overriding/patch types) that are merged after removal. The latter
 * often carry references as raw signature strings, so those are matched
 * textually against removed names.
 *
 * Mutates and returns `removalData` (clears the interface-level `exposed: ""`
 * marker for resurrected interfaces while keeping their member-level removals).
 */
export function applyReferenceClosure(
  webidl: Browser.WebIdl,
  removalData: Browser.WebIdl,
  extraReferenceSources: unknown[] = [],
): Browser.WebIdl {
  const removalInterfaces = removalData.interfaces?.interface ?? {};
  const removedNames = new Set<string>();
  for (const [name, entry] of Object.entries(removalInterfaces)) {
    if (entry.exposed === "") {
      removedNames.add(name);
    }
  }
  if (removedNames.size === 0) {
    return removalData;
  }

  const fullInterfaces = webidl.interfaces?.interface ?? {};
  const resurrected = new Set<string>();
  const seen = new Set<string>();
  const queue: string[] = [];

  const resurrect = (name: string) => {
    if (!resurrected.has(name)) {
      resurrected.add(name);
      queue.push(name);
    }
  };
  const consider = (references: string[]) => {
    for (const reference of references) {
      if (seen.has(reference)) {
        continue;
      }
      seen.add(reference);
      if (removedNames.has(reference)) {
        resurrect(reference);
      }
    }
  };
  const eventTypesOf = (name: string): string[] =>
    webidl.events?.get(name) ? [...webidl.events.get(name)!.values()] : [];

  // Value types are never baseline-removed; all their references anchor.
  consider(collectTypeReferences(webidl.dictionaries));
  consider(collectTypeReferences(webidl.typedefs));
  consider(collectTypeReferences(webidl.callbackFunctions));
  consider(collectTypeReferences(webidl.callbackInterfaces));

  for (const [name, full] of Object.entries(fullInterfaces)) {
    if (!removedNames.has(name)) {
      consider(survivingReferences(full, removalInterfaces[name]));
      consider(eventTypesOf(name));
    }
  }
  for (const [name, full] of Object.entries(webidl.mixins?.mixin ?? {})) {
    consider(survivingReferences(full, removalData.mixins?.mixin?.[name]));
  }
  const removalNamespaces = new Map(
    (removalData.namespaces ?? []).map((n) => [n.name, n]),
  );
  for (const ns of webidl.namespaces ?? []) {
    if (removalNamespaces.get(ns.name)?.exposed !== "") {
      consider(survivingReferences(ns, removalNamespaces.get(ns.name)));
    }
  }

  // Manual inputs merged after removal: structured references plus raw
  // signature strings (e.g. "...): MathMLElement") matched by name.
  for (const source of extraReferenceSources) {
    consider(collectTypeReferences(source));
  }
  const manualText = JSON.stringify(extraReferenceSources);
  for (const name of removedNames) {
    if (
      !resurrected.has(name) &&
      new RegExp(`\\b${escapeRegExp(name)}\\b`).test(manualText)
    ) {
      resurrect(name);
    }
  }

  // Fixpoint: a resurrected interface's own surviving members may pull in more.
  while (queue.length) {
    const name = queue.shift()!;
    const full = fullInterfaces[name];
    if (full) {
      consider(survivingReferences(full, removalInterfaces[name]));
      consider(eventTypesOf(name));
    }
  }

  for (const name of resurrected) {
    delete removalInterfaces[name].exposed;
  }
  return removalData;
}
