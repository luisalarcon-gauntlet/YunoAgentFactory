import { cn } from "@/lib/utils";

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

export default function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <span
      className={cn(
        "text-[10px] font-medium text-muted-foreground uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </span>
  );
}
