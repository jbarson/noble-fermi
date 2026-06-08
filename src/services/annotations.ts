import { fetchGraphQLComments } from "./github";
import type { GraphQLReviewThread } from "./github";

export interface SessionContext {
  owner: string;
  repo: string;
  resourceType: "pull" | "commit" | "compare";
  id: string;
  token?: string;
}

export interface Annotation {
  id: string;
  sessionKey: string;
  filename: string;
  lineNumber: number;
  side: "additions" | "deletions";
  author: string;
  avatarUrl?: string;
  text: string;
  createdAt: string;
  isGitHubComment: boolean;
}

export interface Draft {
  text: string;
  lastSavedAt: string;
}

export interface UnifiedThread {
  filename: string;
  lineNumber: number;
  side: "additions" | "deletions";
  comments: Annotation[];
  draft?: Draft;
}

export interface SessionState {
  status: "loading" | "synchronized" | "error";
  error?: Error;
  threads: UnifiedThread[];
}

export type AnnotationAction =
  | { type: "UPDATE_DRAFT"; filename: string; lineNumber: number; side: "additions" | "deletions"; text: string }
  | { type: "DISCARD_DRAFT"; filename: string; lineNumber: number; side: "additions" | "deletions" }
  | { type: "PUBLISH_DRAFT"; filename: string; lineNumber: number; side: "additions" | "deletions" }
  | { type: "DELETE_COMMENT"; commentId: string }
  | { type: "REFRESH" };

/**
 * StoragePort represents the local persistence seam.
 */
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * GraphQLPort represents the remote sync API seam.
 */
export interface GraphQLPort {
  fetchThreads(owner: string, repo: string, prNumber: number, token?: string): Promise<GraphQLReviewThread[]>;
  publishComment(
    context: SessionContext,
    filename: string,
    lineNumber: number,
    side: "additions" | "deletions",
    text: string
  ): Promise<Annotation>;
}

export class LocalStorageAdapter implements StoragePort {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      console.warn("Storage write failed:", err);
    }
  }

  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn("Storage remove failed:", err);
    }
  }
}

export class ProductionGraphQLAdapter implements GraphQLPort {
  async fetchThreads(
    owner: string,
    repo: string,
    prNumber: number,
    token?: string
  ): Promise<GraphQLReviewThread[]> {
    return fetchGraphQLComments(owner, repo, prNumber, token);
  }

  async publishComment(
    context: SessionContext,
    filename: string,
    lineNumber: number,
    side: "additions" | "deletions",
    text: string
  ): Promise<Annotation> {
    return {
      id: Math.random().toString(36).substring(2, 9),
      sessionKey: `${context.owner}/${context.repo}/${context.resourceType}/${context.id}`,
      filename,
      lineNumber,
      side,
      author: "You",
      text,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isGitHubComment: false,
    };
  }
}

export class CommentManager {
  private subscribers = new Map<string, Set<(state: SessionState) => void>>();
  
  // In-memory caches by sessionKey
  private remoteThreadsCache = new Map<string, UnifiedThread[]>();
  private localCommentsCache = new Map<string, Annotation[]>();
  private localDraftsCache = new Map<string, Map<string, string>>();
  
  // Lifecycle statuses by sessionKey
  private sessionStatus = new Map<string, "loading" | "synchronized" | "error">();
  private sessionErrors = new Map<string, Error>();

  private storage: StoragePort;
  private api: GraphQLPort;

  constructor(storage: StoragePort, api: GraphQLPort) {
    this.storage = storage;
    this.api = api;
  }

  private getSessionKey(context: SessionContext): string {
    return `${context.owner}/${context.repo}/${context.resourceType}/${context.id}`;
  }

  private getDraftStorageKey(sessionKey: string): string {
    return `drafts:${sessionKey}`;
  }

  private getCommentsStorageKey(sessionKey: string): string {
    return `comments:${sessionKey}`;
  }

  /**
   * Loads persisted drafts and local comments from StoragePort into memory caches.
   */
  private loadFromStorage(sessionKey: string): void {
    if (!this.localCommentsCache.has(sessionKey)) {
      try {
        const storedComments = this.storage.getItem(this.getCommentsStorageKey(sessionKey));
        if (storedComments) {
          const parsed = JSON.parse(storedComments) as Annotation[];
          this.localCommentsCache.set(sessionKey, parsed);
        } else {
          this.localCommentsCache.set(sessionKey, []);
        }
      } catch (err) {
        console.error(`Failed to parse comments from storage for session ${sessionKey}:`, err);
        this.localCommentsCache.set(sessionKey, []);
      }
    }

    if (!this.localDraftsCache.has(sessionKey)) {
      const draftMap = new Map<string, string>();
      try {
        const storedDrafts = this.storage.getItem(this.getDraftStorageKey(sessionKey));
        if (storedDrafts) {
          const parsed = JSON.parse(storedDrafts) as Record<string, string>;
          Object.entries(parsed).forEach(([key, val]) => {
            draftMap.set(key, val);
          });
        }
      } catch (err) {
        console.error(`Failed to parse drafts from storage for session ${sessionKey}:`, err);
      }
      this.localDraftsCache.set(sessionKey, draftMap);
    }
  }

