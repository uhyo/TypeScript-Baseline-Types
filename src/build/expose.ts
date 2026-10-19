import * as Browser from "./types.ts";
import {
  getEmptyWebIDL,
  deepFilter,
  exposesTo,
  followTypeReferences,
  filterProperties,
  mapToArray,
  arrayToMap,
  collectTypeReferences,
} from "./helpers.ts";
import { isEmptyRecord } from "./utils/record.ts";
import { isBaselineCut } from "./bcd/baseline.ts";

class LoggedSet extends Set<string> {
  private unvisited: Set<string>;

  constructor(set: Set<string>) {
    super(set);
    this.unvisited = new Set(set);
  }
  has(value: string) {
    this.unvisited.delete(value);
    return super.has(value);
  }
  unvisitedValues() {
    return this.unvisited.values();
  }
}

export function getExposedTypes(
  webidl: Browser.WebIdl,
  target: string[],
  forceKnownTypes: Set<string>,
  extraKnownTypes: Set<string> = new Set(),
): Browser.WebIdl {
  const forceKnownTypesLogged = new LoggedSet(forceKnownTypes);

  const unexposedTypes = new Set<string>();
  const filtered = getEmptyWebIDL();
  if (webidl.interfaces) {
    filtered.interfaces!.interface = deepFilter(
      webidl.interfaces.interface,
      (o) => exposesTo(o, target),
    );
    const unexposedInterfaces = mapToArray(webidl.interfaces.interface).filter(
      (i) => !exposesTo(i, target),
    );
    for (const i of unexposedInterfaces) {
      unexposedTypes.add(i.name);
    }
  }
  if (webidl.namespaces) {
    filtered.namespaces = deepFilter(webidl.namespaces, (o) =>
      exposesTo(o, target),
    );
  }

  if (webidl.mixins) {
    const allIncludes = Object.values(filtered.interfaces?.interface || {})
      .map((i) => i.implements || [])
      .flat();
    const mixins = deepFilter(webidl.mixins.mixin, (o) => exposesTo(o, target));
    filtered.mixins!.mixin = filterProperties(
      mixins,
      (m: Browser.Interface) =>
        allIncludes.includes(m.name) && !isEmptyMixin(m),
    );
    for (const value of Object.values(filtered.interfaces!.interface || {})) {
      if (value.implements) {
        value.implements = value.implements.filter(
          (i) => !!filtered.mixins!.mixin[i],
        );
      }
    }
  }

  const referencedIDLTypes = new Set([
    ...followTypeReferences(webidl, filtered.interfaces!.interface),
    ...followTypeReferences(
      webidl,
      arrayToMap(
        filtered.namespaces!,
        (i) => i.name,
        (i) => i,
      ),
    ),
  ]);
  const knownIDLTypes = new Set([
    ...referencedIDLTypes,
    // Value types referenced only by raw-string manual overrides, which
    // followTypeReferences can't see (baseline cut only).
    ...scopeExtraKnownTypes(
      webidl,
      extraKnownTypes,
      unexposedTypes,
      referencedIDLTypes,
    ),
  ]);
  const isKnownName = (o: { name: string }) =>
    knownIDLTypes.has(o.name) || forceKnownTypesLogged.has(o.name);

  if (webidl.typedefs) {
    const referenced = webidl.typedefs.typedef.filter(
      (t) => knownIDLTypes.has(t.name) || forceKnownTypesLogged.has(t.name),
    );
    const { exposed, removed } = filterTypedefs(referenced, unexposedTypes);
    removed.forEach((s) => unexposedTypes.add(s));
    filtered.typedefs!.typedef = exposed;
  }

  if (webidl.callbackFunctions) {
    filtered.callbackFunctions!.callbackFunction = filterProperties(
      webidl.callbackFunctions!.callbackFunction,
      isKnownName,
    );
  }
  if (webidl.callbackInterfaces) {
    filtered.callbackInterfaces!.interface = filterProperties(
      webidl.callbackInterfaces!.interface,
      isKnownName,
    );
  }
  if (webidl.dictionaries) {
    filtered.dictionaries!.dictionary = filterProperties(
      webidl.dictionaries.dictionary,
      isKnownName,
    );
  }
  if (webidl.enums) {
    filtered.enums!.enum = filterProperties(webidl.enums.enum, isKnownName);
  }

  for (const unvisited of forceKnownTypesLogged.unvisitedValues()) {
    console.warn(`${unvisited} is redundant in knownTypes.json (${target})`);
  }

  return deepFilterUnexposedTypes(filtered, unexposedTypes);
}

