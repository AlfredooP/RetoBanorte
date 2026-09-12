"use client";

import { useState } from "react";
import type { AgentResponse, HistoryTurn } from "@/lib/uiSpec";
import { Renderer } from "./generative-ui/Renderer";

const SESSION_ID = "demo-session";

export function ChatPanel() {
  const [history, setHistory] = useState<HistoryTurn[]>([]);
  const [current, setCurrent] = useState<AgentResponse | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function callAgent(payload: {
    userMessage?: string;
    clientAction?: { action: string; payload?: Record<string, unknown> };
  }) {
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION_ID, history, ...payload }),
      });
      const data: AgentResponse & { error?: string } = await res.json();
      if (data.error) throw new Error(data.error);

      setHistory((prev) => [
        ...prev,
        {
          role: "user",
          content: payload.userMessage ?? `[acción: ${payload.clientAction?.action}]`,
        },
        { role: "agent", content: data.message },
      ]);
      setCurrent(data);
    } catch (err) {
      setHistory((prev) => [
        ...prev,
        { role: "agent", content: `Error: ${(err as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    if (!input.trim()) return;
    callAgent({ userMessage: input.trim() });
    setInput("");
  }

  // Aquí se cierra el ciclo: lo que la persona toca en la pantalla generada
  // regresa al agente como una nueva intención (contexto).
  function handleUiAction(action: string, actionPayload?: Record<string, unknown>) {
    callAgent({ clientAction: { action, payload: actionPayload } });
  }

  return (
    <div className="app-shell">
      <div className="chat-col">
        <div>
          <strong>Banorte · Agente</strong>
          <div className="text-muted">Interpreta la intención, el resto lo arma el agente →</div>
        </div>
        <div className="chat-log">
          {history.map((turn, i) => (
            <div key={i} className={`chat-bubble ${turn.role}`}>
              {turn.content}
            </div>
          ))}
          {loading && <div className="loading-hint">Generando interfaz…</div>}
        </div>
        <div className="chat-input-row">
          <input
            value={input}
            placeholder="Ej. muéstrame mis últimas transacciones"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button onClick={handleSend} disabled={loading}>
            Enviar
          </button>
        </div>
      </div>

      <div className="stage-col">
        {current ? (
          <Renderer node={current.ui} onAction={handleUiAction} />
        ) : (
          <div className="text-muted">
            Escribe una intención (por ejemplo, &quot;quiero simular un
            crédito&quot;) para que el agente genere la primera pantalla.
          </div>
        )}
      </div>
    </div>
  );
}
