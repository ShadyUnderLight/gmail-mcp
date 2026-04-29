import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import * as gmail from "./gmail.js";
import { ParsedMessage } from "./types.js";

function textResponse(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}

function errorResponse(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: boolean } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

const HEADER_FIELDS = ["to", "cc", "bcc", "subject"] as const;

function validateHeaders(args: Record<string, unknown>): void {
  for (const field of HEADER_FIELDS) {
    const val = args[field];
    if (typeof val === "string" && /[\r\n]/.test(val)) {
      throw new Error(
        `Invalid ${field}: header value must not contain CR or LF characters`
      );
    }
  }
}

function formatMessageSummary(msg: ParsedMessage): string {
  return [
    `ID: ${msg.id}`,
    `Thread: ${msg.threadId}`,
    `From: ${msg.from}`,
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    `Date: ${msg.date}`,
    `Labels: ${msg.labelIds.join(", ")}`,
    `Snippet: ${msg.snippet}`,
  ].join("\n");
}

function formatMessageFull(msg: ParsedMessage): string {
  const summary = formatMessageSummary(msg);
  const parts: string[] = [summary];

  if (msg.cc) parts.push(`CC: ${msg.cc}`);
  if (msg.bcc) parts.push(`BCC: ${msg.bcc}`);

  if (msg.bodyPlain) {
    parts.push(`--- Body (plain text) ---\n${msg.bodyPlain}`);
  } else if (msg.bodyHtml) {
    parts.push(`--- Body (HTML stripped) ---\n${msg.bodyHtml.replace(/<[^>]*>/g, "")}`);
  } else {
    parts.push("(no body content)");
  }

  if (msg.attachments && msg.attachments.length > 0) {
    parts.push("--- Attachments ---");
    for (const att of msg.attachments) {
      parts.push(`  ${att.filename} (${att.mimeType}) - ${att.size} bytes [id: ${att.attachmentId}]`);
    }
  }

  return parts.join("\n");
}

