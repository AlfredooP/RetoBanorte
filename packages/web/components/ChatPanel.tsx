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
      <header className="app-header">
        {/* <div className="brand-mark">B</div> */}
        <div>
          <strong>MILO</strong>
          {/* <span>Agente de servicios financieros</span> */}
        </div>
        {/* <div className="header-status"><span /> Sesión activa</div> */}
      </header>

      <main className="workspace">
        <section className="conversation-pane" aria-label="Conversación con el asistente">
          <div className="conversation-flow">
            {history.length === 0 && (
              <div className="chat-empty">
                <div className="chat-empty-icon">✦</div>
                <strong>¿Qué necesitas resolver hoy?</strong>
                <span>Escribe una solicitud para generar una experiencia a tu medida.</span>
              </div>
            )}
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
              placeholder="Escribe tu solicitud..."
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button onClick={handleSend} disabled={loading} aria-label="Enviar solicitud">
              ↑
            </button>
          </div>
        </section>

        <section className="experience-pane" aria-label="Interfaz generada">
          <div className="stage-inner">
            {current ? (
              <Renderer node={current.ui} onAction={handleUiAction} />
            ) : (
              <div className="stage-empty">
                <span className="stage-kicker">Tu espacio de trabajo</span>
                <h1>Diseñemos tu siguiente paso financiero.</h1>
                <p>Escribe una intención en el asistente y aquí aparecerá una experiencia hecha para resolverla.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
