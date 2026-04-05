import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ChatMessage, type SuggestedWorkflow } from "@/lib/api";
import { cn } from "@/lib/utils";

const CONVERSATION_STARTERS = [
  "What can this platform do?",
  "I need to build and deploy an app",
  "Help me set up a research pipeline",
];

function SuggestionCard({
  workflow,
  action,
  onUseTemplate,
  onCreateCustom,
}: {
  workflow: SuggestedWorkflow;
  action: "use_template" | "create_custom" | null;
  onUseTemplate: (templateId: string) => void;
  onCreateCustom: () => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div>
        <h4 className="text-xs font-semibold text-foreground">{workflow.name}</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">{workflow.description}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {workflow.agents.map((agent) => (
          <span
            key={agent}
            className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
          >
            {agent}
          </span>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        {workflow.template_id && (
          <button
            onClick={() => onUseTemplate(workflow.template_id!)}
            className="flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Use This Template
          </button>
        )}
        <button
          onClick={onCreateCustom}
          className={cn(
            "px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors",
            workflow.template_id
              ? "flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80"
              : "flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          Create Custom
        </button>
      </div>
    </div>
  );
}

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  suggestedWorkflow?: SuggestedWorkflow | null;
  suggestedAction?: "use_template" | "create_custom" | null;
}

export default function ChatWidget({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const recommendMutation = useMutation({
    mutationFn: (chatMessages: ChatMessage[]) => api.chat.recommend(chatMessages),
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message,
          suggestedWorkflow: data.suggested_workflow,
          suggestedAction: data.suggested_action,
        },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't process that request. Please try again.",
        },
      ]);
    },
  });

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || recommendMutation.isPending) return;

      const userMsg: DisplayMessage = { role: "user", content: text.trim() };
      const updated = [...messages, userMsg];
      setMessages(updated);
      setInput("");

      // Build ChatMessage[] for API (strip display-only fields)
      const apiMessages: ChatMessage[] = updated.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      recommendMutation.mutate(apiMessages);
    },
    [messages, recommendMutation]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const cloneMutation = useMutation({
    mutationFn: (templateId: string) => api.workflows.cloneTemplate(templateId),
    onSuccess: (cloned) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      onClose();
      navigate(`/workflows/${cloned.id}`);
    },
  });

  const handleUseTemplate = (templateId: string) => {
    cloneMutation.mutate(templateId);
  };

  const handleCreateCustom = () => {
    onClose();
    navigate("/workflows");
  };

  if (!open) return null;

  return (
    <>
      {/* Mobile: full-screen overlay */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-card">
        <ChatContent
          messages={messages}
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onStarterClick={sendMessage}
          isPending={recommendMutation.isPending}
          messagesEndRef={messagesEndRef}
          inputRef={inputRef}
          onClose={onClose}
          onUseTemplate={handleUseTemplate}
          onCreateCustom={handleCreateCustom}
        />
      </div>

      {/* Desktop: side panel */}
      <div className="hidden md:flex flex-col w-80 lg:w-96 border-l border-border bg-card h-full">
        <ChatContent
          messages={messages}
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onStarterClick={sendMessage}
          isPending={recommendMutation.isPending}
          messagesEndRef={messagesEndRef}
          inputRef={inputRef}
          onClose={onClose}
          onUseTemplate={handleUseTemplate}
          onCreateCustom={handleCreateCustom}
        />
      </div>
    </>
  );
}

function ChatContent({
  messages,
  input,
  setInput,
  onSubmit,
  onStarterClick,
  isPending,
  messagesEndRef,
  inputRef,
  onClose,
  onUseTemplate,
  onCreateCustom,
}: {
  messages: DisplayMessage[];
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStarterClick: (text: string) => void;
  isPending: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  onClose: () => void;
  onUseTemplate: (templateId: string) => void;
  onCreateCustom: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h3 className="text-sm font-semibold">Workflow Assistant</h3>
          <p className="text-[10px] text-muted-foreground">Find the right workflow for your task</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3 pt-4">
            <p className="text-xs text-muted-foreground text-center">
              Ask me about workflows, templates, or what you're trying to build.
            </p>
            <div className="flex flex-col gap-2">
              {CONVERSATION_STARTERS.map((starter) => (
                <button
                  key={starter}
                  onClick={() => onStarterClick(starter)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-xs",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.suggestedWorkflow && (
                <SuggestionCard
                  workflow={msg.suggestedWorkflow}
                  action={msg.suggestedAction ?? null}
                  onUseTemplate={onUseTemplate}
                  onCreateCustom={onCreateCustom}
                />
              )}
            </div>
          </div>
        ))}

        {isPending && (
          <div className="flex justify-start">
            <div className="bg-secondary text-secondary-foreground rounded-lg px-3 py-2 text-xs">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={onSubmit} className="shrink-0 px-4 py-3 border-t border-border">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what you need..."
            disabled={isPending}
            className="flex-1 bg-secondary text-foreground text-xs rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isPending}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </form>
    </>
  );
}
