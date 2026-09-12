"use client";

import type { UINodeT } from "@/lib/uiSpec";
import { StatGrid, DataTable, BarChart, ActionButton, UiForm } from "./widgets";

type OnAction = (action: string, payload?: Record<string, unknown>) => void;

/**
 * Este componente es el corazón de "A2UI" en este proyecto: el agente nunca
 * manda código de UI, solo el árbol `UINodeT`. Este renderer decide cómo se
 * ve cada `type`. Si mañana quieres cambiar a Tailwind/shadcn o al paquete
 * oficial de A2UI, solo tocas este archivo — el agente no cambia.
 */
export function Renderer({ node, onAction }: { node: UINodeT; onAction: OnAction }) {
  switch (node.type) {
    case "screen":
      return (
        <div className="ui-screen">
          {node.title && <h1>{node.title}</h1>}
          {node.children.map((child, i) => (
            <Renderer key={i} node={child} onAction={onAction} />
          ))}
        </div>
      );

    case "section":
      return (
        <div className="ui-section">
          {node.title && <h2>{node.title}</h2>}
          {node.children.map((child, i) => (
            <Renderer key={i} node={child} onAction={onAction} />
          ))}
        </div>
      );

    case "text":
      return (
        <p className={node.variant === "heading" ? "text-heading" : node.variant === "muted" ? "text-muted" : undefined}>
          {node.text}
        </p>
      );

    case "stat_grid":
      return <StatGrid {...node} />;

    case "data_table":
      return <DataTable {...node} />;

    case "bar_chart":
      return <BarChart {...node} />;

    case "form":
      return <UiForm node={node} onAction={onAction} />;

    case "button":
      return <ActionButton node={node} onAction={onAction} />;

    default:
      return null;
  }
}
