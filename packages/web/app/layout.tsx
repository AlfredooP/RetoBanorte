import type { Metadata } from "next";
import { Michroma } from "next/font/google";
import "./globals.css";

const michroma = Michroma({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-michroma",
});

export const metadata: Metadata = {
  title: "Banorte · UI Generativa",
  description: "Agente + MCP + A2UI — la interfaz que se rediseña a sí misma",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={michroma.variable}>{children}</body>
    </html>
  );
}
