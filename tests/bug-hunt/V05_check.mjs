import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = "d:\\kerjaan\\projek-ndiri\\island";

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return null;
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else {
      out.push(path.relative(root, full));
    }
  }
  return out;
}

function findFilesMatching(dir, pattern, ignore = ["node_modules", ".git", "target", "dist"]) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesMatching(full, pattern, ignore));
    } else if (pattern.test(entry.name)) {
      results.push(path.relative(root, full));
    }
  }
  return results;
}

// 1. Check AppxManifest.xml
const manifestPath = path.join(root, "AppxManifest.xml");
const manifestContent = fs.readFileSync(manifestPath, "utf8");
const manifestLines = manifestContent.split(/\r?\n/);
const assetRefs = [];
manifestLines.forEach((line, idx) => {
  const matches = [...line.matchAll(/Assets\\[^\s"<]+/g)].map(m => m[0]);
  if (matches.length > 0) {
    assetRefs.push({ line: idx + 1, assets: matches, text: line.trim() });
  }
});
const assetsDirExists = fs.existsSync(path.join(root, "Assets"));
const maxVerMatch = manifestContent.match(/MaxVersionTested="([^"]+)"/);
const allLogoMatches = findFilesMatching(root, /(StoreLogo|GILI-Square|GILI-Wide|Square150|Square44|Square310|Square71|Wide310)/i);

// 2. Check tsconfig.json and src/components/navbar
const tsconfigPath = path.join(root, "tsconfig.json");
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
const parsedDefault = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const programDefault = ts.createProgram(parsedDefault.fileNames, parsedDefault.options);

const defaultNavbarSourceFiles = programDefault
  .getSourceFiles()
  .map(sf => path.relative(root, sf.fileName))
  .filter(rel => rel.startsWith(path.join("src", "components", "navbar")));

const rawWithoutExclude = { ...configFile.config, exclude: [] };
const parsedAll = ts.parseJsonConfigFileContent(rawWithoutExclude, ts.sys, root);
const programAll = ts.createProgram(parsedAll.fileNames, parsedAll.options);

const allNavbarSourceFiles = programAll
  .getSourceFiles()
  .map(sf => path.relative(root, sf.fileName))
  .filter(rel => rel.startsWith(path.join("src", "components", "navbar")));

const skippedByDefaultTsc = allNavbarSourceFiles.filter(
  f => !defaultNavbarSourceFiles.includes(f)
);

const diagnosticsAll = ts.getPreEmitDiagnostics(programAll);
const navbarDiagnostics = diagnosticsAll
  .filter(d => d.file && path.normalize(d.file.fileName).includes(path.normalize("src/components/navbar")))
  .map(d => {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    return {
      file: path.relative(root, d.file.fileName),
      line: line + 1,
      col: character + 1,
      code: d.code,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n")
    };
  });

const popoverDir = path.join(root, "src", "components", "navbar", "popovers");
const actualPopoverFiles = listFilesRecursive(popoverDir) || [];
const srcFiles = listFilesRecursive(path.join(root, "src")) || [];

const popoverUsage = {};
let totalPopoverLines = 0;
for (const popFile of actualPopoverFiles) {
  const baseName = path.basename(popFile, path.extname(popFile));
  const content = fs.readFileSync(path.join(root, popFile), "utf8");
  const linesCount = content.split(/\r?\n/).length;
  totalPopoverLines += linesCount;
  const importers = [];
  for (const sFile of srcFiles) {
    if (sFile === popFile) continue;
    const sContent = fs.readFileSync(path.join(root, sFile), "utf8");
    if (sContent.includes(baseName)) {
      importers.push(sFile);
    }
  }
  const importsNavbarTypes = content.includes("types/navbar");
  popoverUsage[popFile] = { baseName, linesCount, importers, importsNavbarTypes };
}

const claimedPopoverNames = [
  "BatteryDetailPopover.tsx",
  "CalendarModal.tsx",
  "DeviceCard.tsx",
  "WeatherPopover.tsx"
];
const claimedExists = {};
for (const name of claimedPopoverNames) {
  claimedExists[name] = fs.existsSync(path.join(popoverDir, name));
}

console.log(JSON.stringify({
  T14_01: {
    manifestAssetRefsByLine: assetRefs,
    assetsDirExists,
    maxVersionTested: maxVerMatch ? maxVerMatch[1] : null,
    matchingLogoFilesInRepo: allLogoMatches
  },
  T14_02: {
    tsconfigInclude: configFile.config.include,
    tsconfigExclude: configFile.config.exclude,
    navbarFilesLoadedViaImportsInDefaultTsc: defaultNavbarSourceFiles,
    navbarFilesCompletelySkippedByDefaultTsc: skippedByDefaultTsc,
    claimedPopoverFilesExist: claimedExists,
    actualPopoverFilesInNavbarPopovers: popoverUsage,
    totalActualPopoverLines: totalPopoverLines,
    typecheckErrorsInNavbarWhenExcludeRemoved: navbarDiagnostics
  }
}, null, 2));
