const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));

function computeVersion() {
  if (process.env.RELEASE_VERSION) {
    return process.env.RELEASE_VERSION;
  }

  const [major = "1", minor = "0"] = String(pkg.version).split(".");
  const runNumber = process.env.GITHUB_RUN_NUMBER;

  if (runNumber) {
    return `${major}.${minor}.${runNumber}`;
  }

  return pkg.version;
}

function replaceInFile(relativePath, matcher, replacement) {
  const filePath = path.join(root, relativePath);
  const original = fs.readFileSync(filePath, "utf8");
  if (!matcher.test(original)) {
    throw new Error(`No replacement made in ${relativePath}`);
  }
  const updated = original.replace(matcher, replacement);

  fs.writeFileSync(filePath, updated, "utf8");
}

const releaseVersion = computeVersion();
const releaseCode = String(
  process.env.RELEASE_CODE || process.env.GITHUB_RUN_NUMBER || "1",
);

replaceInFile(
  "www/index.html",
  /const APP_VERSION = '[^']+';/,
  `const APP_VERSION = '${releaseVersion}';`,
);

replaceInFile(
  "www/sw.js",
  /const CACHE_NAME = "isw-english-v[^"]+";/,
  `const CACHE_NAME = "isw-english-v${releaseVersion}";`,
);

replaceInFile(
  "webview-apk/app/build.gradle.kts",
  /versionCode = \d+/,
  `versionCode = ${releaseCode}`,
);

replaceInFile(
  "webview-apk/app/build.gradle.kts",
  /versionName = "[^"]+"/,
  `versionName = "${releaseVersion}"`,
);

console.log(`Stamped release version ${releaseVersion} (code ${releaseCode})`);
