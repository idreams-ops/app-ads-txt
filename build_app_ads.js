/***************************************************
 * BUILD app-ads.txt
 ***************************************************/

const fs = require("fs");
const CONFIG = require("./ads.config");

const ENV = process.env.ADS_ENV || "prod";
const OUTPUT_FILE = ENV === "test"
  ? "app-ads.test.txt"
  : "app-ads.txt";

/* ---------------- LOG SETUP ---------------- */

const LOG_DIR = "logs";
const LOG_FILE = `${LOG_DIR}/ads-build-latest.log`;
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

const logLines = [];
function log(l = "") {
  console.log(l);
  logLines.push(l);
}

/* ---------------- CERT VALIDATION ---------------- */

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
      invalidCerts.push({ network, line, removed: cert });
    }
  }

  return [domain, pub, rel, finalCert].filter(Boolean).join(", ");
}

/* ---------------- LOAD PREVIOUS FILE ---------------- */

function parseByNetwork(txt) {
  const map = {};
  let cur = null;
  txt.split("\n").forEach(l => {
    if (l.startsWith("##")) {
      cur = l.replace("##", "").trim();
      map[cur] = new Set();
    } else if (cur && l.trim()) {
      map[cur].add(l.trim());
    }
  });
  return map;
}

let previous = {};
if (fs.existsSync(OUTPUT_FILE)) {
  previous = parseByNetwork(fs.readFileSync(OUTPUT_FILE, "utf8"));
}

/* ---------------- BUILD ---------------- */

const seen = new Map(); // line -> first network
const duplicateMap = new Map(); // line -> {presentIn, skippedFrom:Set}
const invalidCerts = [];
const newByNetwork = {};
const skippedCount = {};

const output = [];

log(`BUILD: ${new Date().toISOString()}`);
log(`ENV: ${ENV}`);
log(`OUTPUT: ${OUTPUT_FILE}`);
log("");

for (const [network, file] of Object.entries(CONFIG.networks)) {
  newByNetwork[network] = new Set();
  skippedCount[network] = 0;

  if (!fs.existsSync(file)) {
    log(`⚠️ Missing: ${file}`);
    continue;
  }

  output.push(`## ${network}`);

  fs.readFileSync(file, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .forEach(raw => {
      const n = normalize(raw, network, invalidCerts);
      if (!n) return;

      if (!seen.has(n)) {
        seen.set(n, network);
        newByNetwork[network].add(n);
        output.push(n);
      } else {
        skippedCount[network]++;
        if (!duplicateMap.has(n)) {
          duplicateMap.set(n, {
            presentIn: seen.get(n),
            skippedFrom: new Set()
          });
        }
        duplicateMap.get(n).skippedFrom.add(network);
      }
    });
}

/* ---------------- WRITE OUTPUT ---------------- */

fs.writeFileSync(OUTPUT_FILE, output.join("\n"));
log(`✅ ${OUTPUT_FILE} generated`);
log("");

/* ---------------- CHANGE SUMMARY ---------------- */

log("CHANGE SUMMARY");
for (const net of Object.keys(CONFIG.networks)) {
  const oldSet = previous[net] || new Set();
  const newSet = newByNetwork[net] || new Set();
  let added = 0, removed = 0;

  newSet.forEach(e => { if (!oldSet.has(e)) added++; });
  oldSet.forEach(e => { if (!newSet.has(e)) removed++; });

  log(
    `${net}: entries=${newSet.size}, +${added}, -${removed}, Δ${added - removed}, skipped=${skippedCount[net]}`
  );
}
log("");

/* ---------------- DUPLICATES ---------------- */

log("DUPLICATES");
if (!duplicateMap.size) {
  log("None");
} else {
  for (const [entry, info] of duplicateMap.entries()) {
    log("DUPLICATE ENTRY:");
    log(entry);
    log(`• already present in: ${info.presentIn}`);
    log(`• skipped from: ${Array.from(info.skippedFrom).join(", ")}`);
  }
}
log("");

/* ---------------- INVALID CERTS ---------------- */

log("INVALID CERT IDS REMOVED");
if (!invalidCerts.length) {
  log("None");
} else {
  invalidCerts.forEach(i => {
    log(`⚠️ INVALID CERT ID REMOVED [${i.network}]`);
    log(i.line);
  });
}
log("");

/* ---------------- SAVE LOG ---------------- */

fs.writeFileSync(LOG_FILE, logLines.join("\n"));

/* ---------------- PROD GUARD ---------------- */

if (ENV === "prod" && invalidCerts.length) {
  console.error("❌ PROD blocked due to invalid cert IDs");
  process.exit(1);
}
