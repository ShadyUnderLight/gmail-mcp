import { describe, it, expect, vi, beforeEach } from "vitest";
import { OAuth2Client } from "google-auth-library";
import * as gmail from "../gmail.js";

const {
  mockGetProfile,
  mockMessagesList,
  mockMessagesGet,
  mockMessagesSend,
  mockMessagesModify,
  mockMessagesTrash,
  mockMessagesUntrash,
  mockAttachmentsGet,
  mockDraftsList,
  mockDraftsCreate,
  mockDraftsSend,
  mockLabelsList,
  mockLabelsCreate,
  mockThreadsGet,
  mockThreadsList,
  mockHistoryList,
} = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockMessagesList: vi.fn(),
  mockMessagesGet: vi.fn(),
  mockMessagesSend: vi.fn(),
  mockMessagesModify: vi.fn(),
  mockMessagesTrash: vi.fn(),
  mockMessagesUntrash: vi.fn(),
  mockAttachmentsGet: vi.fn(),
  mockDraftsList: vi.fn(),
  mockDraftsCreate: vi.fn(),
  mockDraftsSend: vi.fn(),
  mockLabelsList: vi.fn(),
  mockLabelsCreate: vi.fn(),
  mockThreadsGet: vi.fn(),
  mockThreadsList: vi.fn(),
  mockHistoryList: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => ({
      users: {
        getProfile: mockGetProfile,
        messages: {
          list: mockMessagesList,
          get: mockMessagesGet,
          send: mockMessagesSend,
          modify: mockMessagesModify,
          trash: mockMessagesTrash,
          untrash: mockMessagesUntrash,
          attachments: { get: mockAttachmentsGet },
        },
        drafts: {
          list: mockDraftsList,
          create: mockDraftsCreate,
          send: mockDraftsSend,
        },
        labels: {
          list: mockLabelsList,
          create: mockLabelsCreate,
        },
        threads: {
          get: mockThreadsGet,
          list: mockThreadsList,
        },
        history: {
          list: mockHistoryList,
        },
      },
    })),
  },
}));

const auth = {} as OAuth2Client;

beforeEach(() => {
  vi.clearAllMocks();
});

const sampleMessagePayload = {
  id: "msg-1",
  threadId: "thread-1",
  labelIds: ["INBOX"],
  snippet: "Hello world",
  payload: {
    headers: [
      { name: "From", value: "Alice <alice@example.com>" },
      { name: "To", value: "bob@example.com" },
      { name: "Subject", value: "Hello" },
      { name: "Date", value: "Tue, 1 Jan 2024 12:00:00 +0000" },
    ],
    mimeType: "text/plain",
    body: {
      data: Buffer.from("Hello World Body").toString("base64url"),
    },
  },
  sizeEstimate: 1234,
};

const sampleProfile = { emailAddress: "me@gmail.com", messagesTotal: 100, threadsTotal: 50 };

describe("getProfile", () => {
  it("returns profile data", async () => {
    mockGetProfile.mockResolvedValue({ data: sampleProfile });
    const result = await gmail.getProfile(auth);
    expect(result).toEqual(sampleProfile);
    expect(mockGetProfile).toHaveBeenCalledWith({ userId: "me" });
  });
});

describe("listMessages", () => {
  it("returns empty list when no messages", async () => {
    mockMessagesList.mockResolvedValue({ data: { messages: [], resultSizeEstimate: 0 } });
    const result = await gmail.listMessages(auth);
    expect(result.messages).toEqual([]);
    expect(result.resultSizeEstimate).toBe(0);
  });

  it("passes options correctly", async () => {
    const resp = { data: { messages: [{ id: "1" }], nextPageToken: "abc", resultSizeEstimate: 1 } };
    mockMessagesList.mockResolvedValue(resp);
    const result = await gmail.listMessages(auth, { maxResults: 5, labelIds: ["SENT"], q: "hello", pageToken: "prev" });
    expect(result.messages).toEqual([{ id: "1" }]);
    expect(result.nextPageToken).toBe("abc");
    expect(mockMessagesList).toHaveBeenCalledWith({
      userId: "me", maxResults: 5, labelIds: ["SENT"], q: "hello", pageToken: "prev",
    });
  });
});

