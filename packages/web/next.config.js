/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El orquestador spawnea un proceso hijo (servidor MCP) y usa el SDK de
  // Snowflake por debajo del MCP client: deben correr en el runtime de Node,
  // no en el edge runtime.
  serverExternalPackages: ["@modelcontextprotocol/sdk", "snowflake-sdk"],
};

module.exports = nextConfig;
