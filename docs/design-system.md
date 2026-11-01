# Academic Suite Design System Specification

## 1. Overview & Preset Configuration

The **Academic Suite** (CampusLynk / Carmel LINX) frontend utilizes a unified design system built on **shadcn** with **Base UI** primitives (`base-vega` style) and modern **OKLCH** color tokens.

### Preset Metadata
- **Preset Code**: `b2BnwmRcY`
- **shadcn CLI Version**: `4.23.0`
- **Component Style**: `base-vega` (utilizing `@base-ui/react` v1.9.0 primitives rather than Radix UI)
- **Icon Library**: `@remixicon/react` (v4.9.0)
- **Base Color Space**: `neutral` in **OKLCH**
- **Border Radius**: `0.45rem`
- **Tailwind Version**: Tailwind CSS v4 (`@tailwindcss/postcss` 4.3.3)

### Preset Token Diff & Scratch Inspection Comparison
During Step 1, the preset was initialized into an isolated scratch project outside the repository. Comparing the raw scratch output of `globals.css` against `packages/ui/src/styles/globals.css`:

| Token Category | Scratch Preset Inspection | `packages/ui/src/styles/globals.css` | Diff / Explanation |
| :--- | :--- | :--- | :--- |
| **Imports & Variant** | `@import "tailwindcss";`<br>`@import "tw-animate-css";`<br>`@import "shadcn/tailwind.css";`<br>`@custom-variant dark (&:is(.dark *));` | Identical | **Zero diff**. Exact 1:1 match. |
| **Theme Inline Tokens** | 22 color mappings (`--color-*`), 7 radius mappings (`--radius-*`), `--font-sans`, `--font-heading` | Identical | **Zero diff**. Exact 1:1 match. |
| **`:root` Variables** | 26 tokens (Neutral OKLCH: `--background: oklch(1 0 0)`, `--primary: oklch(0.508 0.118 165.612)`, `--radius: 0.45rem`, etc.) | Identical | **Zero diff**. Exact 1:1 match. |
| **`.dark` Variables** | 26 tokens (Dark OKLCH: `--background: oklch(0.145 0 0)`, `--primary: oklch(0.432 0.095 166.913)`, etc.) | Identical | **Zero diff**. Exact 1:1 match. |
| **Base Layer** | `@layer base { * { @apply border-border outline-ring/50; } ... }` | Identical | **Zero diff**. Normalized whitespace. |
| **Accessibility Override** | None | `@media (prefers-reduced-motion: reduce) { ... }` | **Added**: Disables transitions and animations for users requesting reduced motion (Sprint 0 acceptance criterion 4). |

---

## 2. Fonts & Typography Specification

### Preset Font Setting
The preset `b2BnwmRcY` explicitly specifies:
- **Latin Font**: `Inter` (`subsets: ["latin"]`, CSS variable `--font-sans`)
- **Monospace Font**: `Geist_Mono` (`subsets: ["latin"]`, CSS variable `--font-mono`)

### Malayalam Localization Font
To support official bilingual operations in Kerala Polytechnic institutions (administrative circulars, Malayalam student names, marks entry), Google's **`Noto Sans Malayalam`** was added as the designated script fallback.

### Final CSS Font Stack
```css
font-family: var(--font-sans), var(--font-malayalam), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```
- **Rationale**: `Inter` provides high-density, legible Latin glyphs for course codes, dates, and English prose. When the browser encounters Malayalam Unicode code points (U+0D00 to U+0D7F), it seamlessly falls back to `Noto Sans Malayalam`.
- **Glyph Integrity**: `Noto Sans Malayalam` includes complete OpenType ligature and conjunct support (കൂട്ടക്ഷരങ്ങൾ: യ്ക്ക, ങ്ങ, ണ്ഡ, ത്ഥ, ഷ്ട) without glyph clipping or vertical baseline misalignment.
- **Unbroken Words**: All headings, body cards, and table cells enforce `break-words` (and avoid `break-all`) to prevent splitting syllables mid-character.
- **Line Heights**: Minimum line-height of `1.5` (`leading-normal` / `leading-relaxed`) is enforced to give adequate clearance for Malayalam ascenders and descenders (മാത്രകൾ).

