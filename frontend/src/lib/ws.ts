export type MonitorEventType =
  | "execution.started"
  | "execution.completed"
  | "step.started"
  | "step.completed"
  | "step.delta"
  | "agent.message"
  | "agent.status"
  | "channel.message";

export interface MonitorEvent {
  type: MonitorEventType;
  execution_id?: string;
  workflow_id?: string;
  node_id?: string;
  agent_id?: string;
  agent_name?: string;
  status?: string;
  duration_ms?: number;
  token_count?: number;
  cost_usd?: number;
  delta?: string;
  from_agent?: string;
  to_agent?: string;
  content?: string;
  message_type?: string;
  channel?: string;
  from?: string;
  timestamp?: string;
}

type EventHandler = (event: MonitorEvent) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private _isConnected = false;

  constructor() {
    const wsBase = (import.meta.env.VITE_WS_URL || "ws://localhost:8000").replace(/\/$/, "");
    this.url = `${wsBase}/ws/monitor`;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyHandlers({ type: "execution.started", content: "WebSocket connected" } as MonitorEvent);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as MonitorEvent;
          data.timestamp = data.timestamp ?? new Date().toISOString();
          this.notifyHandlers(data);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this._isConnected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this._isConnected = false;
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private notifyHandlers(event: MonitorEvent): void {
    this.handlers.forEach((h) => h(event));
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

export const wsClient = new WebSocketClient();