  private saveDraftsToStorage(sessionKey: string): void {
    const draftMap = this.localDraftsCache.get(sessionKey);
    if (!draftMap) return;

    try {
      const obj: Record<string, string> = {};
      draftMap.forEach((val, key) => {
        obj[key] = val;
      });
      this.storage.setItem(this.getDraftStorageKey(sessionKey), JSON.stringify(obj));
    } catch (err) {
      console.error(`Failed to write drafts to storage for session ${sessionKey}:`, err);
    }
  }

  private saveCommentsToStorage(sessionKey: string): void {
    const comments = this.localCommentsCache.get(sessionKey);
    if (!comments) return;

    try {
      this.storage.setItem(this.getCommentsStorageKey(sessionKey), JSON.stringify(comments));
    } catch (err) {
      console.error(`Failed to write comments to storage for session ${sessionKey}:`, err);
    }
  }

  /**
   * Syncs remote comments in the background from the GraphQL API.
   */
  private async syncRemoteComments(context: SessionContext): Promise<void> {
    const sessionKey = this.getSessionKey(context);
    
    if (context.resourceType !== "pull") {
      this.sessionStatus.set(sessionKey, "synchronized");
      this.notifySubscribers(sessionKey);
      return;
    }

    const prNumber = parseInt(context.id, 10);
    if (isNaN(prNumber)) {
      this.sessionStatus.set(sessionKey, "error");
      this.sessionErrors.set(sessionKey, new Error("Invalid PR number for GraphQL sync"));
      this.notifySubscribers(sessionKey);
      return;
    }

    try {
      const rawThreads = await this.api.fetchThreads(context.owner, context.repo, prNumber, context.token);
      
      const mappedThreads: UnifiedThread[] = rawThreads.map((thread) => {
        const side: "additions" | "deletions" = thread.diffSide === "LEFT" ? "deletions" : "additions";
        
        const comments: Annotation[] = thread.comments.nodes.map((comment) => ({
          id: comment.id,
          sessionKey,
          filename: thread.path,
          lineNumber: thread.line,
          side,
          author: comment.author?.login || "Ghost",
          avatarUrl: comment.author?.avatarUrl,
          text: comment.body,
          createdAt: comment.createdAt,
          isGitHubComment: true,
        }));

        return {
          filename: thread.path,
          lineNumber: thread.line,
          side,
          comments,
        };
      });

      this.remoteThreadsCache.set(sessionKey, mappedThreads);
      this.sessionStatus.set(sessionKey, "synchronized");
      this.sessionErrors.delete(sessionKey);
    } catch (err) {
      console.error(`GraphQL sync failed for session ${sessionKey}:`, err);
      this.sessionStatus.set(sessionKey, "error");
      this.sessionErrors.set(sessionKey, err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.notifySubscribers(sessionKey);
    }
  }

  /**
   * Calculates the combined representation of remote comments, local comments, and drafts.
   */
  private computeMergedState(sessionKey: string): SessionState {
    const status = this.sessionStatus.get(sessionKey) || "loading";
    const error = this.sessionErrors.get(sessionKey);
    
    const remote = this.remoteThreadsCache.get(sessionKey) || [];
    const local = this.localCommentsCache.get(sessionKey) || [];
    const drafts = this.localDraftsCache.get(sessionKey) || new Map<string, string>();

    // Map to group threads by key: `filename:side:lineNumber`
    const threadMap = new Map<string, UnifiedThread>();

    // Helper to get or insert thread
    const getOrCreateThread = (filename: string, side: "additions" | "deletions", lineNumber: number): UnifiedThread => {
      const key = `${filename}:${side}:${lineNumber}`;
      let thread = threadMap.get(key);
      if (!thread) {
        thread = { filename, lineNumber, side, comments: [] };
        threadMap.set(key, thread);
      }
      return thread;
    };

    // 1. Populate remote threads
    remote.forEach((thread) => {
      const target = getOrCreateThread(thread.filename, thread.side, thread.lineNumber);
      thread.comments.forEach((c) => {
        // Prevent duplicate comment IDs
        if (!target.comments.some(existing => existing.id === c.id)) {
          target.comments.push(c);
        }
      });
    });

    // 2. Populate local saved comments
    local.forEach((comment) => {
      const target = getOrCreateThread(comment.filename, comment.side, comment.lineNumber);
      if (!target.comments.some(existing => existing.id === comment.id)) {
        target.comments.push(comment);
      }
    });

    // 3. Populate active drafts
    drafts.forEach((text, key) => {
      const parts = key.split(":");
      const filename = parts.slice(0, -2).join(":"); // Re-assemble filename if it contains colons
      const side = parts[parts.length - 2] as "additions" | "deletions";
      const lineNumber = parseInt(parts[parts.length - 1], 10);

      if (!filename || isNaN(lineNumber)) return;

      const target = getOrCreateThread(filename, side, lineNumber);
      target.draft = {
        text,
        lastSavedAt: new Date().toISOString(),
      };
    });

    // 4. Filter out empty threads and sort remaining chronologically
    const threads = Array.from(threadMap.values())
      .filter((t) => t.comments.length > 0 || t.draft !== undefined)
      .map((t) => {
        // Sort comments by timestamp
        t.comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return t;
      });

    return {
      status,
      error,
      threads,
    };
  }

  private notifySubscribers(sessionKey: string): void {
    const sessionSubs = this.subscribers.get(sessionKey);
    if (!sessionSubs) return;

    const state = this.computeMergedState(sessionKey);
    sessionSubs.forEach((callback) => {
      try {
        callback(state);
      } catch (err) {
        console.error(`Error in subscriber callback for session ${sessionKey}:`, err);
      }
    });
  }

  /**
   * Subscribe to comment updates for a given SessionContext.
   * Immediately delivers the local storage cached representation.
   */
  subscribe(context: SessionContext, onUpdate: (state: SessionState) => void): () => void {
    const sessionKey = this.getSessionKey(context);
    
    if (!this.subscribers.has(sessionKey)) {
      this.subscribers.set(sessionKey, new Set());
    }
    this.subscribers.get(sessionKey)!.add(onUpdate);

    // Ensure state caches are seeded
    this.loadFromStorage(sessionKey);

    // Initial status assignment (if not already synced or error)
    if (!this.sessionStatus.has(sessionKey)) {
      this.sessionStatus.set(sessionKey, "loading");
    }

    // Deliver initial state synchronously
    onUpdate(this.computeMergedState(sessionKey));

    // Kick off remote fetch in the background
    Promise.resolve().then(() => {
      this.syncRemoteComments(context);
    });

    return () => {
      const sessionSubs = this.subscribers.get(sessionKey);
      if (sessionSubs) {
        sessionSubs.delete(onUpdate);
        if (sessionSubs.size === 0) {
          this.subscribers.delete(sessionKey);
        }
      }
    };
  }

  /**
   * Dispatch actions to update state and trigger persistence/sync changes.
   */
  async dispatch(context: SessionContext, action: AnnotationAction): Promise<void> {
    const sessionKey = this.getSessionKey(context);
    this.loadFromStorage(sessionKey);

    switch (action.type) {
      case "UPDATE_DRAFT": {
        const draftMap = this.localDraftsCache.get(sessionKey)!;
        const lineKey = `${action.filename}:${action.side}:${action.lineNumber}`;
        draftMap.set(lineKey, action.text);
        
        this.saveDraftsToStorage(sessionKey);
        this.notifySubscribers(sessionKey);
        break;
      }

      case "DISCARD_DRAFT": {
        const draftMap = this.localDraftsCache.get(sessionKey)!;
        const lineKey = `${action.filename}:${action.side}:${action.lineNumber}`;
        draftMap.delete(lineKey);
        
        this.saveDraftsToStorage(sessionKey);
        this.notifySubscribers(sessionKey);
        break;
      }

      case "PUBLISH_DRAFT": {
        const draftMap = this.localDraftsCache.get(sessionKey)!;
        const lineKey = `${action.filename}:${action.side}:${action.lineNumber}`;
        const text = draftMap.get(lineKey)?.trim();
        
        if (!text) return;

        // Perform the API write across the GraphQL seam
        try {
          const published = await this.api.publishComment(
            context,
            action.filename,
            action.lineNumber,
            action.side,
            text
          );

          // Clear local draft upon success
          draftMap.delete(lineKey);
          this.saveDraftsToStorage(sessionKey);

          if (published.isGitHubComment) {
            // Re-trigger a full sync to fetch correct remote shapes and thread structures
            await this.syncRemoteComments(context);
          } else {
            // Save locally if it was processed as a mock/local fallback
            const localList = this.localCommentsCache.get(sessionKey)!;
            localList.push(published);
            this.saveCommentsToStorage(sessionKey);
            this.notifySubscribers(sessionKey);
          }
        } catch (err) {
          const customError = new Error(`Failed to publish comment: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
          this.sessionErrors.set(sessionKey, customError);
          this.notifySubscribers(sessionKey);
          throw customError;
        }
        break;
      }

      case "DELETE_COMMENT": {
        const localList = this.localCommentsCache.get(sessionKey)!;
        const index = localList.findIndex((c) => c.id === action.commentId);
        
        if (index !== -1) {
          localList.splice(index, 1);
          this.saveCommentsToStorage(sessionKey);
          this.notifySubscribers(sessionKey);
        }
        break;
      }

      case "REFRESH": {
        this.sessionStatus.set(sessionKey, "loading");
        this.notifySubscribers(sessionKey);
        await this.syncRemoteComments(context);
        break;
      }
    }
  }
}
