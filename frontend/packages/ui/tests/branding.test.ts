import { describe, expect, it } from "vitest";
import {
  applyTenantBranding,
  getContrastRatio,
  isValidColorValue,
  parseColorToRGB,
  PRESET_DEFAULTS,
  resetTenantBranding,
} from "../src/lib/branding";

describe("Tenant Branding & Hardened Contrast Validator", () => {
  describe("Input Sanitization & Injection Prevention", () => {
    it("accepts well-formed hex colors", () => {
      expect(isValidColorValue("#0b6e4f")).toBe(true);
      expect(isValidColorValue("#fff")).toBe(true);
      expect(isValidColorValue("#1e3a8a")).toBe(true);
      expect(isValidColorValue("#1e3a8aff")).toBe(true);
    });

    it("accepts well-formed oklch colors with numeric components", () => {
      expect(isValidColorValue("oklch(0.508 0.118 165.612)")).toBe(true);
      expect(isValidColorValue("oklch(50% 0.12 180)")).toBe(true);
      expect(isValidColorValue("oklch(0.7 0.15 120 / 0.9)")).toBe(true);
    });

    it("strictly rejects CSS injection strings containing semicolons, braces, or quotes", () => {
      expect(isValidColorValue("oklch(0.5 0.2 180); background: red;")).toBe(false);
      expect(isValidColorValue("#0b6e4f;")).toBe(false);
      expect(isValidColorValue("#0b6e4f}")).toBe(false);
      expect(isValidColorValue('"#0b6e4f"')).toBe(false);
      expect(isValidColorValue("'#0b6e4f'")).toBe(false);
      expect(isValidColorValue("`#0b6e4f`")).toBe(false);
    });

    it("strictly rejects url(), expression(), and comment injections", () => {
      expect(isValidColorValue("url('https://malicious.com/tracker.png')")).toBe(false);
      expect(isValidColorValue("expression(alert(document.cookie))")).toBe(false);
      expect(isValidColorValue("/* comment */ #0b6e4f")).toBe(false);
      expect(isValidColorValue("#0b6e4f // comment")).toBe(false);
      expect(isValidColorValue("rgba(0,0,0,1)")).toBe(false); // only hex or oklch allow-listed
    });

    it("falls back to defaults when injection attempt is passed to applyTenantBranding", () => {
      const result = applyTenantBranding({
        primary: "oklch(0.5 0.2 180); background: red;",
        primaryForeground: "#ffffff",
      });

      expect(result.success).toBe(false);
      expect(result.fellBackToDefaults).toBe(true);
      expect(result.reason).toContain("Input validation failed");
    });
  });

  describe("WCAG AA Contrast Validations", () => {
    it("parses valid colors to RGB correctly", () => {
      expect(parseColorToRGB("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseColorToRGB("#000000")).toEqual({ r: 0, g: 0, b: 0 });
      expect(parseColorToRGB("oklch(1 0 0)")).toEqual({ r: 255, g: 255, b: 255 });
    });

    it("calculates contrast ratio correctly for black and white", () => {
      const ratio = getContrastRatio("#000000", "#ffffff");
      expect(ratio).toBeCloseTo(21, 0);
    });

    it("validates preset default OKLCH tokens pass all requirements", () => {
      const lightPvsFg = getContrastRatio(
        PRESET_DEFAULTS.light.primary,
        PRESET_DEFAULTS.light.primaryForeground
      );
      expect(lightPvsFg).not.toBeNull();
      expect(lightPvsFg!).toBeGreaterThanOrEqual(4.5);

      const lightPvsBg = getContrastRatio(
        PRESET_DEFAULTS.light.primary,
        PRESET_DEFAULTS.light.background
      );
      expect(lightPvsBg).not.toBeNull();
      expect(lightPvsBg!).toBeGreaterThanOrEqual(3.0);
    });

    it("validates tenant theme with separate light and dark configurations", () => {
      const result = applyTenantBranding({
        light: {
          primary: "#0b6e4f", // Dark green
          primaryForeground: "#ffffff", // White text (ratio > 5.5:1)
          ring: "#0b6e4f", // Ratio vs white bg > 3:1
        },
        dark: {
          primary: "#6ee7b7", // Mint pastel (ratio vs dark bg > 7:1)
          primaryForeground: "#064e3b", // Deep green text (ratio > 7:1)
          ring: "#6ee7b7",
        },
      });

      expect(result.success).toBe(true);
      expect(result.fellBackToDefaults).toBe(false);
      expect(result.appliedTokens?.light["--primary"]).toBe("#0b6e4f");
      expect(result.appliedTokens?.dark["--primary"]).toBe("#6ee7b7");
      expect(result.checks?.["light_primary_vs_foreground"]?.passed).toBe(true);
      expect(result.checks?.["light_primary_vs_background"]?.passed).toBe(true);
      expect(result.checks?.["dark_primary_vs_foreground"]?.passed).toBe(true);
      expect(result.checks?.["dark_primary_vs_background"]?.passed).toBe(true);
    });

    it("derives deterministic dark theme when dark overrides are omitted", () => {
      const result = applyTenantBranding({
        primary: "#1e3a8a", // Dark navy on light
        primaryForeground: "#ffffff",
      });

      expect(result.success).toBe(true);
      expect(result.appliedTokens?.light["--primary"]).toBe("#1e3a8a");
      // Deterministically lightened for dark mode legibility
      expect(result.appliedTokens?.dark["--primary"]).toContain("oklch(");
      expect(result.checks?.["dark_primary_vs_background"]?.ratio).toBeGreaterThanOrEqual(3.0);
    });

    it("rejects theme when primary vs primaryForeground fails (< 4.5:1) and reverts to defaults", () => {
      const result = applyTenantBranding({
        primary: "#6ee7b7", // Light mint
        primaryForeground: "#ffffff", // White on mint fails (< 1.5:1)
      });

      expect(result.success).toBe(false);
      expect(result.fellBackToDefaults).toBe(true);
      expect(result.reason).toContain("Contrast validation failed");
      expect(result.checks?.["light_primary_vs_foreground"]?.passed).toBe(false);
    });

    it("rejects theme when primary vs background fails (< 3:1 for controls/links)", () => {
      // Very faint grey against white background fails 3:1
      const result = applyTenantBranding({
        light: {
          primary: "#cccccc",
          primaryForeground: "#000000",
        },
      });

      expect(result.success).toBe(false);
      expect(result.fellBackToDefaults).toBe(true);
      expect(result.reason).toContain("light.primary vs light.background");
    });

    it("resets tenant branding cleanly", () => {
      const dummy = {
        style: {
          properties: {
            "--primary": "#0b6e4f",
          } as Record<string, string>,
          setProperty(k: string, v: string) {
            this.properties[k] = v;
          },
          removeProperty(k: string) {
            delete this.properties[k];
          },
        },
      } as unknown as HTMLElement;

      resetTenantBranding(dummy);
      // @ts-expect-error test mock property
      expect(dummy.style.properties["--primary"]).toBeUndefined();
    });
  });
});
