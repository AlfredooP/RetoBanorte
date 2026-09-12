import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Banorte · UI Generativa",
  description: "Agente + MCP + A2UI — la interfaz que se rediseña a sí misma",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
