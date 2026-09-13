# Guía de Despliegue en Producción: VPS Vultr con Debian y Docker

Este documento detalla el procedimiento paso a paso para desplegar la aplicación **Banorte UI Generativa (Agente Gemini + MCP Snowflake + A2UI)** en un servidor VPS de Vultr con **Debian** utilizando **Docker** y **Docker Compose**.

---

## 1. Arquitectura de Producción

El diseño mantiene al host Debian únicamente como ejecutor de contenedores Docker, sin necesidad de instalar Node.js, npm ni el SDK de Snowflake en el sistema operativo host.

```text
Usuario / Navegador
        │
        ▼
   Vultr VPS (Firewall / Red)
        │
        ▼
   Debian 13 (Host mínimo: Docker Engine + Docker Compose Plugin)
        │
        ▼
   Contenedor Docker (`banorte-generative-ui`)
   ┌────────────────────────────────────────────────────────────┐
   │                                                            │
   │  Next.js 15 (Servidor Web & API Routes en puerto 3000)     │
   │        │                                                   │
   │        ▼                                                   │
   │  Gemini LLM (Google GenAI SDK - Razonamiento & Catálogo)   │
   │        │                                                   │
   │        ▼ (Llamadas a herramientas vía stdio child process)  │
   │  Servidor MCP Snowflake (`node dist/index.js`)             │
   │        │                                                   │
   │        ▼ (Consultas SQL autenticadas / Snowflake SDK)      │
   │  Snowflake Data Cloud                                      │
   │        │                                                   │
   │        ▼ (Datos reales de tablas/transacciones)            │
   │  Servidor MCP regresa resultados al agente                 │
   │        │                                                   │
   │        ▼                                                   │
   │  Gemini genera especificación declarativa (A2UI JSON)      │
   │        │                                                   │
   │        ▼                                                   │
   │  Renderer en React pinta la pantalla interactiva           │
   │                                                            │
   └────────────────────────────────────────────────────────────┘
        │
        ▼
Interacción del Usuario (Botón / Formulario)
        │
        └───────► Regresa a Next.js /api/agent (Nuevo ciclo)
```

---

## 2. Requisitos Previos

