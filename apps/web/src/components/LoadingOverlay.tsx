import React from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useOfficeStore } from "../store/office-store.ts";

export interface LoadingOverlayProps {
  loadPct: number;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ loadPct }) => {
  const modelsError = useOfficeStore((s) => s.modelsError);

  return (
    <div id="loading" role="status" aria-live="polite">
      <Card elevation="high" padding={6} maxWidth={360} width="100%">
        <VStack gap={3} hAlign="center">
          <svg
            className="hud-loading-paw"
            viewBox="0 0 64 64"
            aria-hidden="true"
          >
            <path d="M32 31c8 0 18 9 18 17 0 6-5 8-10 7-3-.5-5-1.5-8-1.5s-5 1-8 1.5c-5 1-10-1-10-7 0-8 10-17 18-17z" />
            <ellipse
              cx="11.5"
              cy="31"
              rx="5.5"
              ry="7.5"
              transform="rotate(-24 11.5 31)"
            />
            <ellipse
              cx="24"
              cy="17.5"
              rx="6"
              ry="8"
              transform="rotate(-8 24 17.5)"
            />
            <ellipse
              cx="40"
              cy="17.5"
              rx="6"
              ry="8"
              transform="rotate(8 40 17.5)"
            />
            <ellipse
              cx="52.5"
              cy="31"
              rx="5.5"
              ry="7.5"
              transform="rotate(24 52.5 31)"
            />
          </svg>

          <Heading level={2}>Agent Office</Heading>

          <div style={{ width: "100%" }}>
            <ProgressBar
              label="Loading 3D office models"
              isLabelHidden
              value={loadPct}
              max={100}
              variant="accent"
            />
          </div>

          <Text type="supporting" hasTabularNumbers>
            Loading 3D workspace models ({loadPct}%)
          </Text>

          {modelsError && (
            <div style={{ width: "100%", textAlign: "left" }}>
              <Banner
                status="error"
                title="3D Asset Error"
                description={modelsError}
              />
            </div>
          )}
        </VStack>
      </Card>
    </div>
  );
};
