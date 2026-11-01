import { describe, expect, it } from "vitest";
import {
  applyTenantBranding,
  getContrastRatio,
  parseColorToRGB,
} from "../src/lib/branding";

describe("Tenant Branding & Contrast Validator", () => {
  it("parses hex and rgb colors correctly", () => {
    expect(parseColorToRGB("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColorToRGB("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColorToRGB("rgb(16, 185, 129)")).toEqual({ r: 16, g: 185, b: 129 });
  });

  it("calculates contrast ratio correctly for black and white", () => {
    const ratio = getContrastRatio("#000000", "#ffffff");
    expect(ratio).toBeCloseTo(21, 0);
  });

  it("validates high-contrast tenant theme successfully (WCAG AA >= 4.5:1)", () => {
    // Dark green (#0b6e4f) on white (#ffffff) has ratio ~5.6:1
    const result = applyTenantBranding({
      primary: "#0b6e4f",
      primaryForeground: "#ffffff",
      ring: "#0b6e4f",
    });

    expect(result.success).toBe(true);
    expect(result.contrastRatio).toBeGreaterThanOrEqual(4.5);
    expect(result.appliedTokens?.["--primary"]).toBe("#0b6e4f");
    expect(result.appliedTokens?.["--primary-foreground"]).toBe("#ffffff");
  });

  it("rejects low-contrast theme failing WCAG AA (ratio < 4.5:1)", () => {
    // Light green (#4ade80) on white (#ffffff) has poor contrast ~1.4:1
    const result = applyTenantBranding({
      primary: "#4ade80",
      primaryForeground: "#ffffff",
    });

    expect(result.success).toBe(false);
    expect(result.contrastRatio).toBeLessThan(4.5);
    expect(result.reason).toContain("WCAG AA contrast requirement failed");
  });

  it("validates default preset OKLCH tokens meet WCAG AA", () => {
    // Preset tokens: primary oklch(0.508 0.118 165.612) and primary-foreground oklch(0.979 0.021 166.113)
    const ratio = getContrastRatio(
      "oklch(0.508 0.118 165.612)",
      "oklch(0.979 0.021 166.113)"
    );

    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThanOrEqual(4.5);
  });

  it("applies CSS custom properties to target element when contrast passes", () => {
    const dummyRoot = {
      style: {
        properties: {} as Record<string, string>,
        setProperty(key: string, value: string) {
          this.properties[key] = value;
        },
      },
      setAttribute(_key: string, _value: string) {},
    } as unknown as HTMLElement;

    const result = applyTenantBranding(
      {
        primary: "#1e3a8a",
        primaryForeground: "#ffffff",
        ring: "#3b82f6",
        logoUrl: "/college-logo.png",
      },
      dummyRoot
    );

    expect(result.success).toBe(true);
    // @ts-expect-error test mock property
    expect(dummyRoot.style.properties["--primary"]).toBe("#1e3a8a");
  });
});
