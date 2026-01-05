#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

/* ================= CONFIG ================= */

const ENV = process.env.ADS_ENV || "test";
const ADS_DIR = "ads";
const LOG_DIR = "logs";

const OUTPUT_FILE =
  ENV === "prod" ? "app-ads.txt" : `app-ads.${ENV}.txt`;

const LOG_FILE = path.join(LOG_DIR, "ads-build-latest.log");

/* =============== UTIL ===================== */

function log(msg = "") {
  console.log(msg);
  fs.appendFileSync(LOG_FILE, msg + "\n");
}

function now() {
  return new Date().toISOString();
}

function isComment(line) {
  return line.startsWith("#");
}

/* ========= CERT VALIDATION ONLY ============ */

function normalize(line, network, invalidCerts) {
  const p = line.split(",").map(x => x.trim());
  if (p.length < 3 || p.length > 4) return null;

  let [domain, pub, rel, cert] = p;

  if (!domain || !pub || !rel) return null;

  domain = domain.toLowerCase();
  rel = rel.toUpperCase();

  if (!/^[a-z0-9.-]+$/.test(domain)) return null;
  if (!["DIRECT", "RESELLER"].includes(rel)) return null;

  let finalCert = null;

  if (cert) {
    const c = cert.toLowerCase();
    if (/^[a-z0-9]+$/.test(c) && (c.length === 9 || c.length === 16)) {
      finalCert = c;
    } else {
      invalidCerts.push({
        network,
        original: line,
        removedCert: cert
      });
    }
  }

  return [domain, pub, rel, finalCert].filter(Boolean).join(", ");
}

/* ================= BUILD =================== */

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

fs.writeFileSync(LOG_FILE, "");
log(`BUILD: ${now()}`);
log(`ENV: ${ENV}`);
log(`OUTPUT: ${OUTPUT_FILE}`);
log("");

const seen = new Set();
const duplicates = [];
const invalidCerts = [];

const networkStats = {};
const output = [];

const files = fs
  .readdirSync(ADS_DIR)
  .filter(f => f.endsWith(".txt"))
  .sort();

for (const file of files) {
  const network = path.basename(file, ".txt");
  const content = fs.readFileSync(path.join(ADS_DIR, file), "utf8");

  networkStats[network] = {
    total: 0,
    added: 0,
    skipped: 0
  };

  output.push(`## ${network}`);

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || isComment(line)) continue;

    networkStats[network].total++;

    const normalized = normalize(line, network, invalidCerts);
    if (!normalized) {
      networkStats[network].skipped++;
      continue;
    }

    if (seen.has(normalized)) {
      networkStats[network].skipped++;
      duplicates.push({
        network,
        entry: normalized
      });
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
    networkStats[network].added++;
  }

  output.push("");
}

/* ============== WRITE OUTPUT =============== */

const finalOutput = output.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
fs.writeFileSync(OUTPUT_FILE, finalOutput);

log(`✅ ${OUTPUT_FILE} generated`);
log("");

/* ============ CHANGE SUMMARY =============== */

log("CHANGE SUMMARY");
for (const [n, s] of Object.entries(networkStats)) {
  log(
    `${n}: entries=${s.added}, skipped=${s.skipped}`
  );
}
log("");

/* =============== DUPLICATES ================= */

log("DUPLICATES");
if (!duplicates.length) {
  log("None");
} else {
  for (const d of duplicates) {
    log(`DUPLICATE ENTRY:`);
    log(d.entry);
    log(`• skipped from: ${d.network}`);
    log("");
  }
}

/* ========= INVALID CERT REMOVALS ============ */

log("INVALID CERT IDS REMOVED");
if (!invalidCerts.length) {
  log("None");
} else {
  for (const c of invalidCerts) {
    log(`⚠️ INVALID CERT ID REMOVED [${c.network}]`);
    log(c.original);
    log("");
  }
}

log("INVALID LINES");
log("None");
