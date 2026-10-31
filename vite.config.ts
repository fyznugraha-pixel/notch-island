import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import fs from "node:fs";
// @ts-expect-error type error without @types/node package
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

function collectImportedSymbols(dir: string, pkgName: string): Set<string> {
  const symbols = new Set<string>();
  const importRegex = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*["']${pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    "g"
  );

  const walk = (currentDir: string) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, "utf8");
        let match: RegExpExecArray | null;
        while ((match = importRegex.exec(content)) !== null) {
          for (const rawPart of match[1].split(",")) {
            const cleaned = rawPart
              .replace(/\btype\b/g, "")
              .split(/\bas\b/)[0]
              .trim();
            if (cleaned) symbols.add(cleaned);
          }
        }
      }
    }
  };

  try {
    walk(dir);
  } catch {
    // fallback if directory walk fails
  }
  return symbols;
}

const srcDir = path.resolve(process.cwd(), "src");
const usedLucideIcons = collectImportedSymbols(srcDir, "lucide-react");
const usedSimpleIcons = collectImportedSymbols(srcDir, "@icons-pack/react-simple-icons");

function filterBarrelSource(source: string, usedSymbols: Set<string>): string {
  if (usedSymbols.size === 0) return source;
  const keptLines: string[] = [];
  for (const line of source.split("\n")) {
    if (!line.startsWith("export {")) continue;
    for (const sym of usedSymbols) {
      if (line.includes(` ${sym},`) || line.includes(` ${sym} `)) {
        keptLines.push(line);
        break;
      }
    }
  }
  return keptLines.length > 0 ? keptLines.join("\n") : source;
}

export default defineConfig(() => ({
  plugins: [
    react(),
    {
      name: "slim-icon-barrels",
      enforce: "pre",
      load(id) {
        const norm = id.replace(/\\/g, "/");
        if (norm.endsWith("lucide-react/dist/esm/lucide-react.mjs")) {
          const raw = fs.readFileSync(id.split("?")[0], "utf8");
          return filterBarrelSource(raw, usedLucideIcons);
        }
        if (norm.endsWith("@icons-pack/react-simple-icons/index.mjs")) {
          const raw = fs.readFileSync(id.split("?")[0], "utf8");
          return filterBarrelSource(raw, usedSimpleIcons);
        }
        return null;
      },
    },
  ],

  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1422,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