- Cuenta activa en [Vultr](https://www.vultr.com/).
- Cliente SSH en tu máquina local (`ssh` en Linux/macOS o PowerShell/Git Bash en Windows).
- Clave de API de Google Gemini (`GEMINI_API_KEY`).
- Credenciales de acceso a Snowflake (Account, Username, Password, Warehouse, Database, Schema).

---

## 3. Aprovisionamiento del Servidor en Vultr

1. Inicia sesión en el panel de control de Vultr.
2. Haz clic en **Deploy New Instance** (+).
3. Selecciona el tipo de servidor: **Cloud Compute** (Shared CPU).
4. Elige una ubicación cercana a tus usuarios (ej. Dallas, Atlanta, Silicon Valley o Ciudad de México si está disponible).
5. En **Operating System**, selecciona:
   - **Debian 13** (o **Debian 12 x64 (Bookworm)** si Debian 13 aún está en preview).
6. Plan del Servidor:
   - Recomendado: **Regular Performance** con al menos 2 GB de RAM (ej. $10 - $12/mes) para permitir la compilación rápida de Next.js y el servidor MCP.
7. Añade o selecciona tu clave pública SSH para autenticación segura.
8. Asigna un nombre de host (ej. `banorte-agent-prod`) y haz clic en **Deploy Now**.
9. Espera unos momentos hasta que el estado cambie a **Running** y copia la dirección IP pública del VPS.

---

## 4. Conexión SSH al Servidor

Abre una terminal en tu computadora y conéctate como usuario `root` usando la IP de tu VPS:

```bash
ssh root@<IP_DE_TU_VPS>
```

---

## 5. Instalación de Docker y Docker Compose en Debian

El host Debian solo necesita Docker Engine, Docker Compose Plugin y Git. No instales Node.js ni herramientas de compilación en el host.

Ejecuta los siguientes comandos en la terminal de tu VPS:

```bash
# 1. Actualizar repositorios e índices de Debian
apt-get update && apt-get upgrade -y

# 2. Instalar paquetes de soporte para HTTPS y repositorios
apt-get install -y ca-certificates curl gnupg git ufw

# 3. Añadir la clave GPG oficial de Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# 4. Configurar el repositorio oficial de Docker para Debian
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# 5. Instalar Docker Engine, CLI y el plugin de Docker Compose
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 6. Habilitar e iniciar el servicio de Docker
systemctl enable docker
systemctl start docker

# 7. Verificar la instalación
docker --version
docker compose version
```

---

## 6. Configuración del Firewall (Opcional pero Recomendado)

Para proteger el VPS y permitir el acceso web y SSH:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 3000/tcp   # Aplicación Web Banorte
ufw enable
```

---

## 7. Clonación del Repositorio y Configuración

1. Clona el repositorio en el servidor:

```bash
cd /opt
git clone <URL_DE_TU_REPOSITORIO> retobanorte
cd /opt/retobanorte
```

*(Si subes el código comprimido o mediante scp, simplemente descomprime en `/opt/retobanorte`).*

2. Crea el archivo de variables de entorno de producción `.env`:

```bash
cp .env.example .env
nano .env
```

3. Completa los valores con tus credenciales reales:

```env
# --- Gemini (LLM) ---
GEMINI_API_KEY=AIzaSy...tu_clave_real_de_gemini...
GEMINI_MODEL=gemini-3.6-flash

# --- Snowflake (Datos vía MCP) ---
SNOWFLAKE_ACCOUNT=tu_identificador_de_cuenta
SNOWFLAKE_USERNAME=tu_usuario
SNOWFLAKE_PASSWORD=tu_password
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_DATABASE=BANORTE_DB
SNOWFLAKE_SCHEMA=PUBLIC
SNOWFLAKE_ROLE=ACCOUNTADMIN

# --- MCP server en Docker ---
MCP_SNOWFLAKE_SERVER_PATH=/app/packages/mcp-snowflake/dist/index.js

# --- Servidor Web ---
PORT=3000
NODE_ENV=production
```

Guarda los cambios con `Ctrl + O`, presiona `Enter` y sal con `Ctrl + X`.

> [!SECURITY]
> El archivo `.env` nunca debe subirse al repositorio Git. Está explícitamente ignorado en `.gitignore` y `.dockerignore`.

---

## 8. Construcción y Despliegue con Docker

### Paso 1: Construir la imagen de producción
El Dockerfile multi-stage instalará las dependencias en un entorno aislado, compilará el servidor MCP con TypeScript y empaquetará Next.js para producción:

```bash
docker compose build
```

### Paso 2: Iniciar el contenedor en segundo plano

```bash
docker compose up -d
```

### Paso 3: Verificar el estado del contenedor

```bash
docker compose ps
```

Deberás observar el contenedor `banorte-generative-ui` con el estado `Up (healthy)`.

---

## 9. Verificación de Funcionamiento

### 1. Probar el endpoint de Healthcheck
Comprueba que el servidor responde de manera local dentro del VPS:

```bash
curl -i http://localhost:3000/api/health
```

Respuesta esperada (HTTP 200):
```json
{"status":"ok","uptime":...,"timestamp":"..."}
```

### 2. Probar acceso desde el Navegador
Abre tu navegador web y visita:

```text
http://<IP_DE_TU_VPS>:3000
```

Verás cargada la interfaz bancaria con el panel lateral de interacción y el lienzo generativo.

### 3. Probar el flujo completo
- Envía un mensaje como:
  > *"Quiero simular un crédito de $50,000 a 12 meses"*
- El agente interpretará la intención, generará dinámicamente un formulario interactivo o tarjeta con opciones.
- Interactúa con el botón o formulario generado. La acción del usuario será enviada de vuelta a `/api/agent`, cerrando el ciclo con una nueva pantalla de resultado.
- Si Snowflake está configurado, solicita:
  > *"Muéstrame las transacciones recientes"*
  El agente invocará la herramienta `run_query` o `list_tables` mediante el servidor MCP ejecutado por stdio y presentará la tabla de datos generada.

---

## 10. Monitoreo y Comandos Útiles

| Acción | Comando |
|---|---|
| **Ver logs en tiempo real** | `docker compose logs -f` |
| **Ver logs de la app web** | `docker compose logs -f web` |
| **Ver estado de salud** | `docker compose ps` |
| **Reiniciar el servicio** | `docker compose restart` |
| **Detener el servicio** | `docker compose down` |
| **Reconstruir tras cambios** | `docker compose build && docker compose up -d` |
| **Ejecutar comando dentro** | `docker compose exec web node -v` |
| **Monitorear uso de CPU/RAM** | `docker stats` |

---

## 11. Procedimiento de Actualización

Cuando publiques cambios en el repositorio o realices mejoras durante el hackathon:

```bash
cd /opt/retobanorte

# 1. Descargar últimos cambios
git pull origin main

# 2. Reconstruir la imagen de Docker
docker compose build

# 3. Levantar los nuevos contenedores sin tiempo de inactividad prolongado
docker compose up -d

# 4. Verificar salud
docker compose ps
docker compose logs --tail=50
```

---

## 12. Solución de Problemas (Troubleshooting)

### 1. El contenedor muestra estado `unhealthy`
- Revisa los logs con `docker compose logs web`.
- Comprueba si el puerto 3000 está ocupado por otro proceso (`netstat -tlpn | grep 3000` o `ss -tlpn | grep 3000`).
- Prueba manualmente el healthcheck con `docker compose exec web node -e "fetch('http://localhost:3000/api/health').then(r=>console.log(r.status))"`.

### 2. Error `API key not valid` en Gemini
- Abre tu `.env` con `nano .env` y comprueba que `GEMINI_API_KEY` tenga tu clave sin comillas ni espacios extra.
- Reinicia el contenedor con `docker compose restart`.

### 3. Error en Snowflake o herramientas MCP
- Verifica que las variables `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USERNAME`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA` estén configuradas correctamente en `.env`.
- Puedes probar el cliente MCP directamente dentro del contenedor ejecutando:
  ```bash
  docker compose exec web node -e '
  const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({
    command: "node",
    args: [process.env.MCP_SNOWFLAKE_SERVER_PATH],
    env: process.env,
  });
  const client = new Client({ name: "cli-test", version: "1.0.0" }, { capabilities: {} });
  client.connect(transport).then(async () => {
    const tools = await client.listTools();
    console.log("Tools conectadas:", tools.tools.map(t => t.name));
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1); });
  '
  ```
- Si no cuentas con credenciales de Snowflake en ese momento, el agente informará que Snowflake no está conectado y generará la pantalla adecuada para simuladores u otras herramientas disponibles sin romper el flujo.

### 4. No puedo acceder a la IP del VPS en el puerto 3000
- Verifica que el firewall de Vultr (Network Security Groups) permita tráfico entrante en el puerto 3000.
- Comprueba el estado de `ufw status` en Debian y asegúrate de haber ejecutado `ufw allow 3000/tcp`.
