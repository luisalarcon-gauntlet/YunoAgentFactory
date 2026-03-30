import ReactMarkdown from "react-markdown";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export default function MarkdownContent({ content, className = "" }: MarkdownContentProps) {
  return (
    <div className={`prose prose-invert prose-sm max-w-none break-words ${className}`}>
      <ReactMarkdown
        components={{
          pre: ({ children }) => (
            <pre className="bg-black/30 border border-border/50 rounded-lg p-3 overflow-x-auto text-xs">
              {children}
            </pre>
          ),
          code: ({ children, className: codeClassName }) => {
            const isBlock = codeClassName?.startsWith("language-");
            if (isBlock) {
              return <code className="text-xs">{children}</code>;
            }
            return (
              <code className="bg-muted/50 px-1 py-0.5 rounded text-xs text-foreground/90">
                {children}
              </code>
            );
          },
          p: ({ children }) => <p className="text-xs text-foreground/90 leading-relaxed mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="text-xs text-foreground/90 list-disc pl-4 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="text-xs text-foreground/90 list-decimal pl-4 mb-2">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          h1: ({ children }) => <h1 className="text-sm font-bold text-foreground mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold text-foreground mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-semibold text-foreground mb-1">{children}</h3>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="text-xs border-collapse w-full">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border/50 px-2 py-1 bg-muted/30 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-border/50 px-2 py-1">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
