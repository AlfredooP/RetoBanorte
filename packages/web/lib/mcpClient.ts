import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import fs from "node:fs";

/**
 * El agente habla MCP de verdad: spawnea el servidor mcp-snowflake como
 * proceso hijo (stdio) y reutiliza esa conexión entre requests del API route
 * (Next.js mantiene vivo el módulo del server mientras el proceso vive).
 */

let clientPromise: Promise<Client> | null = null;

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

function serverEntryPath(): string {
  const configured = process.env.MCP_SNOWFLAKE_SERVER_PATH;
  if (configured) return configured;
  // Si se ejecuta desde la raíz del monorepo (ej. /app en Docker o npm start en raíz)
  const fromRoot = path.resolve(process.cwd(), "packages/mcp-snowflake/dist/index.js");
  if (fs.existsSync(fromRoot)) return fromRoot;
  // Default: monorepo layout desde packages/web -> ../mcp-snowflake/dist/index.js
  const fromWeb = path.resolve(process.cwd(), "../mcp-snowflake/dist/index.js");
  if (fs.existsSync(fromWeb)) return fromWeb;
  return fromRoot;
}

async function createClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverEntryPath()],
    env: process.env as Record<string, string>,
  });

  const client = new Client({ name: "banorte-agent", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

export function getMcpClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = createClient().catch((err) => {
      clientPromise = null; // permite reintentar en la siguiente request
      throw err;
    });
  }
  return clientPromise;
}

export async function listMcpTools(): Promise<McpTool[]> {
  try {
    const client = await getMcpClient();
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
    }));
  } catch (err) {
    console.error("No se pudo conectar al servidor MCP:", (err as Error).message);
    return [];
  }
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const client = await getMcpClient();
  const result = await client.callTool({ name, arguments: args });
  const content = (result.content ?? []) as { type: string; text?: string }[];
  const text = content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
  return text || JSON.stringify(result);
}
