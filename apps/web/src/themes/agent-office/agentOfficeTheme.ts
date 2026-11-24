import { defineTheme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone";

export const agentOfficeTheme = defineTheme({
  name: "agent-office",
  extends: stoneTheme,
  radius: {
    base: 6,
    multiplier: 1.25,
  },
  tokens: {
    "--color-accent": ["#d6552a", "#ff8a5b"],
    "--color-accent-muted": ["rgba(214, 85, 42, 0.14)", "rgba(255, 138, 91, 0.20)"],
    "--color-on-accent": ["#ffffff", "#171a26"],
    "--color-text-accent": ["#b8431c", "#ffa17a"],
    "--color-icon-accent": ["#c94c23", "#ff9468"],

    "--color-background-body": ["#f4efe7", "#111420"],
    "--color-background-surface": ["#fcf9f4", "#171b2a"],
    "--color-background-card": ["#ffffff", "#1d2236"],
    "--color-background-popover": ["#ffffff", "#232940"],
    "--color-background-muted": ["rgba(43, 45, 66, 0.055)", "rgba(244, 239, 230, 0.07)"],

    "--color-text-primary": ["#1e2133", "#f3efe8"],
    "--color-text-secondary": ["#585a6b", "#a9aec2"],
    "--color-text-disabled": ["#9a9aa6", "#64697d"],
    "--color-icon-primary": ["#1e2133", "#f3efe8"],
    "--color-icon-secondary": ["#585a6b", "#a9aec2"],

    "--color-border": ["rgba(30, 33, 51, 0.12)", "rgba(243, 239, 232, 0.12)"],
    "--color-border-emphasized": ["rgba(30, 33, 51, 0.24)", "rgba(243, 239, 232, 0.24)"],
    "--color-neutral": ["rgba(30, 33, 51, 0.075)", "rgba(243, 239, 232, 0.10)"],
    "--color-overlay": ["rgba(18, 21, 36, 0.48)", "rgba(8, 10, 18, 0.68)"],
    "--color-overlay-hover": ["rgba(30, 33, 51, 0.05)", "rgba(255, 255, 255, 0.06)"],
    "--color-overlay-pressed": ["rgba(30, 33, 51, 0.10)", "rgba(255, 255, 255, 0.12)"],

    "--color-success": ["#0b875b", "#14b885"],
    "--color-success-muted": ["rgba(11, 135, 91, 0.13)", "rgba(20, 184, 133, 0.18)"],
    "--color-on-success": ["#ffffff", "#0d1f19"],
    "--color-warning": ["#c9850c", "#f4b942"],
    "--color-warning-muted": ["rgba(201, 133, 12, 0.14)", "rgba(244, 185, 66, 0.18)"],
    "--color-on-warning": ["#ffffff", "#1e1a10"],
    "--color-error": ["#c9244b", "#f75577"],
    "--color-error-muted": ["rgba(201, 36, 75, 0.12)", "rgba(247, 85, 119, 0.18)"],
    "--color-on-error": ["#ffffff", "#1b0d12"],
  },
});
