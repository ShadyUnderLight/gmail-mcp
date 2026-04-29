import { gmail_v1 } from "googleapis";

export type GmailMessage = gmail_v1.Schema$Message;
export type GmailProfile = gmail_v1.Schema$Profile;
export type GmailLabel = gmail_v1.Schema$Label;
export type GmailThread = gmail_v1.Schema$Thread;
export type GmailDraft = gmail_v1.Schema$Draft;
export type GmailHistory = gmail_v1.Schema$History;

export interface AddressObject {
  name?: string;
  address?: string;
  displayName?: string;
}

export interface ParsedMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId?: string;
  sizeEstimate?: number;
  internalDate?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  date?: string;
  bodyPlain?: string;
  bodyHtml?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }>;
}