/**
 * Filters unexposed types out from typedefs and
 * removes typedefs that only contains unexposed type names
 * @param typedefs target typedef array
 * @param unexposedTypes type names to be filtered out
 */
function filterTypedefs(
  typedefs: Browser.TypeDef[],
  unexposedTypes: Set<string>,
): { exposed: Browser.TypeDef[]; removed: Set<string> } {
  const exposed: Browser.TypeDef[] = [];
  const removed = new Set<string>();

  typedefs.forEach(filterTypedef);
  if (removed.size) {
    const result = filterTypedefs(exposed, removed);
    result.removed.forEach((s) => removed.add(s));
    return { exposed: result.exposed, removed };
  } else {
    return { exposed, removed };
  }

  function filterTypedef(typedef: Browser.TypeDef) {
    if (typedef.overrideType) {
      exposed.push(typedef);
    } else if (Array.isArray(typedef.type)) {
      const filteredType = filterUnexposedTypeFromUnion(
        typedef.type,
        unexposedTypes,
      );
      if (!filteredType.length) {
        removed.add(typedef.name);
      } else {
        exposed.push({ ...typedef, type: flattenType(filteredType) });
      }
    } else if (unexposedTypes.has(typedef.type)) {
      removed.add(typedef.name);
    } else {
      exposed.push(typedef);
    }
  }
}

/**
 * Filters out unexposed type names from union types and optional function arguments
 * @param webidl target types
 * @param unexposedTypes type names to be filtered out
 */
/** Fields holding raw TypeScript, which the unexposed-type filter can't see into. */
const rawTypeKeys = new Set([
  "overrideType",
  "overrideSignatures",
  "additionalSignatures",
  "overrideIndexSignatures",
  "overrideThis",
]);

function collectRawTypeIdentifiers(
  value: unknown,
  out: Set<string>,
  raw = false,
): void {
  if (typeof value === "string") {
    if (raw) {
      for (const [identifier] of value.matchAll(/[A-Za-z_$][\w$]*/g)) {
        out.add(identifier);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRawTypeIdentifiers(item, out, raw);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectRawTypeIdentifiers(child, out, raw || rawTypeKeys.has(key));
    }
  }
}

/**
 * The extra known types are forced into every scope, so drop the ones whose
 * raw-string overrides name an interface this scope doesn't expose (e.g.
 * Keyframe's index signature naming the window-only CSSStyleValue in
 * AudioWorklet), then the ones left referencing a dropped type.
 */
function scopeExtraKnownTypes(
  webidl: Browser.WebIdl,
  extraKnownTypes: Set<string>,
  unexposedTypes: Set<string>,
  referencedIDLTypes: Set<string>,
): Set<string> {
  if (!extraKnownTypes.size) {
    return extraKnownTypes;
  }
  const defs = new Map<string, unknown>();
  for (const def of [
    ...Object.values(webidl.dictionaries?.dictionary ?? {}),
    ...Object.values(webidl.enums?.enum ?? {}),
    ...(webidl.typedefs?.typedef ?? []),
  ]) {
    defs.set(def.name, def);
  }
  const rawReferences = new Map<string, Set<string>>();
  for (const name of extraKnownTypes) {
    const identifiers = new Set<string>();
    collectRawTypeIdentifiers(defs.get(name), identifiers);
    rawReferences.set(name, identifiers);
  }

  const kept = new Set(extraKnownTypes);
  // Structured references to unexposed types are filtered member by member
  // later on, so only a dropped extra type makes one dangle.
  const isDropped = (name: string) =>
    extraKnownTypes.has(name) &&
    !kept.has(name) &&
    !referencedIDLTypes.has(name);
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of kept) {
      const raw = [...rawReferences.get(name)!];
      if (
        raw.some((r) => unexposedTypes.has(r) || isDropped(r)) ||
        collectTypeReferences(defs.get(name)).some(isDropped)
      ) {
        kept.delete(name);
        changed = true;
      }
    }
  }
  return kept;
}

