# ==============================================================================
# DOCKERFILE - RETO BANORTE × TEC (UI GENERATIVA)
# Arquitectura: Next.js + Gemini + MCP (Snowflake) + A2UI
# Base: Debian (bookworm-slim) para VPS Vultr
# ==============================================================================

# --- Etapa 1: Base común con Node 20 LTS en Debian Slim ---
FROM node:20-bookworm-slim AS base
WORKDIR /app

# --- Etapa 2: Instalación de dependencias completas ---
FROM base AS deps
WORKDIR /app

# Copiar manifiestos de paquetes para aprovechar el caché de capas de Docker
COPY package.json package-lock.json ./
COPY packages/mcp-snowflake/package.json ./packages/mcp-snowflake/
COPY packages/web/package.json ./packages/web/

# Instalación limpia y reproducible de todas las dependencias
RUN npm ci

# --- Etapa 3: Compilación del Servidor MCP y la Aplicación Web ---
FROM base AS builder
WORKDIR /app

# Reutilizar node_modules instalados en la etapa previa
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 1. Compilar servidor MCP (TypeScript -> packages/mcp-snowflake/dist)
RUN npm run build:mcp

# 2. Compilar aplicación Next.js para producción
RUN npm run build:web

# 3. Podar dependencias de desarrollo para aligerar la imagen de ejecución
RUN npm prune --omit=dev

# --- Etapa 4: Imagen de ejecución (Runtime) para Producción ---
FROM base AS runner
WORKDIR /app

# Variables de entorno por defecto en el contenedor
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV MCP_SNOWFLAKE_SERVER_PATH=/app/packages/mcp-snowflake/dist/index.js

# Crear usuario y grupo del sistema sin privilegios de root por seguridad
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Asegurar directorio public en caso de que Next.js lo requiera
RUN mkdir -p /app/packages/web/public

# Copiar dependencias de producción ya podadas
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copiar manifiestos necesarios para la resolución de módulos y workspaces de npm
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./package-lock.json

# Copiar artefactos compilados del Servidor MCP (ejecutado vía stdio como proceso hijo)
COPY --from=builder --chown=nextjs:nodejs /app/packages/mcp-snowflake/package.json ./packages/mcp-snowflake/package.json
COPY --from=builder --chown=nextjs:nodejs /app/packages/mcp-snowflake/dist ./packages/mcp-snowflake/dist

# Copiar build de Next.js y configuración web
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/package.json ./packages/web/package.json
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/next.config.js ./packages/web/next.config.js
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next ./packages/web/.next

# Cambiar al usuario no privilegiado
USER nextjs

# Exponer el puerto HTTP de Next.js
EXPOSE 3000

# Healthcheck nativo con Node.js sin requerir curl ni dependencias adicionales
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Comando de inicio de producción
CMD ["npm", "run", "start"]
