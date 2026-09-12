import { NextRequest, NextResponse } from "next/server";
import { runAgentTurn } from "@/lib/orchestrator";
import type { AgentRequestBody } from "@/lib/uiSpec";

// Necesita Node runtime: spawnea un proceso hijo (servidor MCP) y usa el
// SDK nativo de Snowflake — no corre en el edge runtime.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: AgentRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.userMessage && !body.clientAction) {
    return NextResponse.json(
      { error: "Se requiere userMessage o clientAction" },
      { status: 400 }
    );
  }

  try {
    const agentResponse = await runAgentTurn(body);
    return NextResponse.json(agentResponse);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: `Error del agente: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
