import { describe, it, expect, vi, beforeEach } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { handleToolCall, toolDefinitions } from "../tools.js";
import type { ParsedMessage } from "../types.js";

const {
  mockGetProfile,
  mockListMessages,
  mockGetMessage,
  mockSendMessage,
  mockCreateDraft,
  mockListDrafts,
  mockSendDraft,
  mockListLabels,
  mockCreateLabel,
  mockModifyMessage,
  mockTrashMessage,
  mockUntrashMessage,
  mockGetThread,
  mockListThreads,
  mockGetHistory,
  mockMarkAsRead,
  mockMarkAsUnread,
  mockStarMessage,
  mockUnstarMessage,
  mockArchiveMessage,
  mockMoveToInbox,
} = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockListMessages: vi.fn(),
  mockGetMessage: vi.fn(),
  mockSendMessage: vi.fn(),
  mockCreateDraft: vi.fn(),
  mockListDrafts: vi.fn(),
  mockSendDraft: vi.fn(),
  mockListLabels: vi.fn(),
  mockCreateLabel: vi.fn(),
  mockModifyMessage: vi.fn(),
  mockTrashMessage: vi.fn(),
  mockUntrashMessage: vi.fn(),
  mockGetThread: vi.fn(),
  mockListThreads: vi.fn(),
  mockGetHistory: vi.fn(),
  mockMarkAsRead: vi.fn(),
  mockMarkAsUnread: vi.fn(),
  mockStarMessage: vi.fn(),
  mockUnstarMessage: vi.fn(),
  mockArchiveMessage: vi.fn(),
  mockMoveToInbox: vi.fn(),
}));

vi.mock("../gmail.js", () => ({
  getProfile: mockGetProfile,
  listMessages: mockListMessages,
  getMessage: mockGetMessage,
  sendMessage: mockSendMessage,
  createDraft: mockCreateDraft,
  listDrafts: mockListDrafts,
  sendDraft: mockSendDraft,
  listLabels: mockListLabels,
  createLabel: mockCreateLabel,
  modifyMessage: mockModifyMessage,
  trashMessage: mockTrashMessage,
  untrashMessage: mockUntrashMessage,
  getThread: mockGetThread,
  listThreads: mockListThreads,
  getHistory: mockGetHistory,
  markAsRead: mockMarkAsRead,
  markAsUnread: mockMarkAsUnread,
  starMessage: mockStarMessage,
  unstarMessage: mockUnstarMessage,
  archiveMessage: mockArchiveMessage,
  moveToInbox: mockMoveToInbox,
}));

const auth = {} as OAuth2Client;

function makeMsg(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    id: "msg-1",
    threadId: "thread-1",
    labelIds: ["INBOX"],
    snippet: "Hello",
    from: "Alice <alice@example.com>",
    to: "bob@example.com",
    subject: "Hello",
    date: "Tue, 1 Jan 2024 12:00:00 +0000",
    bodyPlain: "Hello World",
    bodyHtml: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toolDefinitions", () => {
  it("has the expected 22 tools", () => {
    expect(toolDefinitions).toHaveLength(22);
  });

  it("does NOT include delete_message", () => {
    const names = toolDefinitions.map((t) => t.name);
    expect(names).not.toContain("delete_message");
  });

  it("includes all expected tool names", () => {
    const names = toolDefinitions.map((t) => t.name);
    expect(names).toContain("get_profile");
    expect(names).toContain("send_message");
    expect(names).toContain("create_draft");
    expect(names).toContain("list_messages");
    expect(names).toContain("get_message");
    expect(names).toContain("search_messages");
    expect(names).toContain("list_drafts");
    expect(names).toContain("send_draft");
    expect(names).toContain("list_labels");
    expect(names).toContain("create_label");
    expect(names).toContain("modify_message");
    expect(names).toContain("mark_as_read");
    expect(names).toContain("mark_as_unread");
    expect(names).toContain("star_message");
    expect(names).toContain("unstar_message");
    expect(names).toContain("archive_message");
    expect(names).toContain("move_to_inbox");
    expect(names).toContain("trash_message");
    expect(names).toContain("untrash_message");
    expect(names).toContain("get_thread");
    expect(names).toContain("list_threads");
    expect(names).toContain("get_history");
  });
});

