import bcd from "@mdn/browser-compat-data" with { type: "json" };
import type { Identifier } from "bcd-idl-mapper";
import { computeBaseline } from "compute-baseline";
import { Compat } from "compute-baseline/browser-compat-data";
import type * as Browser from "../types.ts";
import { baseTypeConversionMap, collectTypeReferences } from "../helpers.ts";

// Optional Baseline cut-off, controlled by the BASELINE_TARGET env var. When set,
// the build keeps only APIs that meet the target's Baseline bar, instead of the
// default "supported by 2+ engines" rule. When unset, the build is identical to
// upstream and none of the machinery below runs.
//
// The target is one of:
//   - a 4-digit year ("2024")  -> APIs that became Baseline "Newly available" in
//                                  that year or earlier (a frozen, per-year cut).
//   - "newly-available"        -> APIs that are *currently* Baseline "Newly
//                                  available" (status low or high) — a moving cut.
//   - "widely-available"       -> APIs that are *currently* Baseline "Widely
//                                  available" (status high) — a moving cut.
//
// "Currently" is not wall-clock: compute-baseline resolves it from the
// @mdn/browser-compat-data snapshot's own __meta.timestamp, which is pinned by
// package-lock.json, so the moving cuts are deterministic and reproducible.
export type BaselineTarget =
  | { kind: "year"; year: number }
  | { kind: "newly" }
  | { kind: "widely" };

function parseBaselineTarget(): BaselineTarget | null {
  const raw = process.env.BASELINE_TARGET;
  if (!raw) {
    return null;
  }
  if (raw === "newly-available") {
    return { kind: "newly" };
  }
  if (raw === "widely-available") {
    return { kind: "widely" };
  }
  if (/^\d{4}$/.test(raw)) {
    const year = Number(raw);
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      throw new Error(
        `Invalid BASELINE_TARGET: ${JSON.stringify(raw)} (expected a year like 2024)`,
      );
    }
    return { kind: "year", year };
  }
  throw new Error(
    `Invalid BASELINE_TARGET: ${JSON.stringify(raw)} ` +
      `(expected a year like 2024, "newly-available", or "widely-available")`,
  );
}

export const baselineTarget: BaselineTarget | null = parseBaselineTarget();

/** True when any Baseline cut is active (year or moving). */
export const isBaselineCut: boolean = baselineTarget !== null;

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

/** The Baseline facts we read for a single BCD key. */
interface KeyBaseline {
  /** Baseline "Newly available" year (from baseline_low_date), or null if none. */
  lowYear: number | null;
  /** Current Baseline status: "high" (widely), "low" (newly), or false. */
  baseline: false | "low" | "high";
}

const keyBaselineCache = new Map<string, KeyBaseline>();

/**
 * Baseline facts for a single BCD key. Both the per-year cut (via `lowYear`) and
 * the moving cuts (via `baseline`) derive from one cached computeBaseline call.
 * The `baseline` status is resolved against the BCD snapshot's __meta.timestamp,
 * not wall-clock time, so it is deterministic for a given package-lock.json.
 */
function keyBaseline(key: string): KeyBaseline {
  const cached = keyBaselineCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let result: KeyBaseline;
  try {
    const status = computeBaseline(
      { compatKeys: [key], checkAncestors: true },
      getCompat(),
    );
    let lowYear: number | null = null;
    if (status.baseline_low_date) {
      // Dates are ISO (`2024-03-05`) but may be ranged (`<=2020-01-01`); grab
      // the first 4-digit year either way.
      const match = status.baseline_low_date.match(/\d{4}/);
      if (match) {
        lowYear = Number(match[0]);
      }
    }
    result = { lowYear, baseline: status.baseline };
  } catch {
    result = { lowYear: null, baseline: false };
  }
  keyBaselineCache.set(key, result);
  return result;
}

/**
 * True if the API clears the active Baseline target's bar on ANY of its
 * consuming interfaces.
 *
 * A mixin member shared across interfaces has one BCD key per interface; keys
 * are combined with OR rather than AND, because the member should survive as
 * long as at least one consuming interface qualifies. A later context (such as
 * MathMLElement, which the cut removes anyway) must not drag the whole member
 * out. Since a member can't predate its interface, a qualifying key implies that
 * interface survives too.
 */
export function isBaselineSuitable(compatKeys: string[] | undefined): boolean {
  // Callers (isSuitable) gate the empty case before reaching here, deferring to
  // the upstream rule when Baseline has no data. Kept defensive: with nothing to
  // check there's no positive evidence the item is too new.
  if (!compatKeys || compatKeys.length === 0) {
    return true;
  }
  const target = baselineTarget;
  if (target === null) {
    return true;
  }
  return compatKeys.some((key) => {
    const { lowYear, baseline } = keyBaseline(key);
    switch (target.kind) {
      case "year":
        return lowYear !== null && lowYear <= target.year;
      case "widely":
        return baseline === "high";
      case "newly":
        return baseline === "low" || baseline === "high";
    }
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
 * Collect the string leaves of the manual inputs for the raw-text reference
 * fallbacks, EXCLUDING declaration identifiers. Two sources of a declared
 * entity's *own* name are dropped so that merely patching an entity does not
 * count as a reference to it:
 *
 * - Object keys (the record key, e.g. `interfaces.interface.WebTransport`) are
 *   never string *values*, so recursing over values alone drops them naturally.
 * - `name`-field values duplicate that record key on the entity itself, so they
 *   are skipped explicitly.
 *
 * What survives is exactly the textual content the structured
 * `collectTypeReferences` scan can't see — raw signature strings in
 * `overrideSignatures`/`overrideType` (e.g. `"...): MathMLElement"`) — which is
 * the only thing these fallbacks need to catch.
 */
function collectManualReferenceStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectManualReferenceStrings(item, out);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "name") {
        continue;
      }
      collectManualReferenceStrings(child, out);
    }
  }
}

