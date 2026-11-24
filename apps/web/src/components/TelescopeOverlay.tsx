import React, { useEffect, useRef } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Kbd } from "@astryxdesign/core/Kbd";
import { ArrowLeft } from "lucide-react";

export interface TelescopeOverlayProps {
  onExit: () => void;
}

export const TelescopeOverlay: React.FC<TelescopeOverlayProps> = ({
  onExit,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const btn = wrapRef.current?.querySelector("button");
    btn?.focus({ preventScroll: true });

    return () => {
      if (
        opener &&
        opener.isConnected &&
        !document.querySelector('[role="dialog"]')
      ) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div className="telescope-view">
      <div className="telescope-reticle" aria-hidden="true" />
      <div ref={wrapRef} className="telescope-exit-wrap">
        <Button
          variant="secondary"
          elevation="high"
          icon={<Icon icon={ArrowLeft} />}
          label="Exit Director Telescope (Esc)"
          onClick={onExit}
        >
          <span>Exit Telescope</span>
          <Kbd keys="Esc" />
        </Button>
      </div>
    </div>
  );
};