---

## 3. Component Inventory

All base UI components live exclusively in `frontend/packages/ui` (`@academic-suite/ui`). Applications (such as `frontend/apps/web`) consume them as workspace dependencies and must not declare local component files under `src/components/ui/`.

### 3.1 The 31 shadcn Primitive Components
| Component | Primitive / Engine | Path | Purpose |
| :--- | :--- | :--- | :--- |
| `Button` | `@base-ui/react/button` | `packages/ui/src/components/ui/button.tsx` | Standard, outline, secondary, ghost, destructive, link buttons |
| `Input` | `@base-ui/react/input` | `packages/ui/src/components/ui/input.tsx` | Single-line text input fields |
| `Textarea` | Native / Base styling | `packages/ui/src/components/ui/textarea.tsx` | Multi-line text entry |
| `Label` | Native / Accessible label | `packages/ui/src/components/ui/label.tsx` | Accessible form labels |
| `Select` | `@base-ui/react/select` | `packages/ui/src/components/ui/select.tsx` | Dropdown selection controls |
| `Checkbox` | `@base-ui/react/checkbox` | `packages/ui/src/components/ui/checkbox.tsx` | Multi-select square checkboxes |
| `RadioGroup` | `@base-ui/react/radio` | `packages/ui/src/components/ui/radio-group.tsx` | Single-selection option sets |
| `Switch` | `@base-ui/react/switch` | `packages/ui/src/components/ui/switch.tsx` | Toggle switches |
| `Form` | `react-hook-form` + Base UI Field | `packages/ui/src/components/ui/form.tsx` | Accessible forms with validation integration |
| `Card` | Layout / Card primitives | `packages/ui/src/components/ui/card.tsx` | Content containers with Header, Title, Content, Footer |
| `Badge` | Inline pill container | `packages/ui/src/components/ui/badge.tsx` | Metadata pills and tags |
| `Alert` | Accessible banner | `packages/ui/src/components/ui/alert.tsx` | Critical user notifications and messages |
| `Separator` | `@base-ui/react/separator` | `packages/ui/src/components/ui/separator.tsx` | Visual dividers |
| `Skeleton` | Loading placeholder | `packages/ui/src/components/ui/skeleton.tsx` | Animated loading shimmers |
| `Avatar` | `@base-ui/react/avatar` | `packages/ui/src/components/ui/avatar.tsx` | User profile avatars with fallbacks |
| `Tabs` | `@base-ui/react/tabs` | `packages/ui/src/components/ui/tabs.tsx` | Tabbed navigation interfaces |
| `Table` | Semantic HTML table | `packages/ui/src/components/ui/table.tsx` | Accessible tabular data representation |
| `Dialog` | `@base-ui/react/dialog` | `packages/ui/src/components/ui/dialog.tsx` | Modal windows |
| `AlertDialog` | `@base-ui/react/alert-dialog` | `packages/ui/src/components/ui/alert-dialog.tsx` | Destructive/confirmational modal prompts |
| `Sheet` | `@base-ui/react/dialog` (drawer) | `packages/ui/src/components/ui/sheet.tsx` | Slide-over panels (side drawers) |
| `DropdownMenu` | `@base-ui/react/menu` | `packages/ui/src/components/ui/dropdown-menu.tsx` | Contextual menus and action popovers |
| `Popover` | `@base-ui/react/popover` | `packages/ui/src/components/ui/popover.tsx` | Floating content popovers |
| `Tooltip` | `@base-ui/react/tooltip` | `packages/ui/src/components/ui/tooltip.tsx` | Hover/focus information tooltips |
| `Command` | `@base-ui/react` search & list | `packages/ui/src/components/ui/command.tsx` | Command palette and searchable filters |
| `Breadcrumb` | Semantic nav list | `packages/ui/src/components/ui/breadcrumb.tsx` | Hierarchical route location markers |
| `Pagination` | Nav list + Button | `packages/ui/src/components/ui/pagination.tsx` | Page navigation controls |
| `ScrollArea` | `@base-ui/react/scroll-area` | `packages/ui/src/components/ui/scroll-area.tsx` | Custom scrollbar containers |
| `Sidebar` | Layout primitives + Sheet | `packages/ui/src/components/ui/sidebar.tsx` | Collapsible application navigation sidebar |
| `Sonner` | `sonner` toast system | `packages/ui/src/components/ui/sonner.tsx` | Floating toast notifications |
| `Calendar` | `react-day-picker` | `packages/ui/src/components/ui/calendar.tsx` | Date picker calendar grid |
| `Progress` | `@base-ui/react/progress` | `packages/ui/src/components/ui/progress.tsx` | Visual progress bar indicators |