describe("getMessage", () => {
  it("parses a message", async () => {
    mockMessagesGet.mockResolvedValue({ data: sampleMessagePayload });
    const msg = await gmail.getMessage(auth, "msg-1");
    expect(mockMessagesGet).toHaveBeenCalledWith({ userId: "me", id: "msg-1", format: "full" });
    expect(msg.id).toBe("msg-1");
    expect(msg.from).toBe("Alice <alice@example.com>");
    expect(msg.subject).toBe("Hello");
    expect(msg.bodyPlain).toBe("Hello World Body");
    expect(msg.sizeEstimate).toBe(1234);
  });

  it("respects format parameter", async () => {
    mockMessagesGet.mockResolvedValue({ data: sampleMessagePayload });
    await gmail.getMessage(auth, "msg-1", "metadata");
    expect(mockMessagesGet).toHaveBeenCalledWith({ userId: "me", id: "msg-1", format: "metadata" });
  });
});

describe("sendMessage", () => {
  it("sends and returns parsed message", async () => {
    const sentId = "sent-1";
    mockMessagesSend.mockResolvedValue({ data: { id: sentId } });
    mockMessagesGet.mockResolvedValue({ data: sampleMessagePayload });
    const result = await gmail.sendMessage(auth, { to: "bob@example.com", subject: "Hi", body: "Hello" });
    expect(mockMessagesSend).toHaveBeenCalled();
    expect(mockMessagesGet).toHaveBeenCalledWith({ userId: "me", id: sentId, format: "full" });
    expect(result.id).toBe("msg-1");
  });

  it("throws when send returns no id", async () => {
    mockMessagesSend.mockResolvedValue({ data: {} });
    await expect(gmail.sendMessage(auth, { to: "bob@example.com", subject: "Hi", body: "Hello" })).rejects.toThrow("Failed to send message: no ID returned");
  });
});

describe("createDraft", () => {
  it("creates draft and returns it", async () => {
    mockDraftsCreate.mockResolvedValue({ data: { id: "draft-1", message: { id: "msg-draft" } } });
    const draft = await gmail.createDraft(auth, { to: "bob@example.com", subject: "Draft", body: "Draft body" });
    expect(draft.id).toBe("draft-1");
    expect(draft.message?.id).toBe("msg-draft");
    expect(mockDraftsCreate).toHaveBeenCalled();
  });
});

describe("listDrafts", () => {
  it("returns drafts", async () => {
    mockDraftsList.mockResolvedValue({ data: { drafts: [{ id: "d1" }, { id: "d2" }], nextPageToken: "next" } });
    const result = await gmail.listDrafts(auth, 10);
    expect(result.drafts).toHaveLength(2);
    expect(result.nextPageToken).toBe("next");
    expect(mockDraftsList).toHaveBeenCalledWith({ userId: "me", maxResults: 10 });
  });
});

describe("sendDraft", () => {
  it("sends draft and returns parsed message", async () => {
    mockDraftsSend.mockResolvedValue({ data: { id: "sent-draft" } });
    mockMessagesGet.mockResolvedValue({ data: sampleMessagePayload });
    const result = await gmail.sendDraft(auth, "draft-1");
    expect(mockDraftsSend).toHaveBeenCalledWith({ userId: "me", requestBody: { id: "draft-1" } });
    expect(result.id).toBe("msg-1");
  });
});

describe("listLabels", () => {
  it("returns labels", async () => {
    mockLabelsList.mockResolvedValue({ data: { labels: [{ id: "L1", name: "INBOX", type: "system" }] } });
    const labels = await gmail.listLabels(auth);
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe("INBOX");
  });
});

describe("createLabel", () => {
  it("creates a label", async () => {
    mockLabelsCreate.mockResolvedValue({ data: { id: "L2", name: "my-label", type: "user" } });
    const label = await gmail.createLabel(auth, "my-label");
    expect(label.name).toBe("my-label");
    expect(mockLabelsCreate).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { name: "my-label", labelListVisibility: "labelShow", messageListVisibility: "show", type: "user" },
    });
  });
});

describe("modifyMessage", () => {
  it("modifies labels and returns parsed message", async () => {
    const modifiedPayload = { ...sampleMessagePayload, labelIds: ["STARRED"] };
    mockMessagesModify.mockResolvedValue({ data: modifiedPayload });
    const result = await gmail.modifyMessage(auth, "msg-1", { addLabelIds: ["STARRED"], removeLabelIds: ["UNREAD"] });
    expect(mockMessagesModify).toHaveBeenCalledWith({
      userId: "me", id: "msg-1",
      requestBody: { addLabelIds: ["STARRED"], removeLabelIds: ["UNREAD"] },
    });
    expect(result.labelIds).toContain("STARRED");
  });
});

