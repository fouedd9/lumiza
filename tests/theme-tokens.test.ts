import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const cssPath = resolve(process.cwd(), "src/styles/globals.css");
const styles = readFileSync(cssPath, "utf8");

describe("theme tokens", () => {
  it("defines the complete semantic palette for light and dark themes", () => {
    const semanticTokens = [
      "--background",
      "--foreground",
      "--surface",
      "--surface-elevated",
      "--muted-foreground",
      "--border",
      "--primary",
      "--primary-foreground",
      "--accent",
      "--accent-foreground",
    ];

    const lightTheme = styles.match(/:root\s*{([\s\S]*?)}/)?.[1] ?? "";
    const darkTheme = styles.match(/\.dark\s*{([\s\S]*?)}/)?.[1] ?? "";

    for (const token of semanticTokens) {
      expect(lightTheme).toContain(token);
      expect(darkTheme).toContain(token);
    }
  });
});
