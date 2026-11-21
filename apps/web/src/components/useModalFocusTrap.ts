import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  'input:not(:disabled):not([type="hidden"])',
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(
    (el) =>
      el.getClientRects().length > 0 &&
      window.getComputedStyle(el).visibility !== "hidden"
  );
}

export function useModalFocusTrap(args: {
  open: boolean;
  modalRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}): void {
  const { open, modalRef, initialFocusRef, onClose } = args;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const modalEl = modalRef.current;
    if (!modalEl) return;

    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const initialTarget =
      initialFocusRef?.current ?? getFocusableElements(modalEl)[0] ?? modalEl;
    initialTarget.focus({ preventScroll: true });
  }, [open, modalRef, initialFocusRef]);

  useEffect(() => {
    if (!open) return;
    const modalEl = modalRef.current;
    if (!modalEl) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;

      const focusables = getFocusableElements(modalEl);
      if (focusables.length === 0) {
        e.preventDefault();
        modalEl.focus({ preventScroll: true });
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === modalEl || !modalEl.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !modalEl.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open, modalRef]);
}
