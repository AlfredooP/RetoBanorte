import { GoogleGenAI, Type, type FunctionDeclaration, type Schema } from "@google/genai";
import type { McpTool } from "./mcpClient";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

/**
 * Convierte un JSON-Schema "plano" (lo que trae un tool de MCP) al tipo
 * `Schema` que espera el SDK de Gemini para function-calling. Cubre los
 * casos que en la práctica generan los servidores MCP (objetos con
 * propiedades primitivas) — no es un conversor JSON-Schema completo.
 */
function toGeminiSchema(jsonSchema: Record<string, unknown>): Schema {
  const type = (jsonSchema.type as string) || "object";
  const typeMap: Record<string, Type> = {
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    object: Type.OBJECT,
    array: Type.ARRAY,
  };

  const schema: Schema = { type: typeMap[type] ?? Type.OBJECT };
  if (jsonSchema.description) schema.description = jsonSchema.description as string;

  if (type === "object" && jsonSchema.properties) {
    schema.properties = {};
    const props = jsonSchema.properties as Record<string, Record<string, unknown>>;
    for (const [key, value] of Object.entries(props)) {
      schema.properties[key] = toGeminiSchema(value);
    }
    if (Array.isArray(jsonSchema.required)) {
      schema.required = jsonSchema.required as string[];
    }
  }

  if (type === "array" && jsonSchema.items) {
    schema.items = toGeminiSchema(jsonSchema.items as Record<string, unknown>);
  }

  return schema;
}

export function mcpToolsToGeminiDeclarations(tools: McpTool[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    parameters: toGeminiSchema(tool.inputSchema),
  }));
}

export type ChatContent = {
  role: "user" | "model";
  parts: Array<
    | { text: string }
    | {
        functionCall: { name: string; args: Record<string, unknown> };
        thoughtSignature?: string;
      }
    | { functionResponse: { name: string; response: Record<string, unknown> } }
  >;
};

export type FunctionCallRequest = {
  name: string;
  args: Record<string, unknown>;
  thoughtSignature?: string;
};

/**
 * Un turno de generación. Regresa texto y/o llamadas a función; el
 * orquestador decide si ejecuta herramientas MCP y vuelve a llamar, o si ya
 * puede tomar el texto como la respuesta final.
 */
export async function generateTurn(
  systemInstruction: string,
  contents: ChatContent[],
  functionDeclarations: FunctionDeclaration[]
): Promise<{ text: string; functionCalls: FunctionCallRequest[] }> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction,
      tools: functionDeclarations.length ? [{ functionDeclarations }] : undefined,
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const functionCalls: FunctionCallRequest[] = [];
  let text = "";

  for (const part of parts) {
    if ("text" in part && part.text) text += part.text;
    if ("functionCall" in part && part.functionCall?.name) {
      functionCalls.push({
        name: part.functionCall.name,
        args: (part.functionCall.args ?? {}) as Record<string, unknown>,
        thoughtSignature: part.thoughtSignature,
      });
    }
  }

  return { text, functionCalls };
}
