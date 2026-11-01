/**
 * Tenant Branding Helper & WCAG Contrast Validator
 *
 * Allows tenants (Kerala Polytechnic institutions) to safely customize
 * branding tokens at runtime while strictly enforcing:
 * 1. Untrusted input sanitization (strict allow-list parser preventing CSS injection)
 * 2. WCAG AA contrast rules in both Light and Dark themes
 * 3. Graceful fallback to preset defaults on any contrast or validation failure
 *
 * NOTE: Logo URLs are intentionally NOT handled here; they are managed by the
 * asset/storage pipeline in a subsequent Sprint.
 */

export interface ThemeBrandingOverrides {
  primary: string;
  primaryForeground: string;
  ring?: string;
}

export interface TenantBrandingTokens {
  // Simple / combined token shorthand (applied to light, and dark if not separate)
  primary?: string;
  primaryForeground?: string;
  ring?: string;

  // Separate explicit theme overrides
  light?: ThemeBrandingOverrides;
  dark?: ThemeBrandingOverrides;

  // Reserved for future storage pipeline (explicitly not handled in CSS layer)
  logoUrl?: string;
}

export interface ContrastCheckDetail {
  tested: string;
  ratio: number;
  required: number;
  passed: boolean;
}

export interface BrandingApplyResult {
  success: boolean;
  fellBackToDefaults?: boolean;
  reason?: string;
  checks?: Record<string, ContrastCheckDetail>;
  appliedTokens?: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

export interface RGB {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

export interface OKLCH {
  l: number; // 0..1
  c: number; // 0..0.4+
  h: number; // 0..360 (degrees)
  a?: number; // 0..1
}

// Preset b2BnwmRcY default values used for fallback and background reference
export const PRESET_DEFAULTS = {
  light: {
    background: "oklch(1 0 0)",
    primary: "oklch(0.508 0.118 165.612)",
    primaryForeground: "oklch(0.979 0.021 166.113)",
    ring: "oklch(0.708 0 0)",
  },
  dark: {
    background: "oklch(0.145 0 0)",
    primary: "oklch(0.432 0.095 166.913)",
    primaryForeground: "oklch(0.979 0.021 166.113)",
    ring: "oklch(0.556 0 0)",
  },
} as const;

// Disallowed patterns to prevent CSS injection attacks
const DANGEROUS_PATTERNS = /[;{}"'`]|\/\*|\*\/|\/\/|url\(|expression/i;

// Strict allow-lists for color formats
const HEX_ALLOWLIST = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const OKLCH_ALLOWLIST =
  /^oklch\(\s*([0-9]+(?:\.[0-9]+)?%?)\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)(?:\s*\/\s*([0-9]+(?:\.[0-9]+)?%?))?\s*\)$/i;

/**
 * Validates that an untrusted string is a strictly safe, well-formed color literal.
 * Rejects any injections, control characters, quotes, expressions, or unknown functions.
 */
export function isValidColorValue(input: unknown): input is string {
  if (typeof input !== "string") {
    return false;
  }
  const trimmed = input.trim();
  if (DANGEROUS_PATTERNS.test(trimmed)) {
    return false;
  }
  return HEX_ALLOWLIST.test(trimmed) || OKLCH_ALLOWLIST.test(trimmed);
}

/**
 * Converts a hex string (#rgb, #rgba, #rrggbb, #rrggbbaa) to RGB.
 */
function parseHexToRGB(hexStr: string): RGB | null {
  const hex = hexStr.slice(1);
  if (hex.length === 3 || hex.length === 4) {
    const r = parseInt(hex[0]! + hex[0]!, 16);
    const g = parseInt(hex[1]! + hex[1]!, 16);
    const b = parseInt(hex[2]! + hex[2]!, 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }
  return null;
}

/**
 * Converts an OKLCH object to an RGB object using standard sRGB transformation.
 */
export function oklchToRGB(l: number, c: number, hDeg: number): RGB {
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const bLab = c * Math.sin(hRad);

  // Convert OKLab to Linear sRGB
  const l_ = l + 0.3963377774 * a + 0.2158037573 * bLab;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bLab;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bLab;

  const lCubed = l_ * l_ * l_;
  const mCubed = m_ * m_ * m_;
  const sCubed = s_ * s_ * s_;

  const rLin = +4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed;
  const gLin = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed;
  const bLin = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed;

  const toSrgb = (x: number) => {
    const clamped = Math.max(0, Math.min(1, x));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };

  return {
    r: Math.round(toSrgb(rLin) * 255),
    g: Math.round(toSrgb(gLin) * 255),
    b: Math.round(toSrgb(bLin) * 255),
  };
}

/**
 * Parses OKLCH string to OKLCH object.
 */
export function parseOKLCH(str: string): OKLCH | null {
  const match = str.trim().match(OKLCH_ALLOWLIST);
  if (!match) return null;

  const lRaw = match[1]!;
  const l = lRaw.endsWith("%") ? parseFloat(lRaw) / 100 : parseFloat(lRaw);
  const c = parseFloat(match[2]!);
  const h = parseFloat(match[3]!);

  return {
    l: Math.max(0, Math.min(1, l)),
    c: Math.max(0, c),
    h: ((h % 360) + 360) % 360,
  };
}

/**
 * Converts RGB to OKLCH for deterministic dark-mode palette derivation.
 */
export function rgbToOKLCH(rgb: RGB): OKLCH {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bLab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.sqrt(a * a + bLab * bLab);
  let h = (Math.atan2(bLab, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l, c, h };
}

/**
 * Parses any allowed color string to RGB.
 */
export function parseColorToRGB(colorStr: string): RGB | null {
  if (!isValidColorValue(colorStr)) {
    return null;
  }

  const str = colorStr.trim();
  if (str.startsWith("#")) {
    return parseHexToRGB(str);
  }

  const oklch = parseOKLCH(str);
  if (oklch) {
    return oklchToRGB(oklch.l, oklch.c, oklch.h);
  }

  return null;
}

/**
 * Calculates WCAG relative luminance for an sRGB color.
 */
export function getRelativeLuminance(rgb: RGB): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((val) => {
    const s = val / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/**
 * Calculates WCAG contrast ratio between two colors: (L1 + 0.05) / (L2 + 0.05)
 */
export function getContrastRatio(colorA: string, colorB: string): number | null {
  const rgbA = parseColorToRGB(colorA);
  const rgbB = parseColorToRGB(colorB);

  if (!rgbA || !rgbB) {
    return null;
  }

  const lumA = getRelativeLuminance(rgbA);
  const lumB = getRelativeLuminance(rgbB);

  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Deterministically derives a dark-theme palette from a light-theme primary
 * if no explicit dark-mode overrides were provided.
 */
export function deriveDeterministicDarkTheme(light: ThemeBrandingOverrides): ThemeBrandingOverrides {
  const rgb = parseColorToRGB(light.primary);
  if (!rgb) {
    return {
      primary: PRESET_DEFAULTS.dark.primary,
      primaryForeground: PRESET_DEFAULTS.dark.primaryForeground,
      ring: PRESET_DEFAULTS.dark.ring,
    };
  }

  // Check if light primary already works well on dark background
  const ratioOnDarkBg = getContrastRatio(light.primary, PRESET_DEFAULTS.dark.background);
  const ratioOnLightFg = getContrastRatio(light.primary, light.primaryForeground);

  if (ratioOnDarkBg !== null && ratioOnDarkBg >= 3.0 && ratioOnLightFg !== null && ratioOnLightFg >= 4.5) {
    return {
      primary: light.primary,
      primaryForeground: light.primaryForeground,
      ring: light.ring ?? light.primary,
    };
  }

  // Deterministically adjust lightness in OKLCH for dark mode
  const oklch = rgbToOKLCH(rgb);
  // Target a comfortable pastel / high-legibility lightness in dark mode
  const targetLightness = Math.max(0.68, Math.min(0.85, 1.0 - oklch.l * 0.4));
  const targetChroma = Math.min(oklch.c, 0.16);
  const derivedPrimary = `oklch(${targetLightness.toFixed(3)} ${targetChroma.toFixed(3)} ${oklch.h.toFixed(1)})`;

  // On lightened button in dark mode, text should be dark for high contrast
  const derivedPrimaryFg = "oklch(0.145 0 0)";
  const derivedRing = derivedPrimary;

  return {
    primary: derivedPrimary,
    primaryForeground: derivedPrimaryFg,
    ring: derivedRing,
  };
}

const STYLE_TAG_ID = "academic-tenant-branding";

/**
 * Injects or updates the <style> element in the document head for CSS cascade
 * support across :root (light) and .dark (dark).
 */
function applyStyleSheetOverrides(
  light: Record<string, string>,
  dark: Record<string, string>
) {
  if (typeof document === "undefined") {
    return;
  }

  let styleEl = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_TAG_ID;
    document.head.appendChild(styleEl);
  }

  const lightCss = Object.entries(light)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  const darkCss = Object.entries(dark)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  styleEl.textContent = `:root {\n${lightCss}\n}\n.dark {\n${darkCss}\n}`;
}

/**
 * Resets tenant branding and removes any injected styles, returning to preset defaults.
 */
export function resetTenantBranding(targetElement?: HTMLElement) {
  if (typeof document !== "undefined") {
    const styleEl = document.getElementById(STYLE_TAG_ID);
    if (styleEl) {
      styleEl.remove();
    }
  }

  const target =
    targetElement ??
    (typeof document !== "undefined" ? document.documentElement : undefined);

  if (target && target.style) {
    target.style.removeProperty("--primary");
    target.style.removeProperty("--primary-foreground");
    target.style.removeProperty("--ring");
  }
}

/**
 * Applies tenant branding tokens after validating:
 * 1. Strict input allow-list validation (rejecting any injection characters)
 * 2. WCAG contrast standards in Light mode:
 *    - primary vs primary-foreground >= 4.5:1
 *    - primary vs background >= 3:1
 *    - ring vs background >= 3:1
 * 3. WCAG contrast standards in Dark mode:
 *    - primary vs primary-foreground >= 4.5:1
 *    - primary vs background >= 3:1
 *    - ring vs background >= 3:1
 *
 * Failing pairs fall back to preset defaults and return a structured reason.
 */
export function applyTenantBranding(
  tokens: TenantBrandingTokens,
  targetElement?: HTMLElement
): BrandingApplyResult {
  // 1. Resolve light and dark overrides
  const lightOverrides: ThemeBrandingOverrides = {
    primary: tokens.light?.primary ?? tokens.primary ?? PRESET_DEFAULTS.light.primary,
    primaryForeground:
      tokens.light?.primaryForeground ??
      tokens.primaryForeground ??
      PRESET_DEFAULTS.light.primaryForeground,
    ring: tokens.light?.ring ?? tokens.ring ?? tokens.light?.primary ?? tokens.primary ?? PRESET_DEFAULTS.light.ring,
  };

  const darkOverrides: ThemeBrandingOverrides = tokens.dark
    ? {
        primary: tokens.dark.primary,
        primaryForeground: tokens.dark.primaryForeground,
        ring: tokens.dark.ring ?? tokens.dark.primary ?? PRESET_DEFAULTS.dark.ring,
      }
    : deriveDeterministicDarkTheme(lightOverrides);

  // 2. Strict Input Validation (Allow-list check on all provided overrides)
  const valuesToCheck = [
    { name: "light.primary", val: lightOverrides.primary },
    { name: "light.primaryForeground", val: lightOverrides.primaryForeground },
    { name: "light.ring", val: lightOverrides.ring },
    { name: "dark.primary", val: darkOverrides.primary },
    { name: "dark.primaryForeground", val: darkOverrides.primaryForeground },
    { name: "dark.ring", val: darkOverrides.ring },
  ];

  for (const item of valuesToCheck) {
    if (item.val && !isValidColorValue(item.val)) {
      resetTenantBranding(targetElement);
      return {
        success: false,
        fellBackToDefaults: true,
        reason: `Input validation failed: "${item.name}" contains invalid characters or an unsupported format. Must be a well-formed hex (#rgb, #rrggbb) or oklch(...) color.`,
      };
    }
  }

  // 3. Contrast Validation Rules
  const checks: Record<string, ContrastCheckDetail> = {};

  // Check 1: Light Primary vs Primary-Foreground (>= 4.5:1)
  const lightPvsFg = getContrastRatio(lightOverrides.primary, lightOverrides.primaryForeground);
  if (lightPvsFg === null) {
    resetTenantBranding(targetElement);
    return {
      success: false,
      fellBackToDefaults: true,
      reason: "Failed to parse light primary or primary-foreground color.",
    };
  }
  const lightPvsFgRounded = Math.round(lightPvsFg * 100) / 100;
  checks["light_primary_vs_foreground"] = {
    tested: "light.primary vs light.primaryForeground",
    ratio: lightPvsFgRounded,
    required: 4.5,
    passed: lightPvsFgRounded >= 4.5,
  };

  // Check 2: Light Primary vs Light Background (>= 3:1)
  const lightPvsBg = getContrastRatio(lightOverrides.primary, PRESET_DEFAULTS.light.background);
  const lightPvsBgRounded = lightPvsBg ? Math.round(lightPvsBg * 100) / 100 : 0;
  checks["light_primary_vs_background"] = {
    tested: "light.primary vs light.background",
    ratio: lightPvsBgRounded,
    required: 3.0,
    passed: lightPvsBgRounded >= 3.0,
  };

  // Check 3: Light Ring vs Light Background (>= 3:1)
  const lightRingVal = lightOverrides.ring ?? lightOverrides.primary;
  const lightRingVsBg = getContrastRatio(lightRingVal, PRESET_DEFAULTS.light.background);
  const lightRingVsBgRounded = lightRingVsBg ? Math.round(lightRingVsBg * 100) / 100 : 0;
  checks["light_ring_vs_background"] = {
    tested: "light.ring vs light.background",
    ratio: lightRingVsBgRounded,
    required: 3.0,
    passed: lightRingVsBgRounded >= 3.0,
  };

  // Check 4: Dark Primary vs Primary-Foreground (>= 4.5:1)
  const darkPvsFg = getContrastRatio(darkOverrides.primary, darkOverrides.primaryForeground);
  if (darkPvsFg === null) {
    resetTenantBranding(targetElement);
    return {
      success: false,
      fellBackToDefaults: true,
      reason: "Failed to parse dark primary or primary-foreground color.",
    };
  }
  const darkPvsFgRounded = Math.round(darkPvsFg * 100) / 100;
  checks["dark_primary_vs_foreground"] = {
    tested: "dark.primary vs dark.primaryForeground",
    ratio: darkPvsFgRounded,
    required: 4.5,
    passed: darkPvsFgRounded >= 4.5,
  };

  // Check 5: Dark Primary vs Dark Background (>= 3:1)
  const darkPvsBg = getContrastRatio(darkOverrides.primary, PRESET_DEFAULTS.dark.background);
  const darkPvsBgRounded = darkPvsBg ? Math.round(darkPvsBg * 100) / 100 : 0;
  checks["dark_primary_vs_background"] = {
    tested: "dark.primary vs dark.background",
    ratio: darkPvsBgRounded,
    required: 3.0,
    passed: darkPvsBgRounded >= 3.0,
  };

  // Check 6: Dark Ring vs Dark Background (>= 3:1)
  const darkRingVal = darkOverrides.ring ?? darkOverrides.primary;
  const darkRingVsBg = getContrastRatio(darkRingVal, PRESET_DEFAULTS.dark.background);
  const darkRingVsBgRounded = darkRingVsBg ? Math.round(darkRingVsBg * 100) / 100 : 0;
  checks["dark_ring_vs_background"] = {
    tested: "dark.ring vs dark.background",
    ratio: darkRingVsBgRounded,
    required: 3.0,
    passed: darkRingVsBgRounded >= 3.0,
  };

  // 4. Verify all checks passed
  const failedCheck = Object.values(checks).find((c) => !c.passed);
  if (failedCheck) {
    resetTenantBranding(targetElement);
    return {
      success: false,
      fellBackToDefaults: true,
      checks,
      reason: `Contrast validation failed for ${failedCheck.tested}. Measured ratio is ${failedCheck.ratio}:1, which is below the required ${failedCheck.required}:1. Reverted to preset defaults.`,
    };
  }

  // 5. Apply validated overrides
  const appliedLight: Record<string, string> = {
    "--primary": lightOverrides.primary,
    "--primary-foreground": lightOverrides.primaryForeground,
    "--ring": lightRingVal,
  };

  const appliedDark: Record<string, string> = {
    "--primary": darkOverrides.primary,
    "--primary-foreground": darkOverrides.primaryForeground,
    "--ring": darkRingVal,
  };

  // Apply to document stylesheet
  applyStyleSheetOverrides(appliedLight, appliedDark);

  // If a specific targetElement was passed (e.g. mock test element), set inline styles as well
  if (targetElement && targetElement.style) {
    for (const [k, v] of Object.entries(appliedLight)) {
      targetElement.style.setProperty(k, v);
    }
  }

  return {
    success: true,
    fellBackToDefaults: false,
    checks,
    appliedTokens: {
      light: appliedLight,
      dark: appliedDark,
    },
  };
}