### 3.2 Composed Components
1. **`PageHeader`** (`packages/ui/src/composed/page-header.tsx`):
   Standardized page heading banner combining optional breadcrumb slots, title (`h1`), description text, and responsive action button containers.
2. **`StatusBadge`** (`packages/ui/src/composed/status-badge.tsx`):
   Semantic indicator badge supporting variants: `success`, `warning`, `danger`, `info`, `neutral`, `draft` with pulsing/static dot indicators.

---

## 4. Hardened Tenant Branding Contract

Multi-tenant polytechnic institutions may configure custom branding. Because tenant branding parameters come from tenant configuration (eventually via API), all inputs are treated as untrusted.

### 4.1 Strict Input Allow-List Validation
All incoming color values are validated by `isValidColorValue(input)` before evaluation:
- **Allowed Formats**:
  - Hex: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$`)
  - OKLCH: Numeric components with optional percentage (`^oklch\(\s*([0-9.]+)?%?\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+)?%?)?\s*\)$`)
- **Explicit Rejections**:
  Any input containing `;`, `{`, `}`, `url(`, `expression`, quotes (`"`, `'`, `` ` ``), comments (`/*`, `*/`, `//`), or control characters is rejected immediately.
- **Logo URLs**:
  **Logo URLs are intentionally NOT handled by this CSS branding layer.** They will be managed via the storage and asset pipeline in a subsequent Sprint.

### 4.2 Light & Dark Theme Separation
- **Cascade Isolation**: Rather than setting inline styles on `:root` (which would override `.dark` classes due to inline style specificity), `applyTenantBranding` manages a dedicated `<style id="academic-tenant-branding">` sheet with explicit `:root` and `.dark` blocks.
- **Deterministic Dark Derivation**: If a tenant only provides light tokens, the system deterministically evaluates whether the light primary meets contrast in dark mode. If not, it derives a legible dark-mode variant by adjusting lightness ($L$) and chroma ($C$) in OKLCH while keeping the brand hue ($H$) constant.

### 4.3 Contrast Rules & Thresholds
Before applying overrides, `applyTenantBranding` validates 6 mandatory contrast checks against the theme backgrounds:
1. **Light Primary vs Primary-Foreground**: $\ge 4.5:1$ (WCAG AA normal text)
2. **Light Primary vs Light Background**: $\ge 3.0:1$ (Used for interactive buttons and links)
3. **Light Ring vs Light Background**: $\ge 3.0:1$ (Used for focus outlines)
4. **Dark Primary vs Primary-Foreground**: $\ge 4.5:1$
5. **Dark Primary vs Dark Background**: $\ge 3.0:1$
6. **Dark Ring vs Dark Background**: $\ge 3.0:1$

**Fallback Guarantee**: If ANY check fails, the system reverts immediately to preset defaults (`PRESET_DEFAULTS`), clears any active overrides, and returns a structured object detailing the failed metric.

---

## 5. Keyboard Navigation & Accessibility Walkthrough

Every interactive component was systematically evaluated for keyboard accessibility:

| Component | Focus Trap | Escape Key | Focus Return | Arrow-Key Behaviour | Defects Found & Fixes Applied |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dialog** | Yes (contained inside modal) | Dismisses dialog | Returns focus to trigger button | Traverses interactive elements via <kbd>Tab</kbd> | Base UI does not support Radix `asChild`; replaced with `render={<Button ... />}` across all modal triggers. |
| **Alert Dialog** | Yes (trapped inside alert dialog) | Dismisses dialog | Returns focus to trigger button | <kbd>Tab</kbd> cycles between Cancel and Confirm actions | Clean pass. Verified cancel and confirm focus. |
| **Sheet / Drawer** | Yes (trapped within sheet panel) | Slides out and dismisses | Returns focus to trigger button | Traverses sheet contents; <kbd>Tab</kbd> cycles interactive elements | Clean pass. Animations respect `prefers-reduced-motion`. |
| **Dropdown Menu** | Contained in popup | Closes menu immediately | Returns focus to dropdown trigger | <kbd>Up</kbd> / <kbd>Down</kbd> navigates items with wrap-around; <kbd>Right</kbd> opens submenus; <kbd>Left</kbd> closes | Clean pass. Items activate on <kbd>Enter</kbd> / <kbd>Space</kbd>. |
| **Popover** | Contained in popover content | Closes popover | Returns focus to popover trigger | Standard form navigation within flyout | Clean pass. |
| **Command** | Contained in command palette | Dismisses command palette | Returns focus to search launcher | <kbd>Down</kbd> / <kbd>Up</kbd> navigates results without blurring search field; <kbd>Enter</kbd> activates | Clean pass. Keyboard filtering responds immediately. |
| **Select** | Contained in option list | Dismisses option list | Returns focus to select trigger | <kbd>Down</kbd> / <kbd>Up</kbd> moves selection; typeahead jump supported; <kbd>Enter</kbd> selects | Clean pass. Form validation state integrates cleanly. |
| **Calendar** | Contained in calendar grid | Handled by wrapper | Handled by wrapper | <kbd>Left</kbd>/<kbd>Right</kbd> changes day; <kbd>Up</kbd>/<kbd>Down</kbd> changes week; <kbd>PgUp</kbd>/<kbd>PgDn</kbd> changes month | Clean pass using `react-day-picker`. |
| **Sidebar** | Trapped when open on mobile | Closes mobile sheet | Returns to `SidebarTrigger` | Menu buttons traverse via <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> | Fixed `onClick` event typing in `sidebar.tsx` which previously failed TypeScript strict checking with `preventBaseUIHandler`. |
| **Tabs** | N/A (standard tablist) | N/A | Focus advances to active panel | <kbd>Left</kbd> / <kbd>Right</kbd> navigates between tabs in `TabsList` | Clean pass adhering to WAI-ARIA tab pattern. |

### Note on Theme Toggle Hotkey
The single-character shortcut (<kbd>d</kbd>) was removed from the production `ThemeProvider` to eliminate WCAG 2.1.4 single-key shortcut conflicts. It is restricted exclusively to the dev-only showcase route (`/design-system`), where it explicitly ignores inputs, textareas, selects, `contenteditable` elements, and modifier keys.

---

## 6. Monorepo Discipline & Automated CI Guard

To prevent architectural drift:
- **No Local UI Components**: No component files are permitted under `apps/web/src/components/ui/`.
- **No Raw Colors**: No raw hex (`#...`) or `rgb(...)` color literals are permitted in styling classes or inline styles within `apps/web/src/`. All styles must use design tokens (`bg-primary`, `text-muted-foreground`, etc.).
- **Automated Check**:
  Run `pnpm lint` in `apps/web` to trigger `node ./scripts/check-discipline.mjs`. Violations will fail the build immediately with actionable error messages.