describe("handleToolCall", () => {
  describe("get_profile", () => {
    it("returns profile JSON", async () => {
      mockGetProfile.mockResolvedValue({ emailAddress: "me@example.com" });
      const res = await handleToolCall(auth, "get_profile", {});
      expect(res.content[0].text).toContain("me@example.com");
    });
  });

  describe("list_messages", () => {
    it("returns messages list", async () => {
      mockListMessages.mockResolvedValue({ messages: [{ id: "1", threadId: "t1" }], resultSizeEstimate: 1 });
      const res = await handleToolCall(auth, "list_messages", { maxResults: 10 });
      expect(res.content[0].text).toContain("Found 1 messages");
      expect(res.content[0].text).toContain("- 1 (thread: t1)");
    });

    it("shows empty when no messages", async () => {
      mockListMessages.mockResolvedValue({ messages: [] });
      const res = await handleToolCall(auth, "list_messages", {});
      expect(res.content[0].text).toBe("No messages found.");
    });

    it("includes next page token", async () => {
      mockListMessages.mockResolvedValue({ messages: [{ id: "1", threadId: "t1" }], nextPageToken: "next-token" });
      const res = await handleToolCall(auth, "list_messages", {});
      expect(res.content[0].text).toContain("Next page token: next-token");
    });
  });

  describe("get_message", () => {
    it("returns formatted message", async () => {
      mockGetMessage.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "get_message", { id: "msg-1" });
      expect(res.content[0].text).toContain("ID: msg-1");
      expect(res.content[0].text).toContain("From: Alice");
      expect(res.content[0].text).toContain("Hello World");
    });
  });

  describe("search_messages", () => {
    it("returns search results", async () => {
      mockListMessages.mockResolvedValue({ messages: [{ id: "1", threadId: "t1" }] });
      mockGetMessage.mockResolvedValue(makeMsg({ id: "1", subject: "Found Email" }));
      const res = await handleToolCall(auth, "search_messages", { q: "hello" });
      expect(res.content[0].text).toContain('Search results for "hello"');
      expect(res.content[0].text).toContain("Found Email");
    });

    it("shows empty when no matches", async () => {
      mockListMessages.mockResolvedValue({ messages: [] });
      const res = await handleToolCall(auth, "search_messages", { q: "zzz" });
      expect(res.content[0].text).toBe("No messages found matching your search.");
    });
  });

  describe("send_message", () => {
    it("sends and returns success", async () => {
      mockSendMessage.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "send_message", {
        to: "bob@example.com", subject: "Hi", body: "Hello",
      });
      expect(res.content[0].text).toContain("Message sent successfully!");
      expect(res.content[0].text).toContain("ID: msg-1");
    });

    it("rejects CR/LF in headers", async () => {
      const res = await handleToolCall(auth, "send_message", {
        to: "bob@example.com", subject: "Hi\nmalicious", body: "Hello",
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("subject");
    });

    it("rejects CR/LF in to field", async () => {
      const res = await handleToolCall(auth, "send_message", {
        to: "bob@example.com\rcc: evil@example.com", subject: "Hi", body: "Hello",
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("Invalid to");
    });
  });

  describe("create_draft", () => {
    it("creates and returns draft info", async () => {
      mockCreateDraft.mockResolvedValue({ id: "draft-1", message: { id: "msg-draft" } });
      const res = await handleToolCall(auth, "create_draft", {
        to: "bob@example.com", subject: "Draft", body: "Test",
      });
      expect(res.content[0].text).toContain("Draft created!");
      expect(res.content[0].text).toContain("Draft ID: draft-1");
    });

    it("rejects CR/LF in subject", async () => {
      const res = await handleToolCall(auth, "create_draft", {
        to: "bob@example.com", subject: "Draft\ninjection", body: "Test",
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("Invalid subject");
    });
  });

  describe("list_drafts", () => {
    it("returns drafts", async () => {
      mockListDrafts.mockResolvedValue({ drafts: [{ id: "d1", message: { id: "m1" } }] });
      const res = await handleToolCall(auth, "list_drafts", { maxResults: 10 });
      expect(res.content[0].text).toContain("Drafts (1)");
      expect(res.content[0].text).toContain("d1");
    });

    it("shows empty when no drafts", async () => {
      mockListDrafts.mockResolvedValue({ drafts: [] });
      const res = await handleToolCall(auth, "list_drafts", {});
      expect(res.content[0].text).toBe("No drafts found.");
    });
  });

  describe("send_draft", () => {
    it("sends draft", async () => {
      mockSendDraft.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "send_draft", { draftId: "d1" });
      expect(res.content[0].text).toContain("Draft sent successfully!");
    });
  });

  describe("list_labels", () => {
    it("returns labels", async () => {
      mockListLabels.mockResolvedValue([{ id: "INBOX", name: "INBOX", type: "system", messagesTotal: 10, threadsTotal: 5 }]);
      const res = await handleToolCall(auth, "list_labels", {});
      expect(res.content[0].text).toContain("INBOX");
    });

    it("shows empty when no labels", async () => {
      mockListLabels.mockResolvedValue([]);
      const res = await handleToolCall(auth, "list_labels", {});
      expect(res.content[0].text).toBe("No labels found.");
    });
  });

  describe("create_label", () => {
    it("creates label", async () => {
      mockCreateLabel.mockResolvedValue({ id: "L1", name: "my-label" });
      const res = await handleToolCall(auth, "create_label", { name: "my-label" });
      expect(res.content[0].text).toContain("Label created: my-label");
    });
  });

  describe("modify_message", () => {
    it("modifies and returns labels", async () => {
      mockModifyMessage.mockResolvedValue(makeMsg({ labelIds: ["STARRED"] }));
      const res = await handleToolCall(auth, "modify_message", { id: "msg-1", addLabelIds: ["STARRED"] });
      expect(res.content[0].text).toContain("STARRED");
    });
  });

  describe("mark_as_read / mark_as_unread", () => {
    it("marks as read", async () => {
      mockMarkAsRead.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "mark_as_read", { id: "msg-1" });
      expect(res.content[0].text).toContain("marked as read");
    });

    it("marks as unread", async () => {
      mockMarkAsUnread.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "mark_as_unread", { id: "msg-1" });
      expect(res.content[0].text).toContain("marked as unread");
    });
  });

  describe("star / unstar", () => {
    it("stars", async () => {
      mockStarMessage.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "star_message", { id: "msg-1" });
      expect(res.content[0].text).toContain("starred");
    });

    it("unstars", async () => {
      mockUnstarMessage.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "unstar_message", { id: "msg-1" });
      expect(res.content[0].text).toContain("unstarred");
    });
  });

  describe("archive / move_to_inbox", () => {
    it("archives", async () => {
      mockArchiveMessage.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "archive_message", { id: "msg-1" });
      expect(res.content[0].text).toContain("archived");
    });

    it("moves to inbox", async () => {
      mockMoveToInbox.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "move_to_inbox", { id: "msg-1" });
      expect(res.content[0].text).toContain("moved to Inbox");
    });
  });

  describe("trash / untrash", () => {
    it("trashes", async () => {
      mockTrashMessage.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "trash_message", { id: "msg-1" });
      expect(res.content[0].text).toContain("moved to trash");
    });

    it("untrashes", async () => {
      mockUntrashMessage.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "untrash_message", { id: "msg-1" });
      expect(res.content[0].text).toContain("restored from trash");
    });
  });

  describe("get_thread", () => {
    it("returns thread messages", async () => {
      mockGetThread.mockResolvedValue({ id: "thread-1", messages: [{ id: "msg-1" }] });
      mockGetMessage.mockResolvedValue(makeMsg());
      const res = await handleToolCall(auth, "get_thread", { threadId: "thread-1" });
      expect(res.content[0].text).toContain("Thread: thread-1 (1 messages)");
      expect(res.content[0].text).toContain("ID: msg-1");
    });

    it("shows empty thread", async () => {
      mockGetThread.mockResolvedValue({ id: "thread-1", messages: [] });
      const res = await handleToolCall(auth, "get_thread", { threadId: "thread-1" });
      expect(res.content[0].text).toBe("Thread is empty or not found.");
    });
  });

  describe("list_threads", () => {
    it("lists threads", async () => {
      mockListThreads.mockResolvedValue({ threads: [{ id: "t1", messages: [{ id: "m1" }] }] });
      const res = await handleToolCall(auth, "list_threads", { maxResults: 5 });
      expect(res.content[0].text).toContain("Threads (1)");
      expect(res.content[0].text).toContain("t1");
    });

    it("shows empty", async () => {
      mockListThreads.mockResolvedValue({ threads: [] });
      const res = await handleToolCall(auth, "list_threads", {});
      expect(res.content[0].text).toBe("No threads found.");
    });
  });

  describe("get_history", () => {
    it("returns history", async () => {
      mockGetHistory.mockResolvedValue({ history: [{ id: "h1" }], historyId: "1000" });
      const res = await handleToolCall(auth, "get_history", { startHistoryId: "999" });
      expect(res.content[0].text).toContain("History records: 1");
      expect(res.content[0].text).toContain("1000");
    });

    it("shows empty", async () => {
      mockGetHistory.mockResolvedValue({ history: [] });
      const res = await handleToolCall(auth, "get_history", { startHistoryId: "999" });
      expect(res.content[0].text).toBe("No history records found.");
    });
  });

  describe("error handling", () => {
    it("returns error for unknown tool", async () => {
      const res = await handleToolCall(auth, "nonexistent_tool", {});
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("Unknown tool");
    });

    it("wraps thrown errors", async () => {
      mockGetProfile.mockRejectedValue(new Error("API failure"));
      const res = await handleToolCall(auth, "get_profile", {});
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("API failure");
    });
  });
});
