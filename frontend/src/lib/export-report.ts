import type { Execution, ExecutionStep } from "./api";

/**
 * Convert markdown text to HTML — handles the subset of markdown
 * produced by the AI agents (headings, bold, italic, lists, code blocks, hr).
 */
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inCodeBlock = false;
  let inList: "ul" | "ol" | null = null;

  function escape(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function inlineFormat(line: string): string {
    let s = escape(line);
    // bold + italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    // bold
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // italic
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // inline code
    s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    return s;
  }

  function closeList() {
    if (inList) {
      html.push(inList === "ul" ? "</ul>" : "</ol>");
      inList = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Code block fences
    if (raw.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        html.push("</code></pre>");
        inCodeBlock = false;
      } else {
        closeList();
        const lang = raw.trimStart().slice(3).trim();
        html.push(`<pre class="code-block"><code${lang ? ` class="language-${escape(lang)}"` : ""}>`);
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      html.push(escape(raw));
      continue;
    }

    const trimmed = raw.trim();

    // Empty line — close list, add spacing
    if (trimmed === "") {
      closeList();
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      closeList();
      html.push("<hr />");
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Unordered list
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inList !== "ul") {
        closeList();
        html.push('<ul>');
        inList = "ul";
      }
      html.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList !== "ol") {
        closeList();
        html.push('<ol>');
        inList = "ol";
      }
      html.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // Regular paragraph
    closeList();
    html.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  closeList();
  if (inCodeBlock) html.push("</code></pre>");

  return html.join("\n");
}

function formatDate(iso: string | null): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "N/A";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)} min`;
}

/**
 * Build a self-contained HTML report document and trigger a download.
 */
export function downloadReport(
  execution: Execution,
  steps: ExecutionStep[],
): void {
  const completedSteps = steps.filter((s) => s.status === "completed");
  const finalStep = completedSteps[completedSteps.length - 1];
  const reportBody = finalStep?.output_data ?? "No output was produced.";

  const totalTokens = steps.reduce((s, st) => s + (Number(st.token_count) || 0), 0);
  const totalCost = steps.reduce((s, st) => s + (Number(st.cost_usd) || 0), 0);
  const agentNames = completedSteps.map((s) => s.agent_name ?? s.node_id);

  const reportHtml = markdownToHtml(reportBody);

  const stepsHtml = completedSteps
    .map(
      (s) => `
      <div class="step-card">
        <div class="step-header">
          <span class="step-agent">${s.agent_name ?? s.node_id}</span>
          <span class="step-meta">${Number(s.token_count || 0).toLocaleString()} tokens &middot; ${Number(s.duration_ms || 0) > 1000 ? (Number(s.duration_ms) / 1000).toFixed(1) + "s" : Number(s.duration_ms || 0) + "ms"}</span>
        </div>
        <div class="step-output">${markdownToHtml(s.output_data ?? "")}</div>
      </div>`
    )
    .join("\n");

  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${execution.workflow_name ?? "Execution"} — Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  html { font-size: 16px; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a0e1a;
    color: #e2e8f0;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Cover / header ── */
  .cover {
    background: linear-gradient(135deg, #0f172a 0%, #1a1f3a 50%, #0f172a 100%);
    border-bottom: 1px solid rgba(99, 130, 255, 0.15);
    padding: 3.5rem 2rem 3rem;
    text-align: center;
    position: relative;
    overflow: hidden;
  }

  .cover::before {
    content: '';
    position: absolute;
    top: -60%;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(99, 130, 255, 0.08) 0%, transparent 70%);
    pointer-events: none;
  }

  .cover .brand {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #6382ff;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .cover h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #f1f5f9;
    letter-spacing: -0.02em;
    margin-bottom: 0.75rem;
  }

  .cover .subtitle {
    font-size: 0.95rem;
    color: #94a3b8;
    max-width: 600px;
    margin: 0 auto;
  }

  /* ── Metadata bar ── */
  .meta-bar {
    display: flex;
    justify-content: center;
    gap: 2rem;
    flex-wrap: wrap;
    padding: 1.25rem 2rem;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid rgba(99, 130, 255, 0.08);
  }

  .meta-item {
    text-align: center;
  }

  .meta-label {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #64748b;
    font-weight: 600;
    margin-bottom: 0.2rem;
  }

  .meta-value {
    font-size: 0.85rem;
    color: #cbd5e1;
    font-weight: 500;
  }

  .meta-value.status-completed { color: #60a5fa; }
  .meta-value.status-failed { color: #f87171; }
  .meta-value.status-timed_out { color: #fbbf24; }

  /* ── Main content ── */
  .container {
    max-width: 780px;
    margin: 0 auto;
    padding: 3rem 2rem 5rem;
  }

  /* ── Pipeline tag ── */
  .pipeline-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.85rem;
    border-radius: 100px;
    background: rgba(99, 130, 255, 0.08);
    border: 1px solid rgba(99, 130, 255, 0.15);
    font-size: 0.7rem;
    font-weight: 500;
    color: #818cf8;
    margin-bottom: 2.5rem;
    letter-spacing: 0.02em;
  }

  .pipeline-tag .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #6382ff;
  }

  /* ── Typography ── */
  .report-body h1 {
    font-size: 1.65rem;
    font-weight: 700;
    color: #f1f5f9;
    margin: 2.5rem 0 1rem;
    letter-spacing: -0.02em;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(99, 130, 255, 0.12);
  }

  .report-body h2 {
    font-size: 1.3rem;
    font-weight: 600;
    color: #e2e8f0;
    margin: 2.2rem 0 0.75rem;
    letter-spacing: -0.01em;
  }

  .report-body h3 {
    font-size: 1.05rem;
    font-weight: 600;
    color: #cbd5e1;
    margin: 1.8rem 0 0.6rem;
  }

  .report-body h4, .report-body h5, .report-body h6 {
    font-size: 0.9rem;
    font-weight: 600;
    color: #94a3b8;
    margin: 1.5rem 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .report-body p {
    margin-bottom: 1rem;
    color: #cbd5e1;
    font-size: 0.925rem;
  }

  .report-body strong {
    color: #f1f5f9;
    font-weight: 600;
  }

  .report-body em {
    color: #a5b4fc;
    font-style: italic;
  }

  .report-body ul, .report-body ol {
    margin: 0.75rem 0 1.25rem 1.5rem;
    color: #cbd5e1;
  }

  .report-body li {
    margin-bottom: 0.4rem;
    font-size: 0.925rem;
    line-height: 1.65;
  }

  .report-body li::marker {
    color: #6382ff;
  }

  .report-body hr {
    border: none;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(99, 130, 255, 0.2), transparent);
    margin: 2rem 0;
  }

  .report-body .inline-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.82rem;
    background: rgba(99, 130, 255, 0.1);
    border: 1px solid rgba(99, 130, 255, 0.15);
    padding: 0.15em 0.45em;
    border-radius: 4px;
    color: #a5b4fc;
  }

  .report-body .code-block {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    background: #0d1117;
    border: 1px solid rgba(99, 130, 255, 0.1);
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    overflow-x: auto;
    margin: 1rem 0 1.5rem;
    line-height: 1.6;
    color: #c9d1d9;
  }

  /* ── Appendix: step cards ── */
  .appendix {
    margin-top: 4rem;
    padding-top: 2rem;
    border-top: 1px solid rgba(99, 130, 255, 0.1);
  }

  .appendix h2 {
    font-size: 1.1rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 1.5rem;
  }

  .step-card {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(99, 130, 255, 0.08);
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1rem;
  }

  .step-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid rgba(99, 130, 255, 0.06);
  }

  .step-agent {
    font-weight: 600;
    font-size: 0.85rem;
    color: #a5b4fc;
  }

  .step-meta {
    font-size: 0.7rem;
    color: #64748b;
  }

  .step-output p { font-size: 0.85rem; color: #94a3b8; }
  .step-output h1, .step-output h2, .step-output h3 { font-size: 0.95rem; color: #cbd5e1; margin: 1rem 0 0.5rem; }
  .step-output ul, .step-output ol { margin-left: 1.25rem; }
  .step-output li { font-size: 0.85rem; color: #94a3b8; }
  .step-output .code-block { font-size: 0.75rem; padding: 0.75rem 1rem; }

  /* ── Footer ── */
  .footer {
    text-align: center;
    padding: 3rem 2rem 2rem;
    color: #475569;
    font-size: 0.7rem;
    letter-spacing: 0.03em;
  }

  .footer .logo {
    font-weight: 700;
    font-size: 0.8rem;
    color: #6382ff;
    letter-spacing: 0.1em;
    margin-bottom: 0.3rem;
  }

  /* ── Print styles ── */
  @media print {
    body { background: #fff; color: #1a1a2e; }
    .cover { background: #f8fafc; border-color: #e2e8f0; }
    .cover::before { display: none; }
    .cover h1 { color: #0f172a; }
    .cover .subtitle { color: #475569; }
    .meta-bar { background: #f8fafc; border-color: #e2e8f0; }
    .meta-value { color: #334155; }
    .report-body p, .report-body li { color: #334155; }
    .report-body strong { color: #0f172a; }
    .report-body h1, .report-body h2, .report-body h3 { color: #0f172a; }
    .report-body h1 { border-color: #e2e8f0; }
    .report-body .code-block { background: #f1f5f9; border-color: #e2e8f0; color: #334155; }
    .report-body .inline-code { background: #f1f5f9; border-color: #e2e8f0; color: #4338ca; }
    .step-card { background: #f8fafc; border-color: #e2e8f0; }
    .appendix { border-color: #e2e8f0; }
    .report-body hr { background: #e2e8f0; }
  }

  @media (max-width: 640px) {
    .cover { padding: 2rem 1.5rem; }
    .cover h1 { font-size: 1.5rem; }
    .container { padding: 2rem 1.5rem; }
    .meta-bar { gap: 1rem; padding: 1rem 1.5rem; }
  }
</style>
</head>
<body>

<div class="cover">
  <div class="brand">Yuno AI Agent Platform</div>
  <h1>${execution.workflow_name ?? "Execution Report"}</h1>
  <p class="subtitle">${agentNames.join(" &rarr; ")} pipeline</p>
</div>

<div class="meta-bar">
  <div class="meta-item">
    <div class="meta-label">Status</div>
    <div class="meta-value status-${execution.status}">${execution.status.replace("_", " ")}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Date</div>
    <div class="meta-value">${formatDate(execution.started_at ?? execution.created_at)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Duration</div>
    <div class="meta-value">${formatDuration(execution.started_at, execution.completed_at)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Steps</div>
    <div class="meta-value">${completedSteps.length}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Tokens</div>
    <div class="meta-value">${totalTokens.toLocaleString()}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Cost</div>
    <div class="meta-value">$${totalCost.toFixed(4)}</div>
  </div>
</div>

<div class="container">
  <div class="pipeline-tag"><span class="dot"></span> Final Output &mdash; ${finalStep?.agent_name ?? "Agent"}</div>

  <div class="report-body">
    ${reportHtml}
  </div>

  ${completedSteps.length > 1 ? `
  <div class="appendix">
    <h2>Full Agent Trail</h2>
    ${stepsHtml}
  </div>` : ""}
</div>

<div class="footer">
  <div class="logo">YUNO</div>
  <p>Generated by Yuno AI Agent Platform &middot; ${formatDate(new Date().toISOString())}</p>
</div>

</body>
</html>`;

  const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const slug = (execution.workflow_name ?? "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `${slug}-${dateStr}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
