import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const homeDir = process.env.USERPROFILE || process.env.HOME || "";
const keyPath = path.join(homeDir, ".tauri", "notch.key");

if (!fs.existsSync(keyPath)) {
  console.error(`\x1b[31mError: Private key not found at ${keyPath}\x1b[0m`);
  process.exit(1);
}

const key = fs.readFileSync(keyPath, "utf8").trim();

console.log("\x1b[32m✔ Loaded private key from:", keyPath, "\x1b[0m");
console.log("Building signed Tauri bundle...\n");

const result = spawnSync("npx", ["tauri", "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: key,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
  },
});

process.exit(result.status ?? 0);
