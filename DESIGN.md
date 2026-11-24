# DESIGN.md: Agent Office Visual Direction

## Design Read
Interactive 3D spatial developer workspace for a self-hosted software engineering studio, built with **Astryx (`@astryxdesign/core`)** and a custom **`agent-office`** theme (extending `@astryxdesign/theme-stone`) guided by `design-taste-frontend` restraint: crisp visual hierarchy, single-row spatial chrome, zero box-in-box clutter, real product UI, and unobstructed 3D stage presence.

## Design System & Theme Architecture
- **Component System:** `@astryxdesign/core` (`Theme`, `Button`, `IconButton`, `Selector`, `SegmentedControl`, `DropdownMenu`, `TabList`, `Tab`, `Badge`, `Banner`, `Card`, `Dialog`, `DialogHeader`, `TextInput`, `TextArea`, `Switch`, `ProgressBar`, `Code`, `CodeBlock`, `Collapsible`, `EmptyState`, `StatusDot`, `Kbd`, `HStack`, `VStack`, `Text`, `Heading`, `Divider`).
- **Custom Theme:** `apps/web/src/themes/agent-office/agentOfficeTheme.ts` compiled via `astryx theme build` into `agent-office.css` / `agent-office.js` and registered through `apps/web/src/astryx-themes.ts`.
- **Cascade Layer Order:** `@layer reset, astryx-base, astryx-theme, app-hud;` in `apps/web/src/styles/office.css` guarantees Astryx base & theme styles compose cleanly with frosted spatial HUD positioning rules.

## Color Palette (Semantic Astryx Tokens, Day & Night Modes)
- **Day Mode (`light`):**
  - `--color-background-body: #f4efe7` / `--color-background-surface: #fcf9f4` / `--color-background-card: #ffffff` (Warm sunlit parchment surfaces that pair naturally with the cel-shaded maple office floor and corkboards)
  - `--color-text-primary: #1e2133` / `--color-text-secondary: #585a6b` (>11:1 AAA primary contrast and >4.5:1 AA supporting contrast)
  - `--color-accent: #d6552a` with `--color-on-accent: #ffffff` (Terracotta coral accent reserved for the single primary Dispatch CTA, active selections, and key interactive emphasis)
  - `--color-border: rgba(30, 33, 51, 0.12)` (Restrained 1px hairline separation replacing heavy 3px cartoon borders)
- **Night Mode (`dark`):**
  - `--color-background-body: #111420` / `--color-background-surface: #171b2a` / `--color-background-card: #1d2236` (Deep twilight indigo-slate matching the 3D night sky)
  - `--color-text-primary: #f3efe8` / `--color-text-secondary: #a9aec2`
  - `--color-accent: #ff8a5b` with `--color-on-accent: #171a26`
- **Semantic Status Hierarchy:**
  - Quiet text for default/completed states (`idle`, `done`) so healthy rows never flood the screen with competing badges.
  - Accent/orange `Badge` for active running work (`writing`, `testing`, `standup`).
  - High-visibility error `Badge` + floating `ApprovalDock` strictly for items needing Director attention (`waiting_approval`, `error`).

## Spatial Layout & UX Decisions
- **Single-Row Floating Command Bar:** Consolidates the brand status pill, Provider `Selector`, active Model shortcut, 3-way Camera `SegmentedControl` (`Office` / `Standup` / `Loft`), single primary `Dispatch` CTA, `Demos` `DropdownMenu`, Settings, Day/Night toggle, and Drawer toggle into one clean 44px floating row that never wraps over the 3D wall boards.
- **Unified Collapsible Workspace Drawer:** Replaces three cramped stacked boxes (`Workers`, `Task Table`, `Spend & Performance`) with one full-height frosted Astryx drawer featuring `TabList` (`Workers` / `Tasks`) so all 8 workers or task rows remain scannable at once, anchored by a compact spend + motion/GPU footer (`ProgressBar` + `Switch` controls).
- **Collapsible Activity Ticker:** Bottom-left floating surface defaults to the latest 2 events and expands cleanly on demand so lower-left desks stay visible.
- **Syntax-Highlighted Agent Inspector:** Role switcher `TabList` directly beneath the `DialogHeader`, structured 4-cell metadata grid with tabular numerals, curated tool chips, and Astryx `CodeBlock` with copy buttons and unified diff highlighting (`isDiff`) for terminal stream and git worktree diffs.
- **Typography & Icons:** Figtree + Montserrat + JetBrains Mono bundled via `@astryxdesign/theme-stone/fonts.css`, paired with clean geometric `lucide-react` icons through Astryx `<Icon />`.
