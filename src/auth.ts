import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as http from "node:http";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.labels",
];

const TOKEN_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".gmail-mcp"
);
const TOKEN_PATH = path.join(TOKEN_DIR, "token.json");
const CREDENTIALS_PATH = path.join(TOKEN_DIR, "credentials.json");

function getClientIdSecret(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  throw new Error(
    "Missing Gmail OAuth2 credentials. " +
    "Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables, " +
    `or place credentials.json in ${TOKEN_DIR}\n\n` +
    "To get credentials:\n" +
    "1. Go to https://console.cloud.google.com/apis/credentials\n" +
    "2. Create an OAuth 2.0 Client ID (Desktop application type)\n" +
    "3. Download the JSON or copy Client ID and Client Secret"
  );
}

async function loadCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  try {
    const data = await fs.readFile(CREDENTIALS_PATH, "utf-8");
    const parsed = JSON.parse(data);
    return {
      clientId: parsed.installed?.client_id || parsed.web?.client_id || parsed.client_id,
      clientSecret: parsed.installed?.client_secret || parsed.web?.client_secret || parsed.client_secret,
    };
  } catch {
    return getClientIdSecret();
  }
}

export async function getOAuth2Client(): Promise<OAuth2Client> {
  const { clientId, clientSecret } = await loadCredentials();
  const redirectUri = `http://localhost:${process.env.OAUTH_PORT || "3000"}`;

  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

  try {
    const tokenData = await fs.readFile(TOKEN_PATH, "utf-8");
    const tokens = JSON.parse(tokenData);
    oauth2Client.setCredentials(tokens);

    const now = Date.now();
    const expiryDate = tokens.expiry_date || 0;

    if (expiryDate && expiryDate < now + 60000) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      await saveToken(credentials);
    }

    return oauth2Client;
  } catch {
    return initiateAuthFlow(oauth2Client);
  }
}

async function saveToken(tokens: {}): Promise<void> {
  await fs.mkdir(TOKEN_DIR, { recursive: true });
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

async function initiateAuthFlow(oauth2Client: OAuth2Client): Promise<OAuth2Client> {
  const port = parseInt(process.env.OAUTH_PORT || "3000", 10);
  const state = randomBytes(16).toString("hex");

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state,
    prompt: "consent",
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url) return;

      const url = new URL(req.url, `http://localhost:${port}`);
      const codeParam = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization Failed</h1><p>${error}</p><p>Please close this window and try again.</p>`);
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (stateParam !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>State mismatch</h1><p>Please try again.</p>");
        reject(new Error("State mismatch in OAuth callback"));
        return;
      }

      if (codeParam) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p>");
        resolve(codeParam);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      console.error("\n=== Gmail MCP Authorization Required ===");
      console.error("  Opening browser for Gmail authorization...");
      console.error(`  If browser doesn't open, visit this URL:\n  ${authUrl}\n`);
      console.error(`  Waiting for authorization on http://localhost:${port}...\n`);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use. Set OAUTH_PORT env var to a different port.`));
      } else {
        reject(err);
      }
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await saveToken(tokens);

  return oauth2Client;
}

export async function clearToken(): Promise<void> {
  try {
    await fs.unlink(TOKEN_PATH);
    console.error("Token cleared. You will need to re-authorize on next run.");
  } catch {
    console.error("No token file found to clear.");
  }
}
