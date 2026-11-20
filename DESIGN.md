# DESIGN.md: Agent Office Visual Direction

## Design Read
Reading this as: interactive 3D spatial developer workspace for a self-hosted software engineer, in the AgentSystemLabs/agent-office tactile ink-and-paper cartoon style, dial ENERGY 3 / RHYTHM 2 / MOTION 2.

## Three Dials
- **ENERGY: 3 (Bold):** Thick 3px ink borders (`#2b2d42`), hard offset block shadows (`0 4px 0 #2b2d42`), and a cel-shaded 3D world with `OutlineEffect` match the comic-book character of the 3D agents.
- **RHYTHM: 2 (Balanced):** Full-viewport 3D canvas acts as the single focal stage, with asymmetric floating paper HUD overlays (top dock bar, right collapsible status stack, bottom-left activity stream, center modal windows).
- **MOTION: 2 (Transitions & Character Acting):** 3D workers blend procedural stances (`type`, `edit`, `read`, `test`, `web`, `waiting`, `failing`, `up`) and button clicks physically depress by `2px` (`translateY(2px)`), all respecting `prefers-reduced-motion: reduce` and the HUD Reduced Motion toggle.

## Color Palette (2 Core Neutrals + 1 Deliberate Accent + Semantic Status Tokens)
- **Day Mode (Default):**
  - `--paper: #fffaf3` (Primary panel background: warm cream paper that echoes the 3D corkboards and speech cards)
  - `--paper-2: #fff1de` (Secondary surface & hover fill: separates modal headers/footers and hover states from base paper)
  - `--ink: #2b2d42` (Structural border, shadow, and body copy color: provides >11:1 WCAG AAA contrast against `--paper` and matches the 3D `OutlineEffect` ink `[0.17, 0.18, 0.26]`)
  - `--muted: #5c5346` (Secondary metadata copy: passes WCAG AA 4.5:1 contrast against both `--paper` and `--paper-2`)
  - `--accent: #ff8a5b` with `--accent-ink: #2b2d42` (One deliberate accent used only on primary submission triggers, active focus outlines, and unread badge counts)
- **Night Mode (Working Light/Dark Toggle):**
  - `--paper: #1b1e2e` (Deep slate panel surface matching the 3D night sky)
  - `--paper-2: #25293e` (Elevated night surface for headers and hover states)
  - `--ink: #f4efe6` (Crisp warm bone text and border outline on dark surfaces, >11:1 contrast)
  - `--muted: #b5b0a6` (Secondary metadata copy on dark surfaces, >4.5:1 contrast)
  - `--accent: #ff9b70` with `--accent-ink: #1b1e2e`
- **Semantic Status Colors (Real Agent States Only):**
  - `--good: #06d6a0` (Ticket done / tests passing)
  - `--warn: #ffd166` (Agent actively working / command executing)
  - `--bad: #ef476f` (Agent waiting on Director approval or escalated error)
  - `--info: #8ecae6` (Agent idle or starting)

## One-Line Reasons for Every Major Visual Decision (R-31)
- **Why this color palette:** Warm cream paper (`#fffaf3`) and deep navy ink (`#2b2d42`) bridge the 2D HUD panels directly to the 3-step cel-shaded 3D toon materials and `OutlineEffect` ink lines in the 3D office.
- **Why this layout:** The 3D office is the product's primary workspace, so it fills `100vw x 100vh` while HUD panels float at the perimeter with `pointer-events: none` passthrough and individual collapse controls (`X`) so the room is never trapped inside a small dashboard column.
- **Why this typography:** Rounded humanist sans-serif (`Nunito, ui-rounded, 'SF Pro Rounded', system-ui, sans-serif` at weights 700-900) matches the chunky cartoon geometry of the 3D workers and 3D canvas speech sprites, while `ui-monospace` is reserved strictly for real terminal outputs, branch names, and git diffs.
- **Why this spacing and border radius:** Panels use `16px` radius with `3px solid` ink borders, buttons use `12px` radius, and status pills use `999px` radius so inputs, buttons, panels, and status chips are visually distinct by shape (`R-11`).
- **Why hard offset shadows instead of soft blur:** Hard `0 4px 0` ink shadows give panels and buttons physical comic-book thickness without blurred glassmorphism or floating softness (`R-10`, `R-12`).
- **Why inline SVG icons instead of emoji or generic AI sparkles:** Custom 2px-stroke geometric SVGs (terminal, git branch, gavel approval, sun/moon, telescope, dog paw, plus) communicate exact developer actions without decorative emoji noise (`R-04`).
