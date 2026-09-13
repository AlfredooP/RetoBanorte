# Banorte · UI Generativa con Agentes, MCP y A2UI

Proyecto desarrollado para el **Reto Banorte × Tec de Monterrey**: interfaces financieras generadas dinámicamente por agentes de IA.

---

## 🏛️ Arquitectura

El sistema implementa un ciclo continuo de UI generativa donde el modelo de IA nunca genera código HTML/React arbitrario, sino un árbol declarativo (inspirado en **A2UI**) que es renderizado de forma segura por el cliente.

```text
Usuario
  │
  ▼
Next.js 15 / React UI
  │
  ▼
Gemini LLM (Google GenAI)
  │
  ▼
Servidor MCP Snowflake (vía stdio child process)
  │
  ▼
Snowflake Data Cloud
  │
  ▼
Datos financieros / Herramientas
  │
  ▼
Gemini LLM
  │
  ▼
UI Declarativa (A2UI JSON)
  │
  ▼
Usuario interactúa con la pantalla (Botón o Formulario)
  │
  └─────► Regresa la interacción al agente (Cierra el ciclo)
```

### Componentes Clave:
- **`packages/mcp-snowflake`**: Servidor MCP estándar (`@modelcontextprotocol/sdk`) que expone herramientas para consultar Snowflake (`list_tables`, `describe_table`, `run_query`).
- **`packages/web`**: Aplicación web Next.js 15 con App Router que actúa como orquestador del agente, aloja el cliente MCP (vía stdio), gestiona el prompt de sistema y renderiza los componentes interactivos (`StatGrid`, `DataTable`, `BarChart`, `UiForm`, `ActionButton`).

---

## 🚀 Inicio Rápido (Desarrollo Local)

### 1. Requisitos
- Node.js 20+ o 22+
- npm 10+

### 2. Instalación
```bash
npm install
```

### 3. Configurar Entorno
Copia el archivo de variables de entorno y define tu clave de Gemini y credenciales de Snowflake:
```bash
cp .env.example .env
```

### 4. Compilar MCP y ejecutar en desarrollo
```bash
# Compilar el servidor MCP y arrancar Next.js en modo desarrollo:
npm run dev
```
Abre en tu navegador: [http://localhost:3000](http://localhost:3000)

---

## 🐳 Despliegue con Docker y Producción

El proyecto está completamente preparado para ejecutarse en contenedores Docker mediante un Dockerfile multi-stage basado en Debian.

### Iniciar con Docker Compose:
```bash
# 1. Crear .env a partir del ejemplo
cp .env.example .env

# 2. Construir la imagen de producción
docker compose build

# 3. Iniciar el servicio en segundo plano
docker compose up -d

# 4. Verificar salud del contenedor
## 📋 Variables de Entorno

| Variable | Descripción | Requerida |
|---|---|:---:|
| `GEMINI_API_KEY` | Clave de API de Google Gemini | Sí |
| `GEMINI_MODEL` | Modelo de Gemini (default: `gemini-3.6-flash`) | No |
| `SNOWFLAKE_ACCOUNT` | Identificador de cuenta de Snowflake | Sí* |
| `SNOWFLAKE_USERNAME` | Usuario de Snowflake | Sí* |
| `SNOWFLAKE_PASSWORD` | Contraseña de Snowflake | Sí* |
| `SNOWFLAKE_WAREHOUSE` | Warehouse de Snowflake (ej. `COMPUTE_WH`) | Sí* |
| `SNOWFLAKE_DATABASE` | Base de datos de Snowflake | Sí* |
| `SNOWFLAKE_SCHEMA` | Schema de Snowflake (ej. `PUBLIC`) | Sí* |
| `SNOWFLAKE_ROLE` | Rol del usuario de Snowflake | No |
| `MCP_SNOWFLAKE_SERVER_PATH` | Ruta al script del servidor MCP en Docker | Sí (en Docker) |
| `PORT` | Puerto de escucha (default: `3000`) | No |

*\*Si Snowflake no está configurado, el agente informará el estado y construirá pantallas financieras (como simuladores) que no dependan de datos externos.*

---

## 🛠️ Scripts Disponibles

- `npm run build`: Compila tanto el servidor MCP como la aplicación Next.js.
- `npm run build:mcp`: Compila únicamente el servidor MCP TypeScript.
- `npm run build:web`: Compila únicamente la aplicación Next.js.
- `npm run dev`: Compila MCP y arranca Next.js en modo desarrollo con recarga en caliente.
- `npm run start`: Inicia el servidor de producción Next.js.
- `docker compose up -d`: Levanta la aplicación completa en Docker en producción.