function deepFilterUnexposedTypes(
  webidl: Browser.WebIdl,
  unexposedTypes: Set<string>,
) {
  return deepClone(webidl, (o) => {
    if (Array.isArray(o.type)) {
      return {
        ...o,
        type: filterUnexposedTypeFromUnion(o.type, unexposedTypes),
      };
    }
    if (!o.overrideSignatures && Array.isArray(o.signature)) {
      return {
        ...o,
        signature: o.signature.map(filterUnknownTypeFromSignature),
      };
    }
    if (o.members) {
      return filterUnknownTypeFromDictionary(o);
    }
    // TODO: Support filtering dictionary members
  });

  function filterUnknownTypeFromSignature(signature: Browser.Signature) {
    if (!signature.param) {
      return signature;
    }
    const param: Browser.Param[] = [];
    for (const p of signature.param) {
      const types = Array.isArray(p.type) ? p.type : [p];
      const filtered = filterUnexposedTypeFromUnion(types, unexposedTypes);
      if (filtered.length >= 1) {
        const additionalTypes = filterAdditionalTypes(
          p.additionalTypes,
          unexposedTypes,
        );
        param.push({
          ...p,
          type: flattenType(filtered),
          additionalTypes,
        });
      } else if (!p.optional) {
        if (isBaselineCut) {
          // A Baseline cut can leave a kept API with a non-optional
          // parameter whose type isn't exposed in this scope (e.g. a worker
          // interface referencing a window-only type). The reference can't be
          // satisfied here, so degrade the parameter to `any` rather than fail.
          param.push({ ...p, type: "any" });
          continue;
        }
        throw new Error(`A non-optional parameter has unknown type: ${p.type}`);
      } else {
        // safe to skip
        break;
      }
    }
    return { ...signature, param };
  }

  function filterUnknownTypeFromDictionary(dictionary: Browser.Dictionary) {
    const result: Record<string, Browser.Member> = {};
    for (const member of Object.values(dictionary.members.member)) {
      const filtered = filterUnexposedType(member, unexposedTypes);
      if (filtered) {
        result[member.name] = filtered;
      }
    }
    return { ...dictionary, members: { member: result } };
  }
}

function filterUnexposedType<T extends Browser.Typed>(
  type: T,
  unexposedTypes: Set<string>,
) {
  if (Array.isArray(type.type)) {
    const filteredUnion = filterUnexposedTypeFromUnion(
      type.type,
      unexposedTypes,
    );
    if (filteredUnion.length) {
      return {
        ...type,
        type: flattenType(filteredUnion),
        additionalTypes: filterAdditionalTypes(
          type.additionalTypes,
          unexposedTypes,
        ),
      };
    }
  } else if (!type.overrideType && unexposedTypes.has(type.type)) {
    return;
  } else {
    const additionalTypes = filterAdditionalTypes(
      type.additionalTypes,
      unexposedTypes,
    );
    return type.additionalTypes ? { ...type, additionalTypes } : type;
  }
}

function filterAdditionalTypes(
  additionalTypes: string[] | undefined,
  unexposedTypes: Set<string>,
) {
  const filtered = additionalTypes?.filter(
    (additionalType) => !unexposedTypes.has(additionalType),
  );
  return filtered?.length ? filtered : undefined;
}

function filterUnexposedTypeFromUnion(
  union: Browser.Typed[],
  unexposedTypes: Set<string>,
): Browser.Typed[] {
  const result: Browser.Typed[] = [];
  for (const type of union) {
    const filtered = filterUnexposedType(type, unexposedTypes);
    if (filtered) {
      result.push(filtered);
    }
  }
  return result;
}

function deepClone<T>(o: T, custom: (o: any) => any): T {
  if (!o || typeof o !== "object") {
    return o;
  }
  if (Array.isArray(o)) {
    return o.map((v) => deepClone(v, custom)) as any as T;
  }
  const mapped = custom(o);
  if (mapped !== undefined) {
    return mapped;
  }
  const clone: any = {};
  for (const key of Object.getOwnPropertyNames(o)) {
    clone[key] = deepClone((o as any)[key], custom);
  }
  return clone;
}

function flattenType(type: Browser.Typed[]) {
  if (type.length > 1) {
    return type;
  } else if (type.length === 1) {
    return type[0].type;
  }
  throw new Error("Cannot process empty union type");
}

function isEmptyMixin(i?: Browser.Interface) {
  return (
    !!i?.mixin &&
    // (extends can only happen by patches)
    !i.extends &&
    isEmptyRecord(i.properties?.property) &&
    isEmptyRecord(i.methods?.method) &&
    isEmptyRecord(i.constants?.constant) &&
    !i.anonymousMethods?.method.length &&
    !i.events?.event.length
  );
}
