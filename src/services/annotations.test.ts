import { describe, it, expect, beforeEach } from "vitest";
import { CommentManager } from "./annotations";
import type { SessionContext, Annotation, GraphQLPort, StoragePort, SessionState } from "./annotations";
import type { GraphQLReviewThread } from "./github";

// In-Memory Storage Adapter for testing
class InMemoryStorageAdapter implements StoragePort {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

// In-Memory GraphQL Adapter for testing
class InMemoryGraphQLAdapter implements GraphQLPort {
  threads: GraphQLReviewThread[] = [];
  publishedComments: Annotation[] = [];

  // Track call counts
  fetchThreadsCallCount = 0;
  publishCommentCallCount = 0;

  async fetchThreads(
    owner: string,
    repo: string,
    prNumber: number,
    token?: string
  ): Promise<GraphQLReviewThread[]> {
    void owner;
    void repo;
    void prNumber;
    void token;
    this.fetchThreadsCallCount++;
    return this.threads;
  }

  async publishComment(
    context: SessionContext,
    filename: string,
    lineNumber: number,
    side: "additions" | "deletions",
    text: string
  ): Promise<Annotation> {
    this.publishCommentCallCount++;
    const newComment: Annotation = {
      id: `comment-${Math.random().toString(36).substring(2, 9)}`,
      sessionKey: `${context.owner}/${context.repo}/${context.resourceType}/${context.id}`,
      filename,
      lineNumber,
      side,
      author: "TestUser",
      text,
      createdAt: new Date().toISOString(),
      isGitHubComment: true, // Mark as GitHub comment to test sync branch
    };
    this.publishedComments.push(newComment);
    return newComment;
  }
}

describe("CommentManager", () => {
  let storage: InMemoryStorageAdapter;
  let api: InMemoryGraphQLAdapter;
  let manager: CommentManager;
  let context: SessionContext;
  let sessionKey: string;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    api = new InMemoryGraphQLAdapter();
    manager = new CommentManager(storage, api);
    context = {
      owner: "jbarson",
      repo: "noble-fermi",
      resourceType: "pull",
      id: "3",
      token: "dummy-token",
    };
    sessionKey = "jbarson/noble-fermi/pull/3";
  });

  it("should load comments and drafts from local storage on subscription", () => {
    // Seed storage with local comments and drafts
    const mockComment: Annotation = {
      id: "local-comment-1",
      sessionKey,
      filename: "src/App.tsx",
      lineNumber: 10,
      side: "additions",
      author: "You",
      text: "Local comment text",
      createdAt: "10:00 AM",
      isGitHubComment: false,
    };
    storage.setItem(`comments:${sessionKey}`, JSON.stringify([mockComment]));
    storage.setItem(`drafts:${sessionKey}`, JSON.stringify({
      "src/App.tsx:additions:10": "Draft content in progress",
    }));

    const states: SessionState[] = [];
    const unsubscribe = manager.subscribe(context, (state) => {
      states.push(state);
    });

    // Initial synchronous notification from subscribe
    expect(states.length).toBeGreaterThanOrEqual(1);
    const initialState = states[0];
    expect(initialState.status).toBe("loading");
    expect(initialState.threads).toHaveLength(1);

    const thread = initialState.threads[0];
    expect(thread.filename).toBe("src/App.tsx");
    expect(thread.comments).toHaveLength(1);
    expect(thread.comments[0].text).toBe("Local comment text");
    expect(thread.draft?.text).toBe("Draft content in progress");

    unsubscribe();
  });

  it("should handle draft creation, update, and discard actions", async () => {
    const states: SessionState[] = [];
    const unsubscribe = manager.subscribe(context, (state) => {
      states.push(state);
    });

    // 1. Create/Update draft
    await manager.dispatch(context, {
      type: "UPDATE_DRAFT",
      filename: "src/App.tsx",
      lineNumber: 20,
      side: "additions",
      text: "Typed draft text",
    });

    const stateAfterUpdate = states[states.length - 1];
    const threadAfterUpdate = stateAfterUpdate.threads.find(t => t.filename === "src/App.tsx" && t.lineNumber === 20);
    expect(threadAfterUpdate).toBeDefined();
    expect(threadAfterUpdate?.draft?.text).toBe("Typed draft text");

    // Verify written to storage
    const storedDrafts = JSON.parse(storage.getItem(`drafts:${sessionKey}`) || "{}");
    expect(storedDrafts["src/App.tsx:additions:20"]).toBe("Typed draft text");

    // 2. Discard draft
    await manager.dispatch(context, {
      type: "DISCARD_DRAFT",
      filename: "src/App.tsx",
      lineNumber: 20,
      side: "additions",
    });

    const stateAfterDiscard = states[states.length - 1];
    const threadAfterDiscard = stateAfterDiscard.threads.find(t => t.filename === "src/App.tsx" && t.lineNumber === 20);
    expect(threadAfterDiscard).toBeUndefined();

    // Verify removed from storage
    const storedDraftsAfterDiscard = JSON.parse(storage.getItem(`drafts:${sessionKey}`) || "{}");
    expect(storedDraftsAfterDiscard["src/App.tsx:additions:20"]).toBeUndefined();

    unsubscribe();
  });

