import { AgentResponseSchema, type AgentResponse, type AgentRequestBody } from "./uiSpec";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { listMcpTools, callMcpTool } from "./mcpClient";
import { generateTurn, mcpToolsToGeminiDeclarations, type ChatContent } from "./gemini";

const MAX_TOOL_ROUNDS = 4;

function extractJson(text: string): unknown {
  // El modelo a veces envuelve el JSON en ```json ... ``` a pesar de las
  // instrucciones; lo toleramos.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}

function buildInitialContents(body: AgentRequestBody): ChatContent[] {
  const contents: ChatContent[] = [];

  for (const turn of body.history) {
    contents.push({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.content }],
    });
  }

  if (body.clientAction) {
    contents.push({
      role: "user",
      parts: [
        {
          text:
            `El usuario interactuó con la última pantalla generada.\n` +
            `Acción: ${body.clientAction.action}\n` +
            `Datos: ${JSON.stringify(body.clientAction.payload ?? {})}\n` +
            `Genera la siguiente pantalla respondiendo SOLO con el JSON pedido.`,
        },
      ],
    });
  } else {
    contents.push({
      role: "user",
      parts: [
        {
          text:
            `${body.userMessage ?? ""}\n\n` +
            `Genera la pantalla que resuelve esta intención, respondiendo SOLO con el JSON pedido.`,
        },
      ],
    });
  }

  return contents;
}

export async function runAgentTurn(body: AgentRequestBody): Promise<AgentResponse> {
  const mcpTools = await listMcpTools();
  const declarations = mcpToolsToGeminiDeclarations(mcpTools);
  const contents = buildInitialContents(body);

  let lastText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { text, functionCalls } = await generateTurn(SYSTEM_PROMPT, contents, declarations);
    lastText = text;

    if (functionCalls.length === 0) {
      break; // el modelo ya no necesita herramientas, "text" trae (o debería traer) el JSON final
    }

    // Registra las function calls del modelo en el historial...
    contents.push({
      role: "model",
      parts: functionCalls.map((fc) => ({
        functionCall: {
          name: fc.name,
          args: fc.args,
        },
        thoughtSignature: fc.thoughtSignature,
      })),
    });

    // ...ejecútalas contra el servidor MCP real y regresa los resultados.
    const responseParts: ChatContent["parts"] = [];
    for (const fc of functionCalls) {
      let resultText: string;
      try {
        resultText = await callMcpTool(fc.name, fc.args);
      } catch (err) {
        resultText = `Error ejecutando ${fc.name}: ${(err as Error).message}`;
      }
      responseParts.push({
        functionResponse: { name: fc.name, response: { result: resultText } },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return parseWithRepair(lastText, contents, declarations);
}

/**
 * Intenta parsear/validar el JSON final. Si falla, le pide al modelo que se
 * corrija (una vez) antes de rendirse con una pantalla de error genérica.
 */
async function parseWithRepair(
  text: string,
  contents: ChatContent[],
  declarations: ReturnType<typeof mcpToolsToGeminiDeclarations>
): Promise<AgentResponse> {
  const attempt = (raw: string) => {
    const parsed = extractJson(raw);
    return AgentResponseSchema.safeParse(parsed);
  };

  try {
    const result = attempt(text);
    if (result.success) return result.data;
    return await repair(text, result.error.message, contents, declarations);
  } catch (err) {
    return await repair(text, (err as Error).message, contents, declarations);
  }
}

async function repair(
  badText: string,
  errorMessage: string,
  contents: ChatContent[],
  declarations: ReturnType<typeof mcpToolsToGeminiDeclarations>
): Promise<AgentResponse> {
  const repairContents: ChatContent[] = [
    ...contents,
    { role: "model", parts: [{ text: badText }] },
    {
      role: "user",
      parts: [
        {
          text:
            `Tu respuesta anterior no era JSON válido según el esquema pedido ` +
            `(error: ${errorMessage}). Responde de nuevo, ÚNICAMENTE con el JSON ` +
            `{ "message": string, "ui": UINode } sin texto adicional ni backticks.`,
        },
      ],
    },
  ];

  try {
    const { text } = await generateTurn(SYSTEM_PROMPT, repairContents, declarations);
    const parsed = extractJson(text);
    const result = AgentResponseSchema.safeParse(parsed);
    if (result.success) return result.data;
  } catch {
    // cae al fallback de abajo
  }

  return {
    message:
      "Tuve un problema generando la interfaz. Intenta reformular tu solicitud.",
    ui: {
      type: "screen",
      title: "No se pudo generar la pantalla",
      children: [
        {
          type: "text",
          text: "Ocurrió un error interpretando la respuesta del modelo. Intenta de nuevo.",
          variant: "muted",
        },
      ],
    },
  };
}
