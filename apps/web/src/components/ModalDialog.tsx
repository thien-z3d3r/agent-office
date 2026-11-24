import React from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";

export interface ModalDialogProps {
  open: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  startContent?: React.ReactNode;
  endContent?: React.ReactNode;
  width?: number | string;
  purpose?: "info" | "form" | "required";
  onClose: () => void;
  subheader?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
  open,
  title,
  subtitle,
  startContent,
  endContent,
  width = 680,
  purpose = "info",
  onClose,
  subheader,
  footer,
  children,
}) => {
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      width={width}
      maxHeight="84dvh"
      padding={0}
      purpose={purpose}
    >
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "var(--spacing-3) var(--spacing-4) 0" }}>
          <DialogHeader
            title={title}
            subtitle={subtitle}
            startContent={startContent}
            endContent={endContent}
            hasDivider={!subheader}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) onClose();
            }}
          />
        </div>
        {subheader}
        <div className="modal-body-scroll">{children}</div>
        {footer && <footer className="modal-footer-bar">{footer}</footer>}
      </div>
    </Dialog>
  );
};
