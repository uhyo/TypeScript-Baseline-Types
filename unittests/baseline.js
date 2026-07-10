// Unit tests for the Baseline cut machinery (src/build/bcd/baseline.ts).
// These run WITHOUT BASELINE_TARGET set: the functions under test are pure
// graph logic that doesn't consult the active target, plus the target parser
// itself. Each fixture encodes a bug the cut has actually had (see PRs #11,
// #13, #14) so the fix can't silently regress.
import assert from "node:assert/strict";
import {
  applyReferenceClosure,
  interfaceCompatKeys,
  manuallyReferencedValueTypes,
  memberCompatKeys,
  parseBaselineTarget,
  reassertBaselineRemovals,
} from "../src/build/bcd/baseline.ts";

// parseBaselineTarget: the three target forms, and rejection of everything else.
{
  assert.equal(parseBaselineTarget(undefined), null);
  assert.equal(parseBaselineTarget(""), null);
  assert.deepEqual(parseBaselineTarget("2024"), { kind: "year", year: 2024 });
  assert.deepEqual(parseBaselineTarget("newly-available"), { kind: "newly" });
  assert.deepEqual(parseBaselineTarget("widely-available"), {
    kind: "widely",
  });
  assert.throws(() => parseBaselineTarget("1999"), /Invalid BASELINE_TARGET/);
  assert.throws(() => parseBaselineTarget("20244"), /Invalid BASELINE_TARGET/);
  assert.throws(() => parseBaselineTarget("widely"), /Invalid BASELINE_TARGET/);
}

// Compat-key resolvers are inert without an active cut (BASELINE_TARGET unset
// in this process), so the mapper can call them unconditionally.
{
  assert.equal(interfaceCompatKeys("AbortController"), undefined);
  assert.equal(memberCompatKeys("AbortController", "abort", {}), undefined);
}

// applyReferenceClosure on a small graph exercising every decision path:
// - RefTarget    removed, referenced by a *surviving* member       -> resurrected
// - ChainedRef   removed, referenced only by RefTarget's own member -> resurrected (fixpoint)
// - RawStringRef removed, referenced only inside a raw override
//                signature string in the manual inputs              -> resurrected
// - DroppedRef   removed, referenced only by a member that is
//                itself baseline-removed                            -> stays removed
// - PatchedOnly  removed, its name appears in the manual inputs
//                only as a declaration (record key + name field)    -> stays removed (#13)
const makeGraph = () => ({
  webidl: {
    interfaces: {
      interface: {
        Keeper: {
          name: "Keeper",
          exposed: "Window",
          properties: {
            property: {
              uses: { name: "uses", type: "RefTarget" },
              gone: { name: "gone", type: "DroppedRef" },
            },
          },
        },
        RefTarget: {
          name: "RefTarget",
          exposed: "Window",
          properties: {
            property: {
              chained: { name: "chained", type: "ChainedRef" },
            },
          },
        },
        ChainedRef: { name: "ChainedRef", exposed: "Window" },
        RawStringRef: { name: "RawStringRef", exposed: "Window" },
        DroppedRef: { name: "DroppedRef", exposed: "Window" },
        PatchedOnly: { name: "PatchedOnly", exposed: "Window" },
      },
    },
  },
  removalData: {
    interfaces: {
      interface: {
        Keeper: {
          name: "Keeper",
          properties: {
            property: { gone: { exposed: "" } },
          },
        },
        RefTarget: { name: "RefTarget", exposed: "" },
        ChainedRef: { name: "ChainedRef", exposed: "" },
        RawStringRef: { name: "RawStringRef", exposed: "" },
        DroppedRef: { name: "DroppedRef", exposed: "" },
        PatchedOnly: { name: "PatchedOnly", exposed: "" },
      },
    },
  },
  manualInputs: [
    {
      interfaces: {
        interface: {
          Keeper: {
            name: "Keeper",
            methods: {
              method: {
                make: {
                  name: "make",
                  overrideSignatures: ["make(): RawStringRef"],
                },
              },
            },
          },
          PatchedOnly: { name: "PatchedOnly", deprecated: 1 },
        },
      },
    },
  ],
});

