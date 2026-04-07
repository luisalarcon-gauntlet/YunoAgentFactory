import { cn } from "@/lib/utils";

type BadgeVariant = "secondary" | "primary" | "accent" | "destructive" | "outline";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  /** Custom bg + text classes (overrides variant) */
  className?: string;
  /** Use pill shape instead of rounded rect */
  pill?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  secondary: "bg-secondary text-secondary-foreground",
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent text-accent-foreground",
  destructive: "bg-red-500/15 text-red-400",
  outline: "border border-border text-muted-foreground",
};

export default function Badge({
  children,
  variant = "secondary",
  className,
  pill = false,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-medium px-1.5 py-0.5",
        pill ? "rounded-full" : "rounded",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
