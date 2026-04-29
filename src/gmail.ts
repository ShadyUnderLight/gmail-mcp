import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { ParsedMessage, GmailLabel, GmailThread, GmailDraft, GmailProfile, GmailHistory } from "./types.js";
import { parseAddresses, formatAddresses, extractEmailAddress, getHeader } from "./utils.js";

function createGmail(auth: OAuth2Client): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth });
}

export async function getProfile(auth: OAuth2Client): Promise<GmailProfile> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.getProfile({ userId: "me" });
  return data;
}

export async function listMessages(
  auth: OAuth2Client,
  options: { maxResults?: number; labelIds?: string[]; q?: string; pageToken?: string } = {}
): Promise<{ messages: gmail_v1.Schema$Message[]; nextPageToken?: string; resultSizeEstimate?: number }> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.messages.list({
    userId: "me",
    maxResults: options.maxResults || 20,
    labelIds: options.labelIds || ["INBOX"],
    q: options.q,
    pageToken: options.pageToken,
  });
  return {
    messages: data.messages || [],
    nextPageToken: data.nextPageToken || undefined,
    resultSizeEstimate: data.resultSizeEstimate ?? undefined,
  };
}

export async function getMessage(auth: OAuth2Client, id: string, format: "full" | "metadata" | "minimal" = "full"): Promise<ParsedMessage> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.messages.get({
    userId: "me",
    id,
    format,
  });
  return parseMessage(data);
}

function parseMessage(msg: gmail_v1.Schema$Message): ParsedMessage {
  const headers = msg.payload?.headers || [];
  return {
    id: msg.id || "",
    threadId: msg.threadId || "",
    labelIds: msg.labelIds || [],
    snippet: msg.snippet || "",
    historyId: msg.historyId || undefined,
    internalDate: msg.internalDate || undefined,
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    bcc: getHeader(headers, "Bcc"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    bodyPlain: extractBody(msg.payload, "text/plain"),
    bodyHtml: extractBody(msg.payload, "text/html"),
    attachments: extractAttachments(msg.payload),
    sizeEstimate: msg.sizeEstimate ?? undefined,
  };
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined, mimeType: string): string {
  if (!payload) return "";

  if (payload.mimeType === mimeType && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractBody(part, mimeType);
      if (result) return result;
    }
  }

  return "";
}

function safeParseInt(val: string | number | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

function extractAttachments(payload: gmail_v1.Schema$MessagePart | undefined): ParsedMessage["attachments"] {
  const attachments: ParsedMessage["attachments"] = [];
  if (!payload) return attachments;

  if (payload.filename && payload.body?.attachmentId) {
    attachments.push({
      filename: payload.filename,
      mimeType: payload.mimeType || "application/octet-stream",
      size: safeParseInt(payload.body.size),
      attachmentId: payload.body.attachmentId,
    });
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      attachments.push(...(extractAttachments(part) || []));
    }
  }

  return attachments;
}

export async function sendMessage(
  auth: OAuth2Client,
  options: { to: string; subject: string; body: string; cc?: string; bcc?: string; bodyType?: "plain" | "html" }
): Promise<ParsedMessage> {
  const gmail = createGmail(auth);

  const toAddresses = options.to;
  const ccAddresses = parseAddresses(options.cc);
  const bccAddresses = parseAddresses(options.bcc);

  const contentType = options.bodyType === "html" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";

  const email = [
    `From: me`,
    `To: ${toAddresses}`,
    ...(ccAddresses.length ? [`Cc: ${ccAddresses.join(", ")}`] : []),
    ...(bccAddresses.length ? [`Bcc: ${bccAddresses.join(", ")}`] : []),
    `Subject: ${options.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${contentType}`,
    `Content-Transfer-Encoding: base64`,
    "",
    Buffer.from(options.body, "utf-8").toString("base64"),
  ].join("\n");

  const encodedMessage = Buffer.from(email).toString("base64url");

  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });

  if (!data.id) throw new Error("Failed to send message: no ID returned");

  return getMessage(auth, data.id);
}

export async function createDraft(
  auth: OAuth2Client,
  options: { to: string; subject: string; body: string; cc?: string; bcc?: string; bodyType?: "plain" | "html" }
): Promise<GmailDraft> {
  const gmail = createGmail(auth);

  const contentType = options.bodyType === "html" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";

  const email = [
    `From: me`,
    `To: ${options.to}`,
    ...(options.cc ? [`Cc: ${options.cc}`] : []),
    ...(options.bcc ? [`Bcc: ${options.bcc}`] : []),
    `Subject: ${options.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${contentType}`,
    `Content-Transfer-Encoding: base64`,
    "",
    Buffer.from(options.body, "utf-8").toString("base64"),
  ].join("\n");

  const encodedMessage = Buffer.from(email).toString("base64url");

  const { data } = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw: encodedMessage },
    },
  });

  return data;
}

