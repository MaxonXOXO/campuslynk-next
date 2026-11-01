# Academic Suite Design System Specification

## 1. Overview & Preset Configuration

The **Academic Suite** (CampusLynk / Carmel LINX) frontend utilizes a design system built on **shadcn** with **Base UI** primitives (`base-vega` style) and modern **OKLCH** color tokens.

### Preset Metadata
- **Preset Code**: `b2BnwmRcY`
- **shadcn CLI Version**: `4.23.0`
- **Component Style**: `base-vega` (utilizing `@base-ui/react` primitives rather than Radix UI)
- **Icon Library**: `@remixicon/react` (v4.9.0)
- **Base Color Space**: `neutral` in **OKLCH**
- **Border Radius**: `0.45rem`
- **Tailwind Version**: Tailwind CSS v4 (`@tailwindcss/postcss` 4.3.3)

---

## 2. Component Inventory

All base UI components live exclusively in `frontend/packages/ui` (`@academic-suite/ui`). Applications (such as `frontend/apps/web`) consume them as workspace dependencies and must not declare local component files under `src/components/ui/`.

### 2.1 The 31 shadcn Primitive Components
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

### 2.2 Composed Components
1. **`PageHeader`** (`packages/ui/src/composed/page-header.tsx`):
   - Combines breadcrumbs, title (`h1`), description text, and customizable action button slots.
   - Automatically handles mobile wrapping and spacing.
2. **`StatusBadge`** (`packages/ui/src/composed/status-badge.tsx`):
   - Semantic indicator badge supporting variants: `success`, `warning`, `danger`, `info`, `neutral`, `draft`.
   - Renders a colored indicator dot, accessible labels, and follows the unified design tokens.

---

## 3. CSS Variable & Token Reference

The design system uses CSS custom properties defined in `packages/ui/src/styles/globals.css`. Color tokens are defined in the modern **OKLCH** color space for perceptual uniformity.

### Light & Dark Token Map
| CSS Variable | Light Theme Value (OKLCH / Rem) | Dark Theme Value (OKLCH / Rem) | Purpose |
| :--- | :--- | :--- | :--- |
| `--background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | Page background |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | Primary text |
| `--card` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | Card/surface background |
| `--card-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | Card text |
| `--popover` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | Flyout/popover surface |
| `--popover-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | Popover text |
| `--primary` | `oklch(0.508 0.118 165.612)` | `oklch(0.508 0.118 165.612)` | Brand primary color (Forest Green) |
| `--primary-foreground`| `oklch(0.979 0.021 166.113)` | `oklch(0.979 0.021 166.113)` | Text on primary color |
| `--secondary` | `oklch(0.967 0.001 286.375)` | `oklch(0.269 0 0)` | Secondary surface |
| `--secondary-foreground`| `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | Text on secondary surface |
| `--muted` | `oklch(0.967 0.001 286.375)` | `oklch(0.269 0 0)` | Subtle/inactive background |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | Low-emphasis text |
| `--accent` | `oklch(0.967 0.001 286.375)` | `oklch(0.269 0 0)` | Hover/highlight background |
| `--accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | Hover/highlight text |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.396 0.141 25.723)` | Critical actions / errors |
| `--destructive-foreground`| `oklch(0.577 0.245 27.325)` | `oklch(0.637 0.237 25.331)` | Text on destructive elements |
| `--border` | `oklch(0.922 0 0)` | `oklch(0.269 0 0)` | Border lines |
| `--input` | `oklch(0.922 0 0)` | `oklch(0.269 0 0)` | Input field borders |
| `--ring` | `oklch(0.508 0.118 165.612)` | `oklch(0.508 0.118 165.612)` | Focus rings |
| `--radius` | `0.45rem` | `0.45rem` | Border radius baseline |

---

## 4. Tenant Branding Contract

Multi-tenant polytechnic institutions may configure custom branding. To preserve accessibility and system cohesion, branding customization is strictly governed:

### 4.1 Customization Scope
- **Permitted Overrides**:
  - `--primary` (Tenant brand color)
  - `--primary-foreground` (Text on brand color)
  - `--ring` (Focus outline color, typically matching primary)
- **Forbidden Overrides**:
  - `--background`, `--foreground`, `--card`, `--card-foreground` (Must preserve dark/light theme integrity)
  - `--destructive`, `--destructive-foreground` (Must remain universally recognizable for safety/danger)
  - Spacing, layout metrics, and radii.

### 4.2 WCAG AA Contrast Validation
Before any tenant branding is applied to `:root`, `applyTenantBranding(tokens)` validates contrast:
1. Colors provided in Hex (`#rrggbb`), RGB (`rgb(...)`), or OKLCH are parsed into linear relative luminance.
2. The contrast ratio is calculated:
   $$\text{Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05}$$
3. **Threshold**: The ratio between `--primary` and `--primary-foreground` must be $\ge 4.5:1$ (WCAG 2.1 AA requirement for normal text).
4. If the check fails, `applyTenantBranding` rejects the tokens, leaves current CSS variables intact, and returns a descriptive error reason.

---

## 5. Malayalam Typography & Kerala Polytechnic Localization

Polytechnic operations in Kerala (administrative notifications, official course titles, mark entry lists) require bilingual English and Malayalam typography.

### 5.1 Font Selection: Noto Sans Malayalam
- **Selected Font**: `Noto_Sans_Malayalam` via `next/font/google`.
- **Primary Latin Font**: `Inter` (supplemented by `Geist_Mono` for codes and roll numbers).
- **CSS Font Family Chain**:
  ```css
  font-family: var(--font-inter), var(--font-noto-sans-malayalam), system-ui, -apple-system, sans-serif;
  ```

### 5.2 Rationale & Rendering Safeguards
1. **Complex Conjuncts (കൂട്ടക്ഷരങ്ങൾ)**: Noto Sans Malayalam provides OpenType glyph shaping for complex ligatures (e.g., യ്ക്ക, ങ്ങ, ണ്ഡ, ത്ഥ, ഷ്ട) without clipping or improper vertical misalignment.
2. **Unbroken Words**: Malayalam words have long compound structures. Components apply `break-words` (and avoid `break-all`) to prevent splitting syllables mid-character.
3. **Line Height**: Malayalam scripts feature ascenders and descenders (മാത്രകൾ). The design system enforces a minimum line-height of `1.5` (`leading-normal` or `leading-relaxed`) to prevent vertical overlap in tables and cards.

---

## 6. Developer Guide

### 6.1 Installing a New Component
To add a new shadcn component:
1. Navigate to the UI package:
   ```bash
   cd frontend/packages/ui
   ```
2. Run the shadcn CLI:
   ```bash
   pnpm dlx shadcn@latest add <component-name>
   ```
3. Ensure all internal cross-imports within `packages/ui` use relative paths (e.g., `./button` instead of `@/components/ui/button`).
4. Re-export the component in `packages/ui/src/index.ts`.

### 6.2 Consuming in Applications
In `frontend/apps/web` (or any future app/package):
```tsx
import { Button, Card, PageHeader, StatusBadge } from "@academic-suite/ui";
```

### 6.3 Monorepo Discipline & Automated CI Guard
To prevent architectural drift:
- **No Local UI Components**: No component files are permitted under `apps/web/src/components/ui/`.
- **No Raw Colors**: No raw hex (`#...`) or `rgb(...)` color literals are permitted in styling classes or inline styles within `apps/web/src/`. All styles must use design tokens (`bg-primary`, `text-muted-foreground`, etc.).
- **Automated Check**:
  Run `pnpm lint` in `apps/web` to trigger `node ./scripts/check-discipline.mjs`. Violations will fail the build immediately with actionable error messages.