describe("trashMessage / untrashMessage", () => {
  it("trashes a message", async () => {
    mockMessagesTrash.mockResolvedValue({ data: { ...sampleMessagePayload, labelIds: ["TRASH"] } });
    const result = await gmail.trashMessage(auth, "msg-1");
    expect(mockMessagesTrash).toHaveBeenCalledWith({ userId: "me", id: "msg-1" });
    expect(result.labelIds).toContain("TRASH");
  });

  it("untrashes a message", async () => {
    mockMessagesUntrash.mockResolvedValue({ data: { ...sampleMessagePayload, labelIds: ["INBOX"] } });
    const result = await gmail.untrashMessage(auth, "msg-1");
    expect(mockMessagesUntrash).toHaveBeenCalledWith({ userId: "me", id: "msg-1" });
    expect(result.labelIds).toContain("INBOX");
  });
});

describe("getThread", () => {
  it("gets a thread", async () => {
    mockThreadsGet.mockResolvedValue({ data: { id: "thread-1", messages: [sampleMessagePayload] } });
    const thread = await gmail.getThread(auth, "thread-1", "full");
    expect(thread.id).toBe("thread-1");
    expect(thread.messages).toHaveLength(1);
    expect(mockThreadsGet).toHaveBeenCalledWith({ userId: "me", id: "thread-1", format: "full" });
  });
});

describe("listThreads", () => {
  it("lists threads", async () => {
    mockThreadsList.mockResolvedValue({ data: { threads: [{ id: "t1" }], nextPageToken: "n" } });
    const result = await gmail.listThreads(auth, { maxResults: 5 });
    expect(result.threads).toHaveLength(1);
    expect(result.nextPageToken).toBe("n");
  });
});

describe("getHistory", () => {
  it("returns history", async () => {
    mockHistoryList.mockResolvedValue({ data: { history: [{ id: "h1" }], historyId: "1000" } });
    const result = await gmail.getHistory(auth, "999", 50);
    expect(result.history).toHaveLength(1);
    expect(result.historyId).toBe("1000");
    expect(mockHistoryList).toHaveBeenCalledWith({ userId: "me", startHistoryId: "999", maxResults: 50, labelId: "INBOX" });
  });
});

describe("getAttachment", () => {
  it("returns attachment data", async () => {
    mockAttachmentsGet.mockResolvedValue({ data: { data: "base64data", size: "1024" } });
    const result = await gmail.getAttachment(auth, "msg-1", "att-1");
    expect(result.data).toBe("base64data");
    expect(result.size).toBe(1024);
  });
});

describe("convenience helpers", () => {
  beforeEach(() => {
    mockMessagesModify.mockResolvedValue({ data: sampleMessagePayload });
  });

  it("markAsRead removes UNREAD", async () => {
    await gmail.markAsRead(auth, "msg-1");
    expect(mockMessagesModify).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: { addLabelIds: undefined, removeLabelIds: ["UNREAD"] },
    }));
  });

  it("markAsUnread adds UNREAD", async () => {
    await gmail.markAsUnread(auth, "msg-1");
    expect(mockMessagesModify).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: { addLabelIds: ["UNREAD"], removeLabelIds: undefined },
    }));
  });

  it("starMessage adds STARRED", async () => {
    await gmail.starMessage(auth, "msg-1");
    expect(mockMessagesModify).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: { addLabelIds: ["STARRED"], removeLabelIds: undefined },
    }));
  });

  it("unstarMessage removes STARRED", async () => {
    await gmail.unstarMessage(auth, "msg-1");
    expect(mockMessagesModify).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: { addLabelIds: undefined, removeLabelIds: ["STARRED"] },
    }));
  });

  it("archiveMessage removes INBOX", async () => {
    await gmail.archiveMessage(auth, "msg-1");
    expect(mockMessagesModify).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: { addLabelIds: undefined, removeLabelIds: ["INBOX"] },
    }));
  });

  it("moveToInbox adds INBOX", async () => {
    await gmail.moveToInbox(auth, "msg-1");
    expect(mockMessagesModify).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: { addLabelIds: ["INBOX"], removeLabelIds: undefined },
    }));
  });
});
