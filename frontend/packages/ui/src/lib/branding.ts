/**
 * Tenant Branding Helper & WCAG Contrast Validator
 *
 * Allows tenants (colleges) to customize primary branding tokens at runtime
 * while enforcing WCAG AA contrast standards (minimum 4.5:1 ratio).
 */

export interface TenantBrandingTokens {
  primary?: string;
  primaryForeground?: string;
  ring?: string;
  accent?: string;
  logoUrl?: string;
}

export interface BrandingApplyResult {
  success: boolean;
  contrastRatio?: number;
  reason?: string;
  appliedTokens?: Record<string, string>;
}

export interface RGB {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

/**
 * Parses color string to RGB. Supports hex (#rgb, #rrggbb, #rrggbbaa), rgb(r, g, b),
 * and common OKLCH approximation.
 */
export function parseColorToRGB(colorStr: string): RGB | null {
  const str = colorStr.trim().toLowerCase();

  // 1. Hex format
  if (str.startsWith("#")) {
    const hex = str.slice(1);
    if (hex.length === 3) {
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

  // 2. RGB / RGBA format
  const rgbMatch = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) {
    const r = Math.round(parseFloat(rgbMatch[1]!));
    const g = Math.round(parseFloat(rgbMatch[2]!));
    const b = Math.round(parseFloat(rgbMatch[3]!));
    return {
      r: Math.max(0, Math.min(255, r)),
      g: Math.max(0, Math.min(255, g)),
      b: Math.max(0, Math.min(255, b)),
    };
  }

  // 3. OKLCH format: oklch(L C H [/ A])
  // L: 0..1, C: 0..0.4, H: 0..360
  const oklchMatch = str.match(/^oklch\(\s*([\d.]+)(?:%)?\s+([\d.]+)\s+([\d.]+)/);
  if (oklchMatch) {
    const l = parseFloat(oklchMatch[1]!) / (oklchMatch[1]!.includes("%") ? 100 : 1);
    const c = parseFloat(oklchMatch[2]!);
    const h = (parseFloat(oklchMatch[3]!) * Math.PI) / 180;

    // Convert OKLCH to OKLab
    const a = c * Math.cos(h);
    const bLab = c * Math.sin(h);

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

    // Gamma compression
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
 * Applies tenant branding tokens to the document :root after validating WCAG AA contrast.
 * Returns result object indicating success or failure with contrast metrics.
 */
export function applyTenantBranding(
  tokens: TenantBrandingTokens,
  rootElement?: HTMLElement
): BrandingApplyResult {
  const target =
    rootElement ??
    (typeof document !== "undefined" ? document.documentElement : undefined);

  // If primary and primaryForeground are provided, validate contrast
  if (tokens.primary && tokens.primaryForeground) {
    const ratio = getContrastRatio(tokens.primary, tokens.primaryForeground);

    if (ratio === null) {
      return {
        success: false,
        reason: "Failed to parse primary or primary-foreground color value.",
      };
    }

    const roundedRatio = Math.round(ratio * 100) / 100;

    // WCAG AA requirement for normal text: 4.5:1
    if (roundedRatio < 4.5) {
      return {
        success: false,
        contrastRatio: roundedRatio,
        reason: `WCAG AA contrast requirement failed. Contrast ratio is ${roundedRatio}:1, which is below the minimum required 4.5:1.`,
      };
    }

    const applied: Record<string, string> = {
      "--primary": tokens.primary,
      "--primary-foreground": tokens.primaryForeground,
    };

    if (tokens.ring) {
      applied["--ring"] = tokens.ring;
    }
    if (tokens.accent) {
      applied["--accent"] = tokens.accent;
    }

    if (target) {
      for (const [key, value] of Object.entries(applied)) {
        target.style.setProperty(key, value);
      }
      if (tokens.logoUrl) {
        target.setAttribute("data-tenant-logo", tokens.logoUrl);
      }
    }

    return {
      success: true,
      contrastRatio: roundedRatio,
      appliedTokens: applied,
    };
  }

  // If only partial tokens provided
  const applied: Record<string, string> = {};
  if (tokens.ring) applied["--ring"] = tokens.ring;
  if (tokens.accent) applied["--accent"] = tokens.accent;

  if (target) {
    for (const [key, value] of Object.entries(applied)) {
      target.style.setProperty(key, value);
    }
    if (tokens.logoUrl) {
      target.setAttribute("data-tenant-logo", tokens.logoUrl);
    }
  }

  return {
    success: true,
    appliedTokens: applied,
  };
}