export const toolDefinitions: Tool[] = [
  {
    name: "get_profile",
    description: "Get the Gmail profile for the authenticated user, including email address, messages total, and threads total",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_messages",
    description: "List messages in the user's mailbox, with optional filtering by label, search query, and pagination",
    inputSchema: {
      type: "object",
      properties: {
        maxResults: { type: "number", description: "Maximum number of messages to return (default: 20, max: 500)" },
        labelIds: { type: "array", items: { type: "string" }, description: "Array of label IDs to filter by (default: INBOX)" },
        q: { type: "string", description: "Gmail search query (same syntax as Gmail search bar)" },
        pageToken: { type: "string", description: "Page token for pagination" },
      },
    },
  },
  {
    name: "get_message",
    description: "Get a single email message by its ID, including full body content and attachments metadata",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message ID" },
        format: { type: "string", enum: ["full", "metadata", "minimal"], description: "Format of the message (default: full)" },
      },
      required: ["id"],
    },
  },
  {
    name: "search_messages",
    description: "Search emails using Gmail's search query syntax (same as typing in Gmail search bar)",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Gmail search query (e.g. 'from:example@email.com after:2024/1/1 has:attachment')" },
        maxResults: { type: "number", description: "Maximum results to return (default: 20)" },
        pageToken: { type: "string", description: "Page token for pagination" },
      },
      required: ["q"],
    },
  },
  {
    name: "send_message",
    description: "Send a new email message via Gmail",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address(es), comma-separated for multiple" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body content" },
        cc: { type: "string", description: "CC recipient(s), comma-separated" },
        bcc: { type: "string", description: "BCC recipient(s), comma-separated" },
        bodyType: { type: "string", enum: ["plain", "html"], description: "Body format (default: plain)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "create_draft",
    description: "Create an email draft without sending it",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address(es)" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body content" },
        cc: { type: "string", description: "CC recipient(s)" },
        bcc: { type: "string", description: "BCC recipient(s)" },
        bodyType: { type: "string", enum: ["plain", "html"], description: "Body format (default: plain)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "list_drafts",
    description: "List all email drafts in the mailbox",
    inputSchema: {
      type: "object",
      properties: {
        maxResults: { type: "number", description: "Maximum number of drafts to return (default: 20)" },
      },
    },
  },
  {
    name: "send_draft",
    description: "Send a previously created draft email by draft ID",
    inputSchema: {
      type: "object",
      properties: {
        draftId: { type: "string", description: "Draft ID to send" },
      },
      required: ["draftId"],
    },
  },
  {
    name: "list_labels",
    description: "List all Gmail labels (including system labels and user-created labels) with their metadata",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_label",
    description: "Create a new Gmail label",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Label name" },
        labelListVisibility: { type: "string", enum: ["labelShow", "labelShowIfUnread", "labelHide"], description: "Visibility in label list" },
        messageListVisibility: { type: "string", enum: ["show", "hide"], description: "Visibility in message list" },
      },
      required: ["name"],
    },
  },
  {
    name: "modify_message",
    description: "Modify a message's labels (add and/or remove labels)",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message ID" },
        addLabelIds: { type: "array", items: { type: "string" }, description: "Label IDs to add (e.g. STARED, IMPORTANT)" },
        removeLabelIds: { type: "array", items: { type: "string" }, description: "Label IDs to remove (e.g. UNREAD, INBOX)" },
      },
      required: ["id"],
    },
  },
  {
    name: "mark_as_read",
    description: "Mark a message as read",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Message ID" } },
      required: ["id"],
    },
  },
  {
    name: "mark_as_unread",
    description: "Mark a message as unread",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Message ID" } },
      required: ["id"],
    },
  },
  {
    name: "star_message",
    description: "Star a message (add to STARRED label)",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Message ID" } },
      required: ["id"],
    },
  },
  {
    name: "unstar_message",
    description: "Unstar a message (remove STARRED label)",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Message ID" } },
      required: ["id"],
    },
  },
  {
    name: "archive_message",
    description: "Archive a message (remove from INBOX)",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Message ID" } },
      required: ["id"],
    },
  },
  {
    name: "move_to_inbox",
    description: "Move a message back to INBOX",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Message ID" } },
      required: ["id"],
    },
  },
  {
    name: "trash_message",
    description: "Move a message to trash",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Message ID" } },
      required: ["id"],
    },
  },
  {
    name: "untrash_message",
    description: "Move a message out of trash back to its original location",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Message ID" } },
      required: ["id"],
    },
  },
  {
    name: "get_thread",
    description: "Get a full email thread with all messages in conversation order",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "Thread ID" },
        format: { type: "string", enum: ["full", "metadata", "minimal"], description: "Format (default: full)" },
      },
      required: ["threadId"],
    },
  },
  {
    name: "list_threads",
    description: "List email threads with optional filtering",
    inputSchema: {
      type: "object",
      properties: {
        maxResults: { type: "number", description: "Maximum threads to return (default: 20)" },
        labelIds: { type: "array", items: { type: "string" }, description: "Label IDs to filter by" },
        q: { type: "string", description: "Gmail search query" },
        pageToken: { type: "string", description: "Pagination token" },
      },
    },
  },
  {
    name: "get_history",
    description: "List the history of changes to the mailbox since a given historyId (for efficient sync)",
    inputSchema: {
      type: "object",
      properties: {
        startHistoryId: { type: "string", description: "History ID to start from (obtained from get_history or get_profile)" },
        maxResults: { type: "number", description: "Maximum history records to return (default: 100)" },
      },
      required: ["startHistoryId"],
    },
  },
];

