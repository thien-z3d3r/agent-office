import React, { useRef, type RefObject } from "react";
import { useModalFocusTrap } from "./useModalFocusTrap.ts";

export interface ModalDialogProps {
  open: boolean;
  titleId: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
  open,
  titleId,
  title,
  closeLabel,
  onClose,
  initialFocusRef,
  footer,
  children,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const pointerDownOnBackdropRef = useRef(false);

  useModalFocusTrap({
    open,
    modalRef,
    initialFocusRef,
    onClose,
  });

  if (!open) return null;

  return (
    <div
      className="backdrop"
      onMouseDown={(e) => {
        pointerDownOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const shouldClose =
          pointerDownOnBackdropRef.current && e.target === e.currentTarget;
        pointerDownOnBackdropRef.current = false;
        if (shouldClose) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="modal"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="btn btn-sm"
            aria-label={closeLabel}
            onClick={onClose}
          >
            Close
          </button>
        </header>
        {children}
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
};
