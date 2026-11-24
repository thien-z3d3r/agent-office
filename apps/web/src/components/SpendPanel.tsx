import React from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { useOfficeStore } from "../store/office-store.ts";

export const SpendPanel: React.FC = React.memo(() => {
  const totalCostUsd = useOfficeStore((s) => s.snapshot.totalCostUsd);
  const reducedMotion = useOfficeStore((s) => s.reducedMotion);
  const toggleReducedMotion = useOfficeStore((s) => s.toggleReducedMotion);
  const performanceMode = useOfficeStore((s) => s.performanceMode);
  const togglePerformanceMode = useOfficeStore((s) => s.togglePerformanceMode);

  const dailyCap = 15.0;
  const pct = Math.min(100, (totalCostUsd / dailyCap) * 100);

  return (
    <section
      className="hud-drawer-footer"
      aria-label="Spend, motion, and performance"
    >
      <HStack gap={2} vAlign="center" hAlign="between">
        <Text type="supporting" weight="semibold">
          Session Spend
        </Text>
        <Text type="supporting" hasTabularNumbers>
          ${totalCostUsd.toFixed(4)} / ${dailyCap.toFixed(2)}
        </Text>
      </HStack>

      <ProgressBar
        label="Daily spend budget"
        isLabelHidden
        value={pct}
        max={100}
        variant={pct > 85 ? "error" : pct > 60 ? "warning" : "success"}
      />

      <HStack gap={3} vAlign="center" hAlign="between">
        <Switch
          size="sm"
          label="Reduced motion"
          value={reducedMotion}
          onChange={toggleReducedMotion}
        />
        <Switch
          size="sm"
          label="Low GPU"
          value={performanceMode}
          onChange={togglePerformanceMode}
        />
      </HStack>
    </section>
  );
});

SpendPanel.displayName = "SpendPanel";
