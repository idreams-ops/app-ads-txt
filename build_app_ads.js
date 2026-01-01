/***************************************************
 * BUILD app-ads.txt
 * - Combines network files
 * - Adds ## Network headers
 * - Removes duplicate entries from output
 * - Logs duplicates ONLY to console (GitHub logs)
 * - Supports ENV switch: test / prod
 ***************************************************/

const fs = require("fs");
const path = require("path");
const CONFIG = require("./ads.config");

const ENV = process.env.ADS_ENV || "prod";

const seen = new Map();        // entry -> [networks]
const duplicateMap = new Map(); // entry -> Set(networks)
const outputLines = [];

/* -------------------------------------------------
 * PROCESS NETWORK FILES
 * -------------------------------------------------*/
for (const [network, filePath] of Object.entries(CONFIG.networks)) {

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Missing file: ${filePath}`);
    continue;
  }

  outputLines.push(`## ${network}`);

  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  for (const line of lines) {

    if (!seen.has(line)) {
      seen.set(line, network);
      outputLines.push(line);
    } else {
      // Track duplicates (but DO NOT write to output)
      if (!duplicateMap.has(line)) {
        duplicateMap.set(line, new Set([seen.get(line)]));
      }
      duplicateMap.get(line).add(network);
    }
  }

  outputLines.push(""); // spacing between networks
}

/* -------------------------------------------------
 * WRITE OUTPUT FILE (NO DUPLICATE SECTION)
 * -------------------------------------------------*/
fs.writeFileSync(CONFIG.outputFile, outputLines.join("\n"));

console.log(`✅ ${CONFIG.outputFile} generated (${ENV})`);

/* -------------------------------------------------
 * LOG DUPLICATES (CONSOLE / GITHUB ACTIONS ONLY)
 * -------------------------------------------------*/
if (duplicateMap.size > 0) {
  console.log("⚠️ Duplicate ads.txt entries detected:");

  for (const [entry, networks] of duplicateMap.entries()) {
    console.log(
      `• ${entry} → ${Array.from(networks).join(", ")}`
    );
  }

  // Block PROD builds if duplicates exist
  if (ENV === "prod") {
    console.error("❌ PROD build blocked due to duplicates");
    process.exit(1);
  }
} else {
  console.log("🎉 No duplicate entries found");
}
