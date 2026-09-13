"use client";

import { useEffect, useState } from "react";
import type { AgentResponse, HistoryTurn } from "@/lib/uiSpec";
import { Renderer } from "./generative-ui/Renderer";

const CHAT_SESSIONS_KEY = "banorte-chat-sessions";
const MAX_HISTORY_ITEMS = 8;

type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  messages: HistoryTurn[];
  current: AgentResponse | null;
};

function buildSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSession(title = "Nueva conversación"): ChatSession {
  return {
    id: buildSessionId(),
    title,
    createdAt: new Date().toISOString(),
    messages: [],
    current: null,
  };
}

function normalizeTitle(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 36) || "Nueva conversación";
}

export function ChatPanel() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const history = activeSession?.messages ?? [];
  const current = activeSession?.current ?? null;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CHAT_SESSIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatSession[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed.slice(0, MAX_HISTORY_ITEMS));
          setActiveSessionId(parsed[0].id);
          return;
        }
      }

      const initialSession = createSession();
      setSessions([initialSession]);
      setActiveSessionId(initialSession.id);
    } catch {
      const initialSession = createSession();
      setSessions([initialSession]);
      setActiveSessionId(initialSession.id);
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
    }
  }, [sessions]);

  function openNewSession() {
    const newSession = createSession();
    setSessions((prev) => [newSession, ...prev].slice(0, MAX_HISTORY_ITEMS));
    setActiveSessionId(newSession.id);
    setInput("");
  }

  async function callAgent(
    payload: {
      userMessage?: string;
      clientAction?: { action: string; payload?: Record<string, unknown> };
    },
    scopeSessionId: string | null = activeSessionId,
    attempt = 0
  ) {
    if (!scopeSessionId) {
      const fallbackSession = createSession();
      setSessions((prev) => [fallbackSession, ...prev].slice(0, MAX_HISTORY_ITEMS));
      setActiveSessionId(fallbackSession.id);
      scopeSessionId = fallbackSession.id;
    }

    const sessionMessages =
      sessions.find((session) => session.id === scopeSessionId)?.messages ?? [];

    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: scopeSessionId, history: sessionMessages, ...payload }),
      });

      const data: AgentResponse & {
        error?: string | { code?: number; message?: string; status?: string };
      } = await res.json().catch(() => ({}));

      const normalizedError =
        typeof data.error === "string" ? { message: data.error } : (data.error ?? {});
      const errorMessage = normalizedError.message ?? "Error del agente";

      const shouldRetry =
        res.status === 503 ||
        normalizedError.code === 503 ||
        /UNAVAILABLE|high demand|temporarily|503/i.test(errorMessage);

      if (shouldRetry && attempt < 4) {
        const delayMs = 900 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return callAgent(payload, scopeSessionId, attempt + 1);
      }

      if (!res.ok || data.error) {
        if (attempt >= 4) {
          return;
        }
        throw new Error(errorMessage);
      }

      const userMessage = payload.userMessage ?? `[acción: ${payload.clientAction?.action}]`;
      const nextMessages: HistoryTurn[] = [
        ...sessionMessages,
        { role: "user", content: userMessage },
        { role: "agent", content: data.message },
      ];

      const sessionTitle =
        sessions.find((session) => session.id === scopeSessionId)?.title === "Nueva conversación"
          ? normalizeTitle(userMessage)
          : sessions.find((session) => session.id === scopeSessionId)?.title ?? "Nueva conversación";

      setSessions((prev) =>
        prev.map((session) =>
          session.id === scopeSessionId
            ? { ...session, title: sessionTitle, messages: nextMessages, current: data }
            : session
        )
      );
    } catch {
      // No mostramos errores de disponibilidad en el front; mantenemos el estado de carga y reintentamos.
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const nextPrompt = input.trim();
    if (!nextPrompt) return;

    if (!activeSessionId) {
      const newSession = createSession();
      setSessions((prev) => [newSession, ...prev].slice(0, MAX_HISTORY_ITEMS));
      setActiveSessionId(newSession.id);
      callAgent({ userMessage: nextPrompt }, newSession.id);
    } else {
      callAgent({ userMessage: nextPrompt }, activeSessionId);
    }

    setInput("");
  }

  function handleUiAction(action: string, actionPayload?: Record<string, unknown>) {
    if (!activeSessionId) {
      const newSession = createSession();
      setSessions((prev) => [newSession, ...prev].slice(0, MAX_HISTORY_ITEMS));
      setActiveSessionId(newSession.id);
    }

    callAgent({ clientAction: { action, payload: actionPayload } }, activeSessionId);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand">
          <strong>MILO</strong>
        </div>

        <div className="app-header-history" aria-label="Historial de conversaciones recientes">
          <button type="button" className="history-new" onClick={openNewSession}>
            + Nuevo
          </button>

          <div className="history-scroll">
            {sessions.length === 0 ? (
              <span className="history-empty">Sin conversaciones aún</span>
            ) : (
              sessions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`history-item ${item.id === activeSessionId ? "active" : ""}`}
                  title={item.title}
                  onClick={() => setActiveSessionId(item.id)}
                >
                  {item.title}
                </button>
              ))
            )}
          </div>
        </div>
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
              <div
                key={`${turn.role}-${i}-${turn.content.slice(0, 12)}`}
                className={`chat-bubble ${turn.role}`}
              >
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
            {loading ? (
              <div className="loading-screen" role="status" aria-live="polite">
                <div className="loading-orbit" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="stage-kicker">MILO está trabajando</span>
                <h1>Estamos preparando tu experiencia.</h1>
                <p>Estamos consultando la información necesaria y diseñando el siguiente paso para ti.</p>
                <div className="loading-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : current ? (
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
