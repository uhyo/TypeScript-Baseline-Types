// @ts-check
// node deploy/publishBaselineTypesPackages.js [--publish] [year ...]
//
// Publishes the @baseline-types/dom-<year> packages built by
// createBaselineTypesPackages.js into deploy/generated/. Dry-run by default:
// pass --publish to actually run `npm publish --access public`.
//
// A package is only (re)published when its .d.ts content differs from the
// version already on npm, so re-running after a no-op data refresh is safe.

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "node:url";
import {
  baselinePackages,
  DEFAULT_YEARS,
} from "./createBaselineTypesPackages.js";

const args = process.argv.slice(2);
const doPublish = args.includes("--publish");
const years = args.filter((a) => /^\d{4}$/.test(a));
const wantedYears = years.length ? years : DEFAULT_YEARS;

const generatedDir = new URL("generated/", import.meta.url);
const packages = baselinePackages(wantedYears);

const uploaded = [];
/** @type {Array<{name: string, version: string}>} Packages actually published. */
const published = [];

for (const pkg of packages) {
  const folderName = pkg.name.replace("@", "").replace("/", "-");
  const packageDir = new URL(`${folderName}/`, generatedDir);
  if (!fs.existsSync(packageDir)) {
    console.log(
      `\nSkipping ${pkg.name}: ${fileURLToPath(packageDir)} not found ` +
        `(run \`npm run baseline-packages\` first).`,
    );
    continue;
  }

  const pkgJSON = JSON.parse(
    fs.readFileSync(new URL("package.json", packageDir), "utf-8"),
  );

  console.log(`\nLooking at ${pkg.name}@${pkgJSON.version}`);

  // Compare each emitted .d.ts against what is on npm for the latest version.
  const dtsFiles = readdirRecursive(fileURLToPath(packageDir)).filter((f) =>
    f.endsWith(".d.ts"),
  );

  let changed = false;
  for (const file of dtsFiles) {
    const localContent = fs.readFileSync(new URL(file, packageDir), "utf8");
    const remote = await getFileFromUnpkg(`${pkg.name}@latest/${file}`);
    if (remote === null) {
      // Package/file not published yet — first release.
      changed = true;
      break;
    }
    if (remote !== localContent) {
      changed = true;
      break;
    }
  }

  if (!changed) {
    console.log(" - no changes vs npm latest; skipping");
    continue;
  }

  if (doPublish) {
    const publish = spawnSync("npm", ["publish", "--access", "public"], {
      cwd: fileURLToPath(packageDir),
      stdio: "inherit",
    });
    if (publish.status) {
      process.exit(publish.status);
    }
    uploaded.push(`${pkg.name}@${pkgJSON.version}`);
    published.push({ name: pkg.name, version: pkgJSON.version });
  } else {
    console.log(
      ` - would run: npm publish --access public  (in ${fileURLToPath(packageDir)})`,
    );
    uploaded.push(`${pkg.name}@${pkgJSON.version} (dry-run)`);
  }
}

console.log("");
if (!doPublish) {
  console.log("Dry run. Re-run with --publish to actually publish to npm.");
}
if (uploaded.length) {
  console.log(
    (doPublish ? "Published: " : "Would publish: ") + uploaded.join(", "),
  );
} else {
  console.log("Nothing to publish.");
}

// When run from CI (e.g. the auto-release workflow), expose the set of packages
// that were actually published as a step output so a later step can tag them
// and cut GitHub Releases. Only real publishes are reported, never dry-runs.
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `published=${JSON.stringify(published)}\n`,
  );
}

/**
 * @param {string} filepath
 * @returns {Promise<string | null>} file text, "" if the version exists but the
 *   file is absent, or null if the package/version isn't published yet.
 */
async function getFileFromUnpkg(filepath) {
  const resp = await fetch(`https://unpkg.com/${filepath}`);
  if (resp.ok) {
    return resp.text();
  }
  if (resp.status === 404) {
    return null;
  }
  throw new Error(`Unexpected response status: ${resp.status} for ${filepath}`);
}

/** @param {string} dir */
function readdirRecursive(dir) {
  /** @type {string[]} */
  const results = [];
  /** @param {string} currentDir */
  function readDir(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        readDir(fullPath);
      } else {
        results.push(path.relative(dir, fullPath));
      }
    }
  }
  readDir(dir);
  return results;
}
