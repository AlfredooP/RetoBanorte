"use client";

import { useState } from "react";
import type { UINodeT } from "@/lib/uiSpec";

export function StatGrid({ items }: Extract<UINodeT, { type: "stat_grid" }>) {
  return (
    <div className="stat-grid">
      {items.map((item, i) => (
        <div className="stat-card" key={i}>
          <div className="label">{item.label}</div>
          <div className="value">{item.value}</div>
          {item.trend && <div className="trend">{item.trend}</div>}
        </div>
      ))}
    </div>
  );
}

export function DataTable({ columns, rows }: Extract<UINodeT, { type: "data_table" }>) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{String(cell)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BarChart({ labels, values, unit }: Extract<UINodeT, { type: "bar_chart" }>) {
  const max = Math.max(...values, 1);
  return (
    <div className="bar-chart">
      {labels.map((label, i) => (
        <div className="bar-wrap" key={label}>
          <div
            className="bar"
            style={{ height: `${(values[i] / max) * 100}%` }}
            title={`${values[i]}${unit ?? ""}`}
          />
          <div className="bar-label">{label}</div>
        </div>
      ))}
    </div>
  );
}

export function ActionButton({
  node,
  onAction,
}: {
  node: Extract<UINodeT, { type: "button" }>;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
}) {
  return (
    <button
      className={`btn ${node.style === "secondary" ? "secondary" : ""}`}
      onClick={() => onAction(node.action, node.payload)}
    >
      {node.label}
    </button>
  );
}

export function UiForm({
  node,
  onAction,
}: {
  node: Extract<UINodeT, { type: "form" }>;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
}) {
  const [values, setValues] = useState<Record<string, string | number>>(() => {
    const initial: Record<string, string | number> = {};
    for (const field of node.fields) {
      if (field.defaultValue !== undefined) initial[field.name] = field.defaultValue;
    }
    return initial;
  });

  const setField = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <form
      className="ui-form"
      onSubmit={(e) => {
        e.preventDefault();
        onAction(node.submitAction, values);
      }}
    >
      {node.fields.map((field) => (
        <label key={field.name}>
          {field.label}
          {field.kind === "select" ? (
            <select
              value={values[field.name] ?? ""}
              onChange={(e) => setField(field.name, e.target.value)}
            >
              <option value="" disabled>
                Selecciona...
              </option>
              {(field.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.kind === "number" ? "number" : "text"}
              value={values[field.name] ?? ""}
              onChange={(e) => setField(field.name, e.target.value)}
            />
          )}
        </label>
      ))}
      <button className="btn" type="submit">
        {node.submitLabel}
      </button>
    </form>
  );
}
