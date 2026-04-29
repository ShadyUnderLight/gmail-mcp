#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getOAuth2Client, clearToken } from "./auth.js";
import { toolDefinitions, handleToolCall } from "./tools.js";

const SERVER_NAME = "gmail-mcp";
const SERVER_VERSION = "1.0.0";

async function main() {
  if (process.argv.includes("--clear-auth") || process.argv.includes("--reauth")) {
    await clearToken();
    if (process.argv.includes("--clear-auth")) return;
  }

  let auth;
  try {
    auth = await getOAuth2Client();
  } catch (error) {
    console.error("Authentication failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return handleToolCall(auth, request.params.name, request.params.arguments || {});
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Gmail MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
