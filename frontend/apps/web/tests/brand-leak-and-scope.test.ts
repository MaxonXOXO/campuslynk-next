import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function getAllTsFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("Brand Leak & Scope Label Isolation (Prompt 06i Item 15)", () => {
  const setupDir = path.resolve(__dirname, "../src/app/setup");

  it("verifies setup directory exists and contains source files", () => {
    expect(fs.existsSync(setupDir)).toBe(true);
    const files = getAllTsFiles(setupDir);
    expect(files.length).toBeGreaterThan(5);
  });

  it("asserts no setup component or logic file contains 'Carmel' or 'Kerala'", () => {
    const files = getAllTsFiles(setupDir);
    const violations: Array<{ file: string; match: string; line: number }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        if (/carmel/i.test(line)) {
          violations.push({ file: path.basename(file), match: "Carmel", line: index + 1 });
        }
        if (/kerala/i.test(line)) {
          violations.push({ file: path.basename(file), match: "Kerala", line: index + 1 });
        }
      });
    }

    expect(
      violations,
      `Found forbidden brand leaks: ${JSON.stringify(violations, null, 2)}`
    ).toEqual([]);
  });

  it("asserts no setup component or logic reads, parses, or derives 'scope_label'", () => {
    const files = getAllTsFiles(setupDir);
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        if (/scope_label/i.test(line)) {
          violations.push({
            file: path.basename(file),
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }

    expect(
      violations,
      `Found references to internal ltree 'scope_label': ${JSON.stringify(violations, null, 2)}`
    ).toEqual([]);
  });
});

