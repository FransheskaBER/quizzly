## Frontend Styling Rules

This document describes how styling is organized in the client app. It mirrors the canonical rules in `.claude/rules/RULES_STYLING.md` and is the primary reference for day‑to‑day frontend work.

### Design tokens and globals

- **Single source of truth**: All design tokens (colors, typography, spacing, radii, shadows, transitions, component tokens) live in `src/styles/global.css`.
- **No raw values**: Do not introduce new hex colors, RGB/A values, custom fonts, ad‑hoc border‑radius, or shadow values in `.module.css` files. Always add or reuse a `var(--token-name)` from `global.css`.
- **Global layer**: `global.css` owns:
  - CSS reset/normalization and base element styles (`body`, `a`, etc.).
  - Design tokens under `:root`.
  - A **small set** of reusable utility classes for layout and typography (see the file for the current list).

### Shared components vs. pages

- **Shared components** (`src/components/**`):
  - Own all **visual identity** decisions: colors, borders, radii, shadows, typography choices, component paddings.
  - Must read appearance exclusively from tokens defined in `global.css`.
  - Expose `variant` / `size` / layout props instead of encouraging page‑specific overrides.
  - Examples: `Button`, `FormField`, `FormError`, `Modal`, `Card`, `ResultSummary`, `AuthPageLayout`.

- **Page `.module.css` files** (`src/pages/**`):
  - Are **layout‑only glue**:
    - Allowed: `display`, `flex-*`, `grid-*`, `gap`, `margin`, `padding` (for layout spacing), `max-width`, `width`, `min-height`, align/justify props, responsive media queries.
    - Forbidden (unless there is an explicit, documented exception): `color`, `background`, `box-shadow`, `border`, `border-radius`, `font-*`, `text-decoration`, and any raw hex/RGB values.
  - Arrange shared components into complete screens and handle page‑specific structure (e.g. columns, section gaps), but do **not** redefine component chrome.

### Utilities and duplication

- Prefer **utilities or shared components** over duplication:
  - If you write the same flex/spacing/typography pattern more than twice, either:
    - Use an existing utility class from `global.css`, or
    - Add a new utility class there, or
    - Extract a small shared layout component.
- Example utilities (defined in `global.css`):
  - Layout: `.pageShell`, `.stack-sm`, `.stack-md`, `.stack-lg`, `.row-between`, `.row-center`.
  - Typography: `.heading-xl`, `.heading-lg`, `.text-sm`, `.text-muted`, `.text-center`.

### Code review checklist for CSS changes

When reviewing PRs that touch styling:

- Are there any new raw color/font/radius/shadow values? If yes, move them into `global.css` as tokens.
- Does any page `.module.css` define visual identity (colors, borders, shadows, typography) that should live in a shared component instead?
- Is a repeated pattern (card, alert, badge, section header, auth layout) better modeled as:
  - A shared component, or
  - A global utility class?

