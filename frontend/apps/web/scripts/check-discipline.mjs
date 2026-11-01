import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webSrcDir = path.resolve(__dirname, "../src");
const uiDir = path.resolve(webSrcDir, "components/ui");

let hasErrors = false;

console.log("Running monorepo discipline check for apps/web...\n");

// Rule 1: No component files under apps/web/src/components/ui/
if (fs.existsSync(uiDir)) {
  const files = fs.readdirSync(uiDir).filter((f) => !f.startsWith("."));
  if (files.length > 0) {
    console.error(
      `\x1b[31m[DISCIPLINE ERROR (Rule 7a)]:\x1b[0m Component files found inside apps/web/src/components/ui/:\n` +
        files.map((f) => `  - ${f}`).join("\n") +
        `\nAll UI components must live in @academic-suite/ui (packages/ui). Remove these files and import from @academic-suite/ui.\n`
    );
    hasErrors = true;
  }
}

// Rule 2: No raw hex or rgb/rgba colors used for styling in apps/web/src/ (must use tokens / semantic classes)
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") {
        walkDir(fullPath, callback);
      }
    } else if (entry.isFile() && /\.(tsx?|jsx?|css)$/.test(entry.name)) {
      callback(fullPath);
    }
  }
}

const tailwindArbitraryColorRegex = /(?:bg|text|border|ring|fill|stroke|outline|shadow)-\[#(?:[0-9a-fA-F]{3,8})\]/g;
const tailwindArbitraryRgbRegex = /(?:bg|text|border|ring|fill|stroke|outline|shadow)-\[(?:rgb|rgba)\([^\]]+\)\]/g;
const inlineStyleColorRegex = /(?:color|backgroundColor|borderColor|fill|stroke)\s*:\s*["'`](#(?:[0-9a-fA-F]{3,8})|rgba?\([^)]+\))["'`]/g;
const cssRawColorRegex = /:\s*(#(?:[0-9a-fA-F]{3,8})\b|rgba?\([^)]+\))/g;

walkDir(webSrcDir, (filePath) => {
  const relPath = path.relative(path.resolve(__dirname, ".."), filePath);
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Check Tailwind arbitrary hex/rgb color classes
    let match;
    while ((match = tailwindArbitraryColorRegex.exec(line)) !== null) {
      console.error(
        `\x1b[31m[DISCIPLINE ERROR (Rule 7b)]:\x1b[0m Raw hex color used in class "${match[0]}" at ${relPath}:${lineNum}.\n` +
          `Must use tokens or semantic classes from @academic-suite/ui.\n`
      );
      hasErrors = true;
    }

    while ((match = tailwindArbitraryRgbRegex.exec(line)) !== null) {
      console.error(
        `\x1b[31m[DISCIPLINE ERROR (Rule 7b)]:\x1b[0m Raw rgb/rgba color used in class "${match[0]}" at ${relPath}:${lineNum}.\n` +
          `Must use tokens or semantic classes from @academic-suite/ui.\n`
      );
      hasErrors = true;
    }

    // Check inline style color assignments
    while ((match = inlineStyleColorRegex.exec(line)) !== null) {
      console.error(
        `\x1b[31m[DISCIPLINE ERROR (Rule 7b)]:\x1b[0m Raw color "${match[1]}" used in style at ${relPath}:${lineNum}.\n` +
          `Must use tokens or semantic classes from @academic-suite/ui.\n`
      );
      hasErrors = true;
    }

    // In CSS files (except tokens definition in packages/ui), check raw color declarations
    if (filePath.endsWith(".css")) {
      // Allow var(--...) or comments
      if (!line.trim().startsWith("/*") && !line.includes("var(")) {
        while ((match = cssRawColorRegex.exec(line)) !== null) {
          console.error(
            `\x1b[31m[DISCIPLINE ERROR (Rule 7b)]:\x1b[0m Raw color "${match[1]}" used in CSS at ${relPath}:${lineNum}.\n` +
              `Must use semantic tokens from @academic-suite/ui.\n`
          );
          hasErrors = true;
        }
      }
    }
  });
});

if (hasErrors) {
  console.error("\x1b[31mMonorepo discipline check failed!\x1b[0m\n");
  process.exit(1);
} else {
  console.log("\x1b[32mMonorepo discipline check passed: No local UI components and no raw colors in apps/web.\x1b[0m\n");
}
