import { z } from "zod";

/**
 * Esquema propio de "UI declarativa" (A2UI-inspirado):
 * el agente nunca manda HTML/JSX, solo describe QUÉ mostrar. El cliente
 * (Renderer.tsx) es el único dueño de cómo se ve y cómo se renderiza.
 *
 * Catálogo de componentes disponible para el agente. Mantenerlo pequeño
 * a propósito: entre más chico el catálogo, más confiable es que el LLM
 * genere JSON válido.
 */

const StatItem = z.object({
  label: z.string(),
  value: z.string(),
  trend: z.string().optional(),
});

const FormField = z.object({
  name: z.string(),
  label: z.string(),
  kind: z.enum(["text", "number", "select"]),
  options: z.array(z.string()).optional(),
  defaultValue: z.union([z.string(), z.number()]).optional(),
});

// z.lazy porque UINode es recursivo (screen/section contienen children)
export const UINode: z.ZodType<UINodeT> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("screen"),
      title: z.string().optional(),
      children: z.array(UINode),
    }),
    z.object({
      type: z.literal("section"),
      title: z.string().optional(),
      children: z.array(UINode),
    }),
    z.object({
      type: z.literal("text"),
      text: z.string(),
      variant: z.enum(["heading", "body", "muted"]).default("body"),
    }),
    z.object({
      type: z.literal("stat_grid"),
      items: z.array(StatItem),
    }),
    z.object({
      type: z.literal("data_table"),
      columns: z.array(z.string()),
      rows: z.array(z.array(z.union([z.string(), z.number()]))),
    }),
    z.object({
      type: z.literal("bar_chart"),
      labels: z.array(z.string()),
      values: z.array(z.number()),
      unit: z.string().optional(),
    }),
    z.object({
      type: z.literal("form"),
      formId: z.string(),
      fields: z.array(FormField),
      submitLabel: z.string(),
      submitAction: z.string(),
    }),
    z.object({
      type: z.literal("button"),
      label: z.string(),
      action: z.string(),
      payload: z.record(z.any()).optional(),
      style: z.enum(["primary", "secondary"]).default("primary"),
    }),
  ])
);

export type UINodeT =
  | { type: "screen"; title?: string; children: UINodeT[] }
  | { type: "section"; title?: string; children: UINodeT[] }
  | { type: "text"; text: string; variant?: "heading" | "body" | "muted" }
  | { type: "stat_grid"; items: { label: string; value: string; trend?: string }[] }
  | { type: "data_table"; columns: string[]; rows: (string | number)[][] }
  | { type: "bar_chart"; labels: string[]; values: number[]; unit?: string }
  | {
      type: "form";
      formId: string;
      fields: {
        name: string;
        label: string;
        kind: "text" | "number" | "select";
        options?: string[];
        defaultValue?: string | number;
      }[];
      submitLabel: string;
      submitAction: string;
    }
  | {
      type: "button";
      label: string;
      action: string;
      payload?: Record<string, unknown>;
      style?: "primary" | "secondary";
    };

export const AgentResponseSchema = z.object({
  message: z.string().describe("Mensaje corto en lenguaje natural para la persona."),
  ui: UINode,
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export type ClientAction = {
  action: string;
  payload?: Record<string, unknown>;
};

export type HistoryTurn = { role: "user" | "agent"; content: string };

export type AgentRequestBody = {
  sessionId: string;
  userMessage?: string;
  clientAction?: ClientAction;
  history: HistoryTurn[];
};

/** Descripción del catálogo en texto plano, para inyectar en el prompt del LLM. */
export const UI_CATALOG_DESCRIPTION = `
Catálogo de componentes disponibles (usa SOLO estos "type"):
- screen { title?, children[] }               → contenedor raíz de la pantalla
- section { title?, children[] }               → agrupa contenido con un subtítulo
- text { text, variant: heading|body|muted }   → texto
- stat_grid { items: [{label, value, trend?}] } → tarjetas de métricas/resumen
- data_table { columns[], rows[][] }           → tabla de datos
- bar_chart { labels[], values[], unit? }      → gráfica de barras simple
- form { formId, fields:[{name,label,kind:text|number|select,options?,defaultValue?}], submitLabel, submitAction }
- button { label, action, payload?, style: primary|secondary }

Reglas:
1. SIEMPRE regresa un JSON con la forma { "message": string, "ui": UINode } donde
   "ui".type === "screen".
2. NUNCA generes HTML, Markdown con estilos, ni código: solo el JSON del árbol.
3. "action" en botones/formularios debe ser un identificador corto en snake_case
   (ej. "ver_transacciones", "simular_credito") que tú mismo interpretarás la
   próxima vez que te llegue como intención del usuario.
4. Si necesitas datos reales (saldos, movimientos, tablas), usa las herramientas
   MCP disponibles antes de responder — no inventes cifras si hay una
   herramienta que las puede traer.
`;
