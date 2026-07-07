import { execFileSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DEFAULT_TARGETS } from "../deploy/createBaselineTypesPackages.js";

// Generates a Baseline cut of the lib for each given target by running the build
// with BASELINE_TARGET set and copying generated/ to baseline-<target>/.
//
// A target is either a 4-digit year (a frozen per-year cut) or one of the moving
// cuts "newly-available" / "widely-available", which track the latest Baseline
// state instead of a fixed year.
//
//   node ./scripts/generate-baseline-years.js 2020 2021 newly-available
//   npm run baseline-years -- 2024
//   npm run baseline-years -- widely-available
//
// With no targets given, falls back to DEFAULT_TARGETS (the same default set
// createBaselineTypesPackages.js / publishBaselineTypesPackages.js use), so the
// release pipeline can run `npm run baseline-years` with no arguments.

const root = new URL("../", import.meta.url);
const generated = new URL("generated/", root);

const args = process.argv.slice(2);
const targets = args.length ? args : DEFAULT_TARGETS;

for (const target of targets) {
  if (
    !/^\d{4}$/.test(target) &&
    target !== "newly-available" &&
    target !== "widely-available"
  ) {
    throw new Error(
      `Invalid target: ${target} ` +
        `(expected a 4-digit year, "newly-available", or "widely-available")`,
    );
  }
  console.log(`\n=== Generating Baseline ${target} ===`);
  execFileSync("node", ["./src/build.ts"], {
    cwd: fileURLToPath(root),
    stdio: "inherit",
    env: { ...process.env, BASELINE_TARGET: target },
  });
  const out = new URL(`baseline-${target}/`, root);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(generated, out, { recursive: true });
  console.log(`Wrote ${fileURLToPath(out)}`);
}
