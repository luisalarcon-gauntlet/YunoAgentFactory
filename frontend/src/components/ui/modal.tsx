import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Max width class, e.g. "max-w-lg" */
  size?: string;
  /** ID for aria-labelledby on the dialog */
  labelledBy?: string;
}

export default function Modal({
  open,
  onClose,
  children,
  size = "max-w-lg",
  labelledBy,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative bg-card border border-border rounded-xl shadow-2xl w-full mx-4 flex flex-col overflow-hidden",
          size,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Standard modal header with title and close button. */
export function ModalHeader({
  children,
  onClose,
  id,
}: {
  children: React.ReactNode;
  onClose: () => void;
  id?: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-border">
      <h2 id={id} className="text-sm font-semibold">
        {children}
      </h2>
      <button
        onClick={onClose}
        aria-label="Close dialog"
        className="text-muted-foreground hover:text-foreground p-2.5 rounded transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-4 h-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18 18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

/** Standard modal footer for action buttons. */
export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 px-5 py-3 border-t border-border">
      {children}
    </div>
  );
}