{
  const { webidl, removalData, manualInputs } = makeGraph();
  const plan = applyReferenceClosure(webidl, removalData, manualInputs);
  const entries = plan.removalData.interfaces.interface;

  assert.deepEqual(
    [...plan.resurrected].sort(),
    ["ChainedRef", "RawStringRef", "RefTarget"],
    "surviving/raw-string/fixpoint references resurrect",
  );
  assert.deepEqual(
    [...plan.stillRemoved].sort(),
    ["DroppedRef", "PatchedOnly"],
    "removed-member references and patch declaration sites do not resurrect",
  );

  // Resurrected interfaces come back as type-only shells (#11): removal
  // marker cleared, runtime object suppressed.
  for (const name of plan.resurrected) {
    assert.equal(entries[name].exposed, undefined, `${name} re-exposed`);
    assert.equal(entries[name].noInterfaceObject, true, `${name} type-only`);
  }
  // Every baseline-removed interface has its runtime object suppressed, even
  // ones that stay removed — an `exposed` override may re-expose their type
  // later, and the constructor must not come along (#13).
  for (const name of plan.stillRemoved) {
    assert.equal(entries[name].exposed, "", `${name} stays removed`);
    assert.equal(entries[name].noInterfaceObject, true, `${name} type-only`);
  }
  // Member-level removals survive resurrection untouched.
  assert.equal(entries.Keeper.properties.property.gone.exposed, "");
}

// reassertBaselineRemovals (#14): a manual `exposed` override merged after the
// removal data must not decide Baseline membership. Only the interfaces the
// closure proved unreferenced are re-removed.
{
  const { webidl, removalData, manualInputs } = makeGraph();
  const plan = applyReferenceClosure(webidl, removalData, manualInputs);
  // Simulate `merge(webidl, overriddenItems)` overwriting cut markers.
  webidl.interfaces.interface.DroppedRef.exposed = "Window";
  webidl.interfaces.interface.RefTarget.exposed = "Window";
  reassertBaselineRemovals(webidl, plan.stillRemoved);
  assert.equal(
    webidl.interfaces.interface.DroppedRef.exposed,
    "",
    "unreferenced removal is authoritative over the override",
  );
  assert.equal(
    webidl.interfaces.interface.RefTarget.exposed,
    "Window",
    "resurrected interfaces are not re-removed",
  );
}

// manuallyReferencedValueTypes: value types are forced only when a manual
// input genuinely references them in a string value — never because they are
// merely declared/patched there (the value-type twin of #13) — and the forced
// set is closed under the value types' own references.
{
  const webidl = {
    interfaces: {
      interface: {
        SameName: { name: "SameName", exposed: "Window" },
      },
    },
    dictionaries: {
      dictionary: {
        ForcedDict: {
          name: "ForcedDict",
          members: {
            member: { parent: { name: "parent", type: "ParentDict" } },
          },
        },
        ParentDict: { name: "ParentDict", members: { member: {} } },
        PatchedDict: { name: "PatchedDict", members: { member: {} } },
      },
    },
    enums: { enum: {} },
    typedefs: { typedef: [{ name: "SameName", type: "number" }] },
  };
  const manualInputs = [
    {
      interfaces: {
        interface: {
          X: {
            name: "X",
            methods: {
              method: {
                m: {
                  name: "m",
                  // References ForcedDict and SameName only via raw text.
                  overrideSignatures: ["m(init: ForcedDict): SameName"],
                },
              },
            },
          },
        },
      },
      dictionaries: {
        // A patch that merely modifies PatchedDict: declaration site only.
        dictionary: { PatchedDict: { name: "PatchedDict", deprecated: 1 } },
      },
    },
  ];
  const forced = manuallyReferencedValueTypes(webidl, manualInputs);
  assert.deepEqual(
    [...forced].sort(),
    ["ForcedDict", "ParentDict"],
    "raw-string reference forces the type and closes over its own references; " +
      "patched-only and nominal-named types stay out",
  );
}

console.log("baseline unit tests passed");
