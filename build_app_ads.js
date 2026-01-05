/***************************************************
 * BUILD app-ads.txt
 ***************************************************/

const fs = require("fs");
const CONFIG = require("./ads.config");

const ENV = process.env.ADS_ENV || "prod";
const OUTPUT_FILE = CONFIG.outputFile;

/* ---------------- LOG SETUP ---------------- */
const LOG_DIR = "logs";
const LOG_FILE = `${LOG_DIR}/ads-build-latest.log`;
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

const logLines = [];
const log = (l = "") => { console.log(l); logLines.push(l); };

/* -------- NORMALIZE + VALIDATE ------------- */
function normalize(line) {
  const p = line.split(",").map(x => x.trim());
  if (p.length < 3 || p.length > 4) return null;

  let [domain, pub, rel, cert] = p;
  if (!domain || !pub || !rel) return null;

  domain = domain.toLowerCase();
  rel = rel.toUpperCase();

  if (!/^[a-z0-9.-]+$/.test(domain)) return null;
  if (!["DIRECT", "RESELLER"].includes(rel)) return null;

  return [domain, pub, rel, cert].filter(Boolean).join(", ");
}

/* -------- PARSE PREVIOUS OUTPUT ------------- */
function parseByNetwork(text) {
  const m = {};
  let c = null;
  text.split("\n").forEach(l => {
    if (l.startsWith("##")) {
      c = l.replace(/^##\s*/, "");
      m[c] = new Set();
    } else if (c && l.trim()) {
      m[c].add(l.trim());
    }
  });
  return m;
}

let prev = {};
if (fs.existsSync(OUTPUT_FILE)) {
  prev = parseByNetwork(fs.readFileSync(OUTPUT_FILE, "utf8"));
}

/* ---------------- BUILD -------------------- */
const seen = new Map();            // entry -> firstNetwork
const duplicates = [];             // detailed duplicate logs
const invalid = [];
const next = {};
const out = [];

log(`BUILD: ${new Date().toISOString()}`);
log(`ENV: ${ENV}`);
log(`OUTPUT: ${OUTPUT_FILE}`);
log("");

for (const [network, file] of Object.entries(CONFIG.networks)) {

  if (!fs.existsSync(file)) {
    log(`⚠️ Missing file: ${file}`);
    continue;
  }

  out.push(`##${network}`);
  next[network] = new Set();

  const lines = fs.readFileSync(file, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  for (const raw of lines) {
    const n = normalize(raw);

    if (!n) {
      invalid.push({ network, line: raw });
      continue;
    }

    if (!seen.has(n)) {
      seen.set(n, network);
      next[network].add(n);
      out.push(n);
    } else {
      duplicates.push({
        entry: n,
        existingIn: seen.get(n),
        skippedFrom: network
      });
    }
  }
}

/* ------------- WRITE OUTPUT ---------------- */
fs.writeFileSync(OUTPUT_FILE, out.join("\n"));
log(`✅ ${OUTPUT_FILE} generated`);
log("");

/* ------------- CHANGE SUMMARY -------------- */
log("CHANGE SUMMARY");
for (const n of Object.keys(CONFIG.networks)) {
  const a = prev[n] || new Set();
  const b = next[n] || new Set();
  const add = [...b].filter(x => !a.has(x)).length;
  const rem = [...a].filter(x => !b.has(x)).length;

  log(`${n}: entries=${b.size}, +${add}, -${rem}, Δ${add - rem}`);
}
log("");

/* ------------- DUPLICATES ------------------ */
log("DUPLICATES");
if (!duplicates.length) {
  log("None");
} else {
  duplicates.forEach(d => {
    log(`DUPLICATE ENTRY:`);
    log(d.entry);
    log(`• already present in: ${d.existingIn}`);
    log(`• skipped from: ${d.skippedFrom}`);
    log("");
  });
}

/* ------------- INVALID --------------------- */
log("INVALID LINES");
if (!invalid.length) {
  log("None");
} else {
  invalid.forEach(i => log(`[${i.network}] ${i.line}`));
}

/* ------------- WRITE LOG ------------------- */
fs.writeFileSync(LOG_FILE, logLines.join("\n"));

/* ------------- BLOCK PROD ------------------ */
if (ENV === "prod" && (duplicates.length || invalid.length)) {
  console.error("❌ PROD build blocked due to duplicates or invalid lines");
  process.exit(1);
}