export async function handleToolCall(
  auth: OAuth2Client,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    switch (toolName) {
      case "get_profile": {
        const profile = await gmail.getProfile(auth);
        return textResponse(JSON.stringify(profile, null, 2));
      }

      case "list_messages": {
        const result = await gmail.listMessages(auth, {
          maxResults: (args.maxResults as number) || 20,
          labelIds: args.labelIds as string[] | undefined,
          q: args.q as string | undefined,
          pageToken: args.pageToken as string | undefined,
        });
        if (result.messages.length === 0) {
          return textResponse("No messages found.");
        }
        const lines = [
          `Found ${result.messages.length} messages (estimate: ${result.resultSizeEstimate})\n`,
          ...result.messages.map((m) => `- ${m.id} (thread: ${m.threadId})`),
        ];
        if (result.nextPageToken) {
          lines.push(`\nNext page token: ${result.nextPageToken}`);
        }
        return textResponse(lines.join("\n"));
      }

      case "get_message": {
        const msg = await gmail.getMessage(auth, args.id as string, (args.format as "full" | "metadata" | "minimal") || "full");
        return textResponse(formatMessageFull(msg));
      }

      case "search_messages": {
        const result = await gmail.listMessages(auth, {
          q: args.q as string,
          maxResults: (args.maxResults as number) || 20,
          labelIds: undefined,
          pageToken: args.pageToken as string | undefined,
        });
        if (result.messages.length === 0) {
          return textResponse("No messages found matching your search.");
        }
        const lines = [`Search results for "${args.q}":\n`];
        for (const m of result.messages) {
          const msg = await gmail.getMessage(auth, m.id!, "metadata");
          lines.push(`- [${msg.date}] ${msg.subject} - from: ${msg.from} (id: ${msg.id})`);
        }
        if (result.nextPageToken) {
          lines.push(`\nNext page token: ${result.nextPageToken}`);
        }
        return textResponse(lines.join("\n"));
      }

      case "send_message": {
        validateHeaders(args);
        const sent = await gmail.sendMessage(auth, {
          to: args.to as string,
          subject: args.subject as string,
          body: args.body as string,
          cc: args.cc as string | undefined,
          bcc: args.bcc as string | undefined,
          bodyType: (args.bodyType as "plain" | "html") || "plain",
        });
        return textResponse(`Message sent successfully!\n\n${formatMessageSummary(sent)}`);
      }

      case "create_draft": {
        validateHeaders(args);
        const draft = await gmail.createDraft(auth, {
          to: args.to as string,
          subject: args.subject as string,
          body: args.body as string,
          cc: args.cc as string | undefined,
          bcc: args.bcc as string | undefined,
          bodyType: (args.bodyType as "plain" | "html") || "plain",
        });
        return textResponse(`Draft created!\nDraft ID: ${draft.id}\nMessage ID: ${draft.message?.id}`);
      }

      case "list_drafts": {
        const result = await gmail.listDrafts(auth, (args.maxResults as number) || 20);
        if (result.drafts.length === 0) {
          return textResponse("No drafts found.");
        }
        const lines = [`Drafts (${result.drafts.length}):\n`];
        for (const d of result.drafts) {
          const msg = d.message;
          const msgDetail = msg?.id ? ` - msg: ${msg.id}` : "";
          lines.push(`- ${d.id}${msgDetail}`);
        }
        return textResponse(lines.join("\n"));
      }

      case "send_draft": {
        const sent = await gmail.sendDraft(auth, args.draftId as string);
        return textResponse(`Draft sent successfully!\n\n${formatMessageSummary(sent)}`);
      }

      case "list_labels": {
        const labels = await gmail.listLabels(auth);
        if (labels.length === 0) {
          return textResponse("No labels found.");
        }
        const lines = labels.map((l) => {
          const type = l.type === "system" ? "(system)" : "(user)";
          return `- ${l.name} (id: ${l.id}) ${type} - ${l.messagesTotal || 0} messages, ${l.threadsTotal || 0} threads`;
        });
        return textResponse(`Labels (${labels.length}):\n\n${lines.join("\n")}`);
      }

      case "create_label": {
        const label = await gmail.createLabel(
          auth,
          args.name as string,
          args.labelListVisibility as string | undefined,
          args.messageListVisibility as string | undefined
        );
        return textResponse(`Label created: ${label.name} (id: ${label.id})`);
      }

      case "modify_message": {
        const modified = await gmail.modifyMessage(auth, args.id as string, {
          addLabelIds: args.addLabelIds as string[] | undefined,
          removeLabelIds: args.removeLabelIds as string[] | undefined,
        });
        return textResponse(`Message modified. Labels: ${modified.labelIds.join(", ")}`);
      }

      case "mark_as_read": {
        const msg = await gmail.markAsRead(auth, args.id as string);
        return textResponse(`Message ${msg.id} marked as read.`);
      }

      case "mark_as_unread": {
        const msg = await gmail.markAsUnread(auth, args.id as string);
        return textResponse(`Message ${msg.id} marked as unread.`);
      }

      case "star_message": {
        const msg = await gmail.starMessage(auth, args.id as string);
        return textResponse(`Message ${msg.id} starred.`);
      }

      case "unstar_message": {
        const msg = await gmail.unstarMessage(auth, args.id as string);
        return textResponse(`Message ${msg.id} unstarred.`);
      }

      case "archive_message": {
        const msg = await gmail.archiveMessage(auth, args.id as string);
        return textResponse(`Message ${msg.id} archived.`);
      }

      case "move_to_inbox": {
        const msg = await gmail.moveToInbox(auth, args.id as string);
        return textResponse(`Message ${msg.id} moved to Inbox.`);
      }

      case "trash_message": {
        const msg = await gmail.trashMessage(auth, args.id as string);
        return textResponse(`Message ${msg.id} moved to trash.`);
      }

      case "untrash_message": {
        const msg = await gmail.untrashMessage(auth, args.id as string);
        return textResponse(`Message ${msg.id} restored from trash.`);
      }

      case "get_thread": {
        const format = (args.format as "full" | "metadata" | "minimal") || "full";
        const thread = await gmail.getThread(auth, args.threadId as string, format);
        const messages = thread.messages || [];
        if (messages.length === 0) {
          return textResponse("Thread is empty or not found.");
        }
        const parts = [`Thread: ${thread.id} (${messages.length} messages)\n`];
        for (const m of messages) {
          const msg = await gmail.getMessage(auth, m.id!, format);
          parts.push(`--- Message ${msg.id} ---\n${formatMessageFull(msg)}\n`);
        }
        return textResponse(parts.join("\n"));
      }

      case "list_threads": {
        const result = await gmail.listThreads(auth, {
          maxResults: (args.maxResults as number) || 20,
          labelIds: args.labelIds as string[] | undefined,
          q: args.q as string | undefined,
          pageToken: args.pageToken as string | undefined,
        });
        if (result.threads.length === 0) {
          return textResponse("No threads found.");
        }
        const lines = [
          `Threads (${result.threads.length}):\n`,
          ...result.threads.map((t) => `- ${t.id} (${t.messages?.length || 0} messages)`),
        ];
        if (result.nextPageToken) {
          lines.push(`\nNext page token: ${result.nextPageToken}`);
        }
        return textResponse(lines.join("\n"));
      }

      case "get_history": {
        const result = await gmail.getHistory(auth, args.startHistoryId as string, args.maxResults as number | undefined);
        if (result.history.length === 0) {
          return textResponse("No history records found.");
        }
        return textResponse(
          `History records: ${result.history.length}\nNew historyId: ${result.historyId}\n\n` +
          JSON.stringify(result.history, null, 2)
        );
      }

      default:
        return errorResponse(new Error(`Unknown tool: ${toolName}`));
    }
  } catch (error) {
    return errorResponse(error);
  }
}