export async function listDrafts(
  auth: OAuth2Client,
  maxResults: number = 20
): Promise<{ drafts: GmailDraft[]; nextPageToken?: string }> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.drafts.list({
    userId: "me",
    maxResults,
  });
  return {
    drafts: data.drafts || [],
    nextPageToken: data.nextPageToken || undefined,
  };
}

export async function sendDraft(auth: OAuth2Client, draftId: string): Promise<ParsedMessage> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.drafts.send({
    userId: "me",
    requestBody: { id: draftId },
  });
  if (!data.id) throw new Error("Failed to send draft: no ID returned");
  return getMessage(auth, data.id);
}

export async function listLabels(auth: OAuth2Client): Promise<GmailLabel[]> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.labels.list({ userId: "me" });
  return data.labels || [];
}

export async function createLabel(auth: OAuth2Client, name: string, labelListVisibility?: string, messageListVisibility?: string): Promise<GmailLabel> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name,
      labelListVisibility: labelListVisibility || "labelShow",
      messageListVisibility: messageListVisibility || "show",
      type: "user",
    },
  });
  return data;
}

export async function modifyMessage(
  auth: OAuth2Client,
  id: string,
  options: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<ParsedMessage> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: {
      addLabelIds: options.addLabelIds,
      removeLabelIds: options.removeLabelIds,
    },
  });
  return parseMessage(data);
}

export async function trashMessage(auth: OAuth2Client, id: string): Promise<ParsedMessage> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.messages.trash({ userId: "me", id });
  return parseMessage(data);
}

export async function untrashMessage(auth: OAuth2Client, id: string): Promise<ParsedMessage> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.messages.untrash({ userId: "me", id });
  return parseMessage(data);
}

export async function getThread(auth: OAuth2Client, threadId: string, format: "full" | "metadata" | "minimal" = "full"): Promise<GmailThread> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format,
  });
  return data;
}

export async function listThreads(
  auth: OAuth2Client,
  options: { maxResults?: number; labelIds?: string[]; q?: string; pageToken?: string } = {}
): Promise<{ threads: GmailThread[]; nextPageToken?: string; resultSizeEstimate?: number }> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.threads.list({
    userId: "me",
    maxResults: options.maxResults || 20,
    labelIds: options.labelIds,
    q: options.q,
    pageToken: options.pageToken,
  });
  return {
    threads: data.threads || [],
    nextPageToken: data.nextPageToken || undefined,
    resultSizeEstimate: data.resultSizeEstimate ?? undefined,
  };
}

export async function getHistory(auth: OAuth2Client, startHistoryId: string, maxResults?: number): Promise<{ history: GmailHistory[]; historyId?: string }> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.history.list({
    userId: "me",
    startHistoryId,
    maxResults: maxResults || 100,
    labelId: "INBOX",
  });
  return {
    history: data.history || [],
    historyId: data.historyId || undefined,
  };
}

export async function getAttachment(
  auth: OAuth2Client,
  messageId: string,
  attachmentId: string
): Promise<{ data: string; size: number }> {
  const gmail = createGmail(auth);
  const { data } = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  return { data: data.data || "", size: safeParseInt(data.size) };
}

export async function markAsRead(auth: OAuth2Client, id: string): Promise<ParsedMessage> {
  return modifyMessage(auth, id, { removeLabelIds: ["UNREAD"] });
}

export async function markAsUnread(auth: OAuth2Client, id: string): Promise<ParsedMessage> {
  return modifyMessage(auth, id, { addLabelIds: ["UNREAD"] });
}

export async function starMessage(auth: OAuth2Client, id: string): Promise<ParsedMessage> {
  return modifyMessage(auth, id, { addLabelIds: ["STARRED"] });
}

export async function unstarMessage(auth: OAuth2Client, id: string): Promise<ParsedMessage> {
  return modifyMessage(auth, id, { removeLabelIds: ["STARRED"] });
}

export async function archiveMessage(auth: OAuth2Client, id: string): Promise<ParsedMessage> {
  return modifyMessage(auth, id, { removeLabelIds: ["INBOX"] });
}

export async function moveToInbox(auth: OAuth2Client, id: string): Promise<ParsedMessage> {
  return modifyMessage(auth, id, { addLabelIds: ["INBOX"] });
}
