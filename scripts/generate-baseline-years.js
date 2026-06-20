import { execFileSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Generates a Baseline-year-cut copy of the lib for each given year by running
// the build with BASELINE_YEAR set and copying generated/ to baseline-<year>/.
//
//   node ./scripts/generate-baseline-years.js 2020 2021 2022 2023 2024
//   npm run baseline-years -- 2024

const root = new URL("../", import.meta.url);
const generated = new URL("generated/", root);

const years = process.argv.slice(2);
if (years.length === 0) {
  console.error(
    "Usage: node ./scripts/generate-baseline-years.js <year> [<year> ...]",
  );
  process.exit(1);
}

for (const year of years) {
  if (!/^\d{4}$/.test(year)) {
    throw new Error(`Invalid year: ${year} (expected a 4-digit year)`);
  }
  console.log(`\n=== Generating Baseline ${year} ===`);
  execFileSync("node", ["./src/build.ts"], {
    cwd: fileURLToPath(root),
    stdio: "inherit",
    env: { ...process.env, BASELINE_YEAR: year },
  });
  const out = new URL(`baseline-${year}/`, root);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(generated, out, { recursive: true });
  console.log(`Wrote ${fileURLToPath(out)}`);
}
