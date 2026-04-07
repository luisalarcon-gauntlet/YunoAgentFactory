interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}

export default function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      {icon && <div className="flex justify-center mb-2 opacity-50">{icon}</div>}
      <p className="text-sm">{title}</p>
      {description && <p className="text-xs mt-1">{description}</p>}
    </div>
  );
}
