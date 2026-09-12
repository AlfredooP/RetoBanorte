#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runQuery, listTables, describeTable } from "./snowflakeClient.js";

const server = new McpServer({
  name: "mcp-snowflake",
  version: "0.1.0",
});

server.tool(
  "list_tables",
  "Lista las tablas disponibles en el schema configurado de Snowflake.",
  {},
  async () => {
    try {
      const tables = await listTables();
      return {
        content: [{ type: "text", text: JSON.stringify(tables) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error consultando Snowflake: ${(err as Error).message}` }],
      };
    }
  }
);

server.tool(
  "describe_table",
  "Regresa las columnas y tipos de una tabla de Snowflake.",
  { table: z.string().describe("Nombre de la tabla a describir") },
  async ({ table }) => {
    try {
      const columns = await describeTable(table);
      return { content: [{ type: "text", text: JSON.stringify(columns) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error describiendo tabla: ${(err as Error).message}` }],
      };
    }
  }
);

server.tool(
  "run_query",
  "Ejecuta una consulta SQL de solo lectura (SELECT) contra Snowflake y regresa las filas.",
  {
    sql: z.string().describe("Sentencia SQL. Debe iniciar con SELECT."),
    limit: z.number().int().positive().max(200).default(50).describe("Máximo de filas a regresar"),
  },
  async ({ sql, limit }) => {
    const normalized = sql.trim().replace(/;+\s*$/, "");
    if (!/^select\b/i.test(normalized)) {
      return {
        isError: true,
        content: [{ type: "text", text: "Solo se permiten sentencias SELECT (solo lectura)." }],
      };
    }
    try {
      const rows = await runQuery(`${normalized} LIMIT ${limit}`);
      return { content: [{ type: "text", text: JSON.stringify(rows) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error ejecutando la consulta: ${(err as Error).message}` }],
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
