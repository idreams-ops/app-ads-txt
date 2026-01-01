/***************************************************
 * BUILD app-ads.txt
 * - Combines network files
 * - Adds ## Network headers
 * - Removes duplicate entries from output
 * - Validates ads.txt format
 * - Logs per-network changes
 * - Saves latest log in repo
 * - ENV support: test / prod
 ***************************************************/

const fs = require("fs");
const CONFIG = require("./ads.config");

const ENV = process.env.ADS_ENV || "prod";
const OUTPUT_FILE = CONFIG.outputFile;

/* -------------------------------------------------
 * LOG SETUP
 * -------------------------------------------------*/
const LOG_DIR = "logs";
const LOG_FILE = `${LOG_DIR}/ads-build-latest.log`;

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

const logLines = [];
function log(line = "") {
  console.log(line);
  logLines.push(line);
}

/* -------------------------------------------------
 * VALIDATION
 * -------------------------------------------------*/
function isValidAdsLine(line) {
  const parts = line.split(",").map(p => p.trim());
  if (parts.length < 3 || parts.length > 4) return false;

  const [domain, publisherId, relationship] = parts;

  if (!domain || !publisherId || !relationship) return false;
  if (!/^[a-z0-9.-]+$/.test(domain)) return false;
  if (!["DIRECT", "RESELLER"].includes(relationship)) return false;

  return true;
}

/* -------------------------------------------------
 * PARSE PREVIOUS OUTPUT (FOR CHANGE LOG)
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

let previousByNetwork = {};
if (fs.existsSync(OUTPUT_FILE)) {
  previousByNetwork = parseAdsFileByNetwork(
    fs.readFileSync(OUTPUT_FILE, "utf8")
  );
}

/* -------------------------------------------------
 * BUILD NEW OUTPUT
 * -------------------------------------------------*/
const seen = new Map();           // entry -> first network
const duplicateMap = new Map();   // entry -> Set(networks)
const newByNetwork = {};
const invalidLines = [];

const outputLines = [];

log(`BUILD: ${new Date().toISOString()}`);
log(`ENV: ${ENV}`);
log(`OUTPUT: ${OUTPUT_FILE}`);
log("");

for (const [network, filePath] of Object.entries(CONFIG.networks)) {

  if (!fs.existsSync(filePath)) {
    log(`⚠️ Missing file: ${filePath}`);
    continue;
  }

  outputLines.push(`## ${network}`);
  newByNetwork[network] = new Set();

  const lines = fs.readFileSync(filePath, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  for (const line of lines) {

    if (!isValidAdsLine(line)) {
      invalidLines.push({ network, line });
      continue;
    }

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
log(`✅ ${OUTPUT_FILE} generated`);
log("");

/* -------------------------------------------------
 * CHANGE LOG (PER NETWORK)
 * -------------------------------------------------*/
log("=".repeat(30));
log("CHANGE SUMMARY");
log("=".repeat(30));

for (const network of Object.keys(CONFIG.networks)) {
  const oldSet = previousByNetwork[network] || new Set();
  const newSet = newByNetwork[network] || new Set();

  let added = 0;
  let removed = 0;

  for (const e of newSet) if (!oldSet.has(e)) added++;
  for (const e of oldSet) if (!newSet.has(e)) removed++;

  log(`NETWORK: ${network}`);
  log(`Entries   : ${newSet.size}`);
  log(`+ Added   : ${added}`);
  log(`- Removed : ${removed}`);
  log(`Δ Net     : ${added - removed}`);
  log("");
}

/* -------------------------------------------------
 * DUPLICATES
 * -------------------------------------------------*/
log("=".repeat(30));
log("DUPLICATES");
log("=".repeat(30));

if (duplicateMap.size === 0) {
  log("None");
} else {
  for (const [entry, networks] of duplicateMap.entries()) {
    log(entry);
    log(`→ ${Array.from(networks).join(", ")}`);
    log("");
  }
}

/* -------------------------------------------------
 * INVALID LINES
 * -------------------------------------------------*/
log("=".repeat(30));
log("INVALID LINES");
log("=".repeat(30));

if (invalidLines.length === 0) {
  log("None");
} else {
  invalidLines.forEach(i => {
    log(`[${i.network}] ${i.line}`);
  });
}

/* -------------------------------------------------
 * WRITE LOG FILE
 * -------------------------------------------------*/
fs.writeFileSync(LOG_FILE, logLines.join("\n"));

/* -------------------------------------------------
 * BLOCK PROD IF ISSUES
 * -------------------------------------------------*/
if (ENV === "prod" && (duplicateMap.size > 0 || invalidLines.length > 0)) {
  console.error("❌ PROD build blocked due to duplicates or invalid lines");
  process.exit(1);
}
