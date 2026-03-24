import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MessageTrailProps {
  executionId: string;
  isLive?: boolean;
}

const typeColors: Record<string, { bg: string; text: string }> = {
  task_output: { bg: "bg-primary/10", text: "text-primary" },
  task_input: { bg: "bg-muted", text: "text-muted-foreground" },
  feedback: { bg: "bg-amber-500/10", text: "text-amber-400" },
  approval: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  rejection: { bg: "bg-red-500/10", text: "text-red-400" },
  system: { bg: "bg-zinc-500/10", text: "text-zinc-400" },
};

const agentColors = [
  "border-l-blue-500",
  "border-l-emerald-500",
  "border-l-violet-500",
  "border-l-amber-500",
  "border-l-rose-500",
  "border-l-cyan-500",
];

function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return agentColors[Math.abs(hash) % agentColors.length];
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function MessageTrail({ executionId, isLive = false }: MessageTrailProps) {
  const { data: messages, isLoading } = useQuery({
    queryKey: ["execution-messages", executionId],
    queryFn: () => api.executions.messages(executionId),
    refetchInterval: isLive ? 2000 : false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!messages?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mx-auto mb-2 opacity-50">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
        <p className="text-sm">No messages yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      {messages.map((msg) => {
        const fromName = msg.from_agent_name ?? "System";
        const toName = msg.to_agent_name ?? "System";
        const typeStyle = typeColors[msg.message_type] ?? typeColors.task_output;
        const colorClass = getAgentColor(fromName);

        return (
          <div
            key={msg.id}
            className={cn(
              "rounded-lg border border-border bg-card/50 pl-0 overflow-hidden",
              "border-l-[3px]",
              colorClass
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{fromName}</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 text-muted-foreground">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
                <span className="text-xs text-muted-foreground">{toName}</span>
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium", typeStyle.bg, typeStyle.text)}>
                  {msg.message_type.replace("_", " ")}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {formatTime(msg.created_at)}
              </span>
            </div>

            {/* Content */}
            <div className="px-3 py-2">
              <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </p>
            </div>

            {/* Channel badge */}
            {msg.channel !== "internal" && (
              <div className="px-3 pb-1.5">
                <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  via {msg.channel}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
