const fs = require("fs");
const path = require("path");
const CONFIG = require("./ads.config");

const seen = new Map();     // entry -> [networks]
const output = [];
const duplicateLog = [];

for (const [network, filePath] of Object.entries(CONFIG.networks)) {

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Missing file: ${filePath}`);
    continue;
  }

  output.push(`## ${network}`);

  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  for (const line of lines) {

    if (!seen.has(line)) {
      seen.set(line, [network]);
      output.push(line);
    } else {
      seen.get(line).push(network);
    }
  }

  output.push(""); // spacing
}

/* ----- DUPLICATE REPORT ----- */
output.push("## DUPLICATE ENTRIES (AUTO-DETECTED)");

for (const [entry, networks] of seen.entries()) {
  if (networks.length > 1) {
    duplicateLog.push({ entry, networks });

    output.push(
      `# DUPLICATE → ${entry}`
    );
    output.push(
      `# FOUND IN → ${networks.join(", ")}`
    );
    output.push("");
  }
}

/* ----- WRITE FILE ----- */
fs.writeFileSync(CONFIG.outputFile, output.join("\n"));

/* ----- CONSOLE LOG (GITHUB FRIENDLY) ----- */
console.log("✅ app-ads.txt generated");

if (duplicateLog.length) {
  console.log("⚠️ Duplicates found:");
  duplicateLog.forEach(d =>
    console.log(
      `• ${d.entry} → ${d.networks.join(", ")}`
    )
  );
} else {
  console.log("🎉 No duplicates detected");
}
