import { useState } from "react";

interface CopyButtonProps {
  text: string;
  className?: string;
}

export default function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className={
        className ??
        "text-xs px-2.5 py-1.5 rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      }
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