/**
 * Word-boundary name matcher over the manual inputs' reference text (string
 * leaf values, declaration identifiers excluded — see
 * `collectManualReferenceStrings`). Leaves are joined with newlines so a name
 * can't straddle two adjacent leaves and form a false `\b` match. Shared by
 * both raw-text fallbacks so they can't drift apart in what counts as a
 * reference.
 */
function manualReferenceMatcher(sources: unknown[]): (name: string) => boolean {
  const strings: string[] = [];
  collectManualReferenceStrings(sources, strings);
  const text = strings.join("\n");
  return (name) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text);
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
 *
 * Only the manual inputs' string *leaf values* are scanned (via
 * `manualReferenceMatcher`), never declaration identifiers — a value type
 * that is merely patched is not thereby referenced. Structured references
 * carried by the manual inputs need no forcing: the inputs are merged into
 * the graph before emit, so the per-scope reachability pass sees them.
 */
export function manuallyReferencedValueTypes(
  webidl: Browser.WebIdl,
  manualInputs: unknown[],
): Set<string> {
  const isManuallyReferenced = manualReferenceMatcher(manualInputs);
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
      isManuallyReferenced(name)
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
 * A resurrected interface is kept as a *type only*: the closure clears its
 * interface-level `exposed: ""` marker (so the type is emitted) but marks it
 * `noInterfaceObject` (so its runtime `declare var` — constructor and statics —
 * is not). The API failed the Baseline bar; only references to its type need to
 * resolve, and emitting the constructor would wrongly let `new X()` type-check.
 *
 * The same `noInterfaceObject` marking is applied to *every* baseline-removed
 * interface, not just resurrected ones. A removed interface can also re-enter
 * the cut through a manual `exposed` override merged after removal (e.g.
 * MIDIAccess/SourceBuffer, which overrides scope to `Window`); it still failed
 * the Baseline bar, so its runtime object must be suppressed there too. For
 * interfaces that simply stay removed the marker is inert — they are never
 * emitted.
 *
 * Mutates and returns `removalData`: clears the interface-level `exposed: ""`
 * marker for resurrected interfaces (keeping their member-level removals) and
 * sets `noInterfaceObject` on every removed interface.
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
  // signature strings (e.g. "...): MathMLElement") matched by name. The text
  // match sees only string *values* with declaration identifiers stripped
  // (see `manualReferenceMatcher`), so a patch that merely modifies an
  // interface — mentioning its own name in the record key/`name` field —
  // does not spuriously resurrect it.
  for (const source of extraReferenceSources) {
    consider(collectTypeReferences(source));
  }
  const isManuallyReferenced = manualReferenceMatcher(extraReferenceSources);
  for (const name of removedNames) {
    if (!resurrected.has(name) && isManuallyReferenced(name)) {
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

  // Interfaces whose runtime object a manual input already suppresses (e.g. the
  // RTCIceCandidatePair override rolls it back toward a dictionary form). Skip
  // them below so noInterfaceObject isn't merged true-onto-true, which warns.
  const alreadyNoInterfaceObject = new Set<string>();
  for (const source of extraReferenceSources) {
    const interfaces = (source as Browser.WebIdl | undefined)?.interfaces
      ?.interface;
    for (const [name, entry] of Object.entries(interfaces ?? {})) {
      if (entry?.noInterfaceObject) {
        alreadyNoInterfaceObject.add(name);
      }
    }
  }

  // Suppress the runtime object of every baseline-removed interface. Whichever
  // way it re-enters the cut — resurrected below for referential closure, or
  // re-exposed by an `exposed` override merged after removal — it failed the
  // Baseline bar, so its `declare var X: { prototype: X; new(...): X }` must not
  // be emitted (that would let `new WebTransport()` / `new MIDIAccess()`
  // type-check in a cut where the API isn't Baseline-available). Only references
  // to the *type* need to resolve. `noInterfaceObject` is exactly "emit the
  // type, not the runtime object". For interfaces that stay removed the marker
  // is inert. Skip interfaces already flagged (by the full graph's
  // [LegacyNoInterfaceObject] or a manual input) to avoid a redundant-merge
  // warning.
  for (const name of removedNames) {
    if (
      !fullInterfaces[name]?.noInterfaceObject &&
      !alreadyNoInterfaceObject.has(name)
    ) {
      removalInterfaces[name].noInterfaceObject = true;
    }
  }
  // Resurrected interfaces have no other path back into the cut, so clear their
  // interface-level `exposed: ""` marker to emit them as a type-only shell.
  // (Override-re-exposed interfaces get their exposure from the override merge.)
  for (const name of resurrected) {
    delete removalInterfaces[name].exposed;
  }
  return removalData;
}