  it("should fetch remote comments in the background and merge them with local annotations", async () => {
    // Seed API threads
    api.threads = [
      {
        id: "thread-1",
        path: "src/App.tsx",
        line: 15,
        diffSide: "RIGHT", // additions
        comments: {
          nodes: [
            {
              id: "remote-comment-1",
              body: "GraphQL comment body",
              createdAt: "2026-06-06T12:00:00Z",
              author: {
                login: "reviewer-alice",
                avatarUrl: "https://avatar.com/alice",
              },
            },
          ],
        },
      },
    ];

    // Seed local draft at the same line
    storage.setItem(`drafts:${sessionKey}`, JSON.stringify({
      "src/App.tsx:additions:15": "My local review comments",
    }));

    const states: SessionState[] = [];
    let resolveSync: () => void;
    const syncPromise = new Promise<void>((resolve) => {
      resolveSync = resolve;
    });

    const unsubscribe = manager.subscribe(context, (state) => {
      states.push(state);
      if (state.status === "synchronized") {
        resolveSync();
      }
    });

    // Wait for background sync to complete
    await syncPromise;

    expect(states.length).toBeGreaterThanOrEqual(2);
    const finalState = states[states.length - 1];
    expect(finalState.status).toBe("synchronized");
    expect(finalState.threads).toHaveLength(1);

    const thread = finalState.threads[0];
    expect(thread.filename).toBe("src/App.tsx");
    expect(thread.lineNumber).toBe(15);
    expect(thread.side).toBe("additions");
    expect(thread.comments).toHaveLength(1);
    expect(thread.comments[0].text).toBe("GraphQL comment body");
    expect(thread.comments[0].author).toBe("reviewer-alice");
    expect(thread.draft?.text).toBe("My local review comments");

    unsubscribe();
  });

  it("should publish a comment from a draft, clear the draft, and trigger sync", async () => {
    // Set up draft
    storage.setItem(`drafts:${sessionKey}`, JSON.stringify({
      "src/App.tsx:deletions:30": "Final draft to publish",
    }));

    const states: SessionState[] = [];
    const unsubscribe = manager.subscribe(context, (state) => {
      states.push(state);
    });

    // Make sure API yields the published thread during the next sync
    api.threads = [
      {
        id: "thread-published",
        path: "src/App.tsx",
        line: 30,
        diffSide: "LEFT", // deletions
        comments: {
          nodes: [
            {
              id: "remote-comment-published",
              body: "Final draft to publish",
              createdAt: "2026-06-06T12:05:00Z",
              author: { login: "TestUser", avatarUrl: "" },
            },
          ],
        },
      },
    ];

    // Dispatch publish action
    await manager.dispatch(context, {
      type: "PUBLISH_DRAFT",
      filename: "src/App.tsx",
      lineNumber: 30,
      side: "deletions",
    });

    expect(api.publishCommentCallCount).toBe(1);

    // Verify draft is cleared in storage
    const storedDrafts = JSON.parse(storage.getItem(`drafts:${sessionKey}`) || "{}");
    expect(storedDrafts["src/App.tsx:deletions:30"]).toBeUndefined();

    // Verify merged state has the published comment and no draft
    const finalState = states[states.length - 1];
    const thread = finalState.threads.find(t => t.filename === "src/App.tsx" && t.lineNumber === 30);
    expect(thread).toBeDefined();
    expect(thread?.draft).toBeUndefined();

    unsubscribe();
  });

  it("should handle deleting local comments", async () => {
    const localComment: Annotation = {
      id: "comment-to-delete",
      sessionKey,
      filename: "src/App.tsx",
      lineNumber: 40,
      side: "additions",
      author: "You",
      text: "Soon to be deleted comment",
      createdAt: "11:00 AM",
      isGitHubComment: false,
    };
    storage.setItem(`comments:${sessionKey}`, JSON.stringify([localComment]));

    const states: SessionState[] = [];
    const unsubscribe = manager.subscribe(context, (state) => {
      states.push(state);
    });

    expect(states[0].threads).toHaveLength(1);

    // Delete the comment
    await manager.dispatch(context, {
      type: "DELETE_COMMENT",
      commentId: "comment-to-delete",
    });

    const finalState = states[states.length - 1];
    expect(finalState.threads).toHaveLength(0);

    // Verify deleted from storage
    const storedComments = JSON.parse(storage.getItem(`comments:${sessionKey}`) || "[]");
    expect(storedComments).toHaveLength(0);

    unsubscribe();
  });

  it("should support manual refresh which triggers background fetching", async () => {
    const states: SessionState[] = [];
    const unsubscribe = manager.subscribe(context, (state) => {
      states.push(state);
    });

    const initialFetchCount = api.fetchThreadsCallCount;

    // Trigger manual refresh
    await manager.dispatch(context, { type: "REFRESH" });

    expect(api.fetchThreadsCallCount).toBeGreaterThan(initialFetchCount);

    unsubscribe();
  });
});
