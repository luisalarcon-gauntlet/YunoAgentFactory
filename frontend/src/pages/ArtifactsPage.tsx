import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ArtifactListItem, Artifact, ArtifactUpdate } from "@/lib/api";
import Badge from "@/components/ui/badge";

// ── Type icons ──

const TYPE_ICONS: Record<string, string> = {
  application: "M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5",
  document: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  website: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
  code: "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5",
  other: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z",
};

const STATUS_COLORS: Record<string, string> = {
  live: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  draft: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  archived: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const TYPE_OPTIONS = ["application", "document", "website", "code", "other"];
const STATUS_OPTIONS = ["live", "draft", "archived"];

// ── Library Grid View ──

function ArtifactCard({
  artifact,
  onSelect,
}: {
  artifact: ArtifactListItem;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(artifact.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(artifact.id); } }}
      aria-label={`${artifact.name} — ${artifact.status} ${artifact.type}`}
      className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:bg-accent/30 transition-all cursor-pointer flex flex-col gap-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-primary shrink-0"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={TYPE_ICONS[artifact.type] || TYPE_ICONS.other} />
          </svg>
          <h3 className="text-sm font-medium text-foreground truncate">{artifact.name}</h3>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLORS[artifact.status] || STATUS_COLORS.draft}`}>
          {artifact.status}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        {artifact.workflow_name && (
          <span className="truncate">From: {artifact.workflow_name}</span>
        )}
        <span>{new Date(artifact.created_at).toLocaleDateString()}</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {artifact.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="accent">{tag}</Badge>
        ))}
        {artifact.tags.length > 3 && (
          <span className="text-[10px] text-muted-foreground">+{artifact.tags.length - 3}</span>
        )}
      </div>

      {artifact.live_url && (
        <a
          href={artifact.live_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-primary hover:underline truncate"
        >
          Open Live
        </a>
      )}
    </div>
  );
}

// ── Detail View ──

function ArtifactDetail({
  artifactId,
  onBack,
}: {
  artifactId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editStatus, setEditStatus] = useState("");

  const { data: artifact, isLoading, error } = useQuery<Artifact>({
    queryKey: ["artifact", artifactId],
    queryFn: () => api.artifacts.get(artifactId),
  });

  useEffect(() => {
    if (artifact) {
      setEditContent(artifact.content);
      setEditName(artifact.name);
      setEditTags(artifact.tags.join(", "));
      setEditStatus(artifact.status);
    }
  }, [artifact]);

  const updateMutation = useMutation({
    mutationFn: (data: ArtifactUpdate) => api.artifacts.update(artifactId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] });
      queryClient.invalidateQueries({ queryKey: ["artifacts"] });
      setEditing(false);
    },
  });

  const handleSave = useCallback(() => {
    const tags = editTags.split(",").map((t) => t.trim()).filter(Boolean);
    updateMutation.mutate({
      name: editName,
      content: editContent,
      tags,
      status: editStatus as Artifact["status"],
    });
  }, [editName, editContent, editTags, editStatus, updateMutation]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-accent rounded" />
          <div className="h-96 bg-accent rounded" />
        </div>
      </div>
    );
  }

  if (error || !artifact) {
    return (
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
        <button onClick={onBack} className="text-sm text-primary hover:underline mb-4">Back to Library</button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
          Failed to load artifact
        </div>
      </div>
    );
  }

  const isCode = artifact.type === "code" || artifact.type === "application";

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Back to library"
          className="p-2.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        {editing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="text-xl font-bold bg-transparent border-b border-primary outline-none flex-1"
          />
        ) : (
          <h1 className="text-xl font-bold flex-1">{artifact.name}</h1>
        )}
        <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[artifact.status]}`}>
          {artifact.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Content area */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Content</h2>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-2.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="px-3 py-2.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {editing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-[500px] bg-card border border-border rounded-lg p-4 text-sm font-mono resize-y outline-none focus:border-primary/50 transition-colors"
            />
          ) : (
            <div className={`rounded-lg border border-border bg-card p-4 min-h-[200px] max-h-[600px] overflow-auto ${isCode ? "font-mono text-xs" : "text-sm"}`}>
              <pre className="whitespace-pre-wrap break-words">{artifact.content || "No content"}</pre>
            </div>
          )}

          {updateMutation.isError && (
            <div role="alert" className="text-xs text-destructive">Failed to save changes</div>
          )}
        </div>

        {/* Metadata sidebar */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <h3 className="text-sm font-medium">Details</h3>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-primary">
                    <path strokeLinecap="round" strokeLinejoin="round" d={TYPE_ICONS[artifact.type] || TYPE_ICONS.other} />
                  </svg>
                  <span className="capitalize">{artifact.type}</span>
                </div>
              </div>

              {editing ? (
                <div>
                  <label className="text-xs text-muted-foreground">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-muted/30 border border-border text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {artifact.workflow_name && (
                <div>
                  <label className="text-xs text-muted-foreground">Source Workflow</label>
                  <p className="mt-0.5">{artifact.workflow_name}</p>
                </div>
              )}

              {artifact.execution_id && (
                <div>
                  <label className="text-xs text-muted-foreground">Execution</label>
                  <p className="mt-0.5 text-xs font-mono text-muted-foreground">{artifact.execution_id.slice(0, 8)}...</p>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground">Created</label>
                <p className="mt-0.5">{new Date(artifact.created_at).toLocaleString()}</p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Updated</label>
                <p className="mt-0.5">{new Date(artifact.updated_at).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h3 className="text-sm font-medium">Tags</h3>
            {editing ? (
              <input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="comma-separated tags"
                className="w-full px-2 py-1.5 rounded-lg bg-muted/30 border border-border text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {artifact.tags.length > 0 ? (
                  artifact.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded bg-accent text-accent-foreground">{tag}</span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No tags</span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          {artifact.live_url && (
            <a
              href={artifact.live_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Open Live
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function ArtifactsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: artifacts, isLoading, error } = useQuery<ArtifactListItem[]>({
    queryKey: ["artifacts", typeFilter, statusFilter, debouncedSearch],
    queryFn: () =>
      api.artifacts.list({
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
      }),
  });

  if (selectedId) {
    return <ArtifactDetail artifactId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Library</h1>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <input
          type="text"
          placeholder="Search artifacts..."
          aria-label="Search artifacts"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by type"
          className="px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="">All Types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 h-36 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
          Failed to load artifacts
        </div>
      ) : !artifacts || artifacts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          <p className="text-muted-foreground text-sm">No artifacts found</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Artifacts are created when workflow executions complete</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {artifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} onSelect={setSelectedId} />
          ))}
        </div>
      )}
    </div>
  );
}
