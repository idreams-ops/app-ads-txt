/***************************************************
 * BUILD app-ads.txt
 * - Combines network files
 * - Adds ## Network headers
 * - Removes duplicate entries from output
 * - Logs duplicates ONLY to console
 * - Logs per-network change summary vs last build
 * - ENV support: test / prod
 ***************************************************/

const fs = require("fs");
const CONFIG = require("./ads.config");

const ENV = process.env.ADS_ENV || "prod";
const OUTPUT_FILE = CONFIG.outputFile;

/* -------------------------------------------------
 * HELPERS
 * -------------------------------------------------*/
function parseAdsFileByNetwork(content) {
  const map = {};
  let current = null;

  content.split("\n").forEach(line => {
    const l = line.trim();
    if (!l) return;

    if (l.startsWith("## ")) {
      current = l.replace("## ", "");
      map[current] = new Set();
    } else if (current) {
      map[current].add(l);
    }
  });

  return map;
}

/* -------------------------------------------------
 * LOAD PREVIOUS OUTPUT (IF EXISTS)
 * -------------------------------------------------*/
let previousByNetwork = {};

if (fs.existsSync(OUTPUT_FILE)) {
  const prevContent = fs.readFileSync(OUTPUT_FILE, "utf8");
  previousByNetwork = parseAdsFileByNetwork(prevContent);
}

/* -------------------------------------------------
 * BUILD NEW OUTPUT
 * -------------------------------------------------*/
const seen = new Map();              // entry -> first network
const duplicateMap = new Map();      // entry -> Set(networks)
const newByNetwork = {};
const outputLines = [];

for (const [network, filePath] of Object.entries(CONFIG.networks)) {

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Missing file: ${filePath}`);
    continue;
  }

  outputLines.push(`## ${network}`);
  newByNetwork[network] = new Set();

  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  for (const line of lines) {

    if (!seen.has(line)) {
      seen.set(line, network);
      newByNetwork[network].add(line);
      outputLines.push(line);
    } else {
      if (!duplicateMap.has(line)) {
        duplicateMap.set(line, new Set([seen.get(line)]));
      }
      duplicateMap.get(line).add(network);
    }
  }

  outputLines.push("");
}

/* -------------------------------------------------
 * WRITE OUTPUT FILE
 * -------------------------------------------------*/
fs.writeFileSync(OUTPUT_FILE, outputLines.join("\n"));
console.log(`✅ ${OUTPUT_FILE} generated (${ENV})`);

/* -------------------------------------------------
 * CHANGE LOG
 * -------------------------------------------------*/
console.log("\n📊 CHANGE SUMMARY (vs previous build)\n");

for (const network of Object.keys(CONFIG.networks)) {

  const oldSet = previousByNetwork[network] || new Set();
  const newSet = newByNetwork[network] || new Set();

  let added = 0;
  let removed = 0;

  for (const e of newSet) if (!oldSet.has(e)) added++;
  for (const e of oldSet) if (!newSet.has(e)) removed++;

  console.log(`${network}:`);
  console.log(`  + Added   : ${added}`);
  console.log(`  - Removed : ${removed}`);
  console.log(`  Δ Net     : ${added - removed}\n`);
}

/* -------------------------------------------------
 * DUPLICATE LOG (CONSOLE ONLY)
 * -------------------------------------------------*/
if (duplicateMap.size > 0) {
  console.log("⚠️ DUPLICATE ENTRIES DETECTED:");

  for (const [entry, networks] of duplicateMap.entries()) {
    console.log(
      `• ${entry} → ${Array.from(networks).join(", ")}`
    );
  }

  if (ENV === "prod") {
    console.error("❌ PROD build blocked due to duplicates");
    process.exit(1);
  }
} else {
  console.log("🎉 No duplicate entries found");
}
