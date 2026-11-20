import React, { useEffect, useRef } from "react";

export interface TelescopeOverlayProps {
  onExit: () => void;
}

export const TelescopeOverlay: React.FC<TelescopeOverlayProps> = ({
  onExit,
}) => {
  const exitBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    exitBtnRef.current?.focus({ preventScroll: true });

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
      <button
        ref={exitBtnRef}
        type="button"
        className="btn telescope-exit"
        onClick={onExit}
      >
        Exit Director Telescope (Esc)
      </button>
    </div>
  );
};
