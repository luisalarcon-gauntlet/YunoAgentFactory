import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type IconButtonVariant = "ghost" | "destructive";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  /** Accessible label — required for icon-only buttons */
  "aria-label": string;
}

const variantStyles: Record<IconButtonVariant, string> = {
  ghost: "text-muted-foreground hover:text-foreground",
  destructive: "text-muted-foreground hover:text-destructive",
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "ghost", className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "p-2.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
          variantStyles[variant],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
IconButton.displayName = "IconButton";

export default IconButton;
