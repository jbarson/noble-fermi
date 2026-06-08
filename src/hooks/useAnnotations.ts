import { useState, useEffect, useCallback, useMemo, useContext, createContext } from "react";
import { CommentManager } from "../services/annotations";
import type { SessionContext, SessionState } from "../services/annotations";

interface CommentManagerContextType {
  manager: CommentManager;
  context: SessionContext;
}

export const CommentManagerContext = createContext<CommentManagerContextType | null>(null);

export function useCommentManager() {
  const value = useContext(CommentManagerContext);
  if (!value) {
    throw new Error("useCommentManager must be used within a CommentManagerProvider");
  }
  return value;
}

/**
 * Accesses global session annotations state.
 */
export function useAnnotations(): SessionState & { refresh: () => Promise<void> } {
  const { manager, context } = useCommentManager();
  const [state, setState] = useState<SessionState>({ status: "loading", threads: [] });

  useEffect(() => {
    const unsubscribe = manager.subscribe(context, (nextState) => {
      setState(nextState);
    });
    return unsubscribe;
  }, [manager, context]);

  const refresh = useCallback(async () => {
    await manager.dispatch(context, { type: "REFRESH" });
  }, [manager, context]);

  return {
    ...state,
    refresh,
  };
}

/**
 * Accesses comments and drafts filtered for a single file.
 */
export function useFileAnnotations(filename: string) {
  const { threads } = useAnnotations();

  const fileThreads = useMemo(() => {
    return threads.filter((t) => t.filename === filename);
  }, [threads, filename]);

  const fileDraftCount = useMemo(() => {
    return fileThreads.filter((t) => t.draft !== undefined).length;
  }, [fileThreads]);

  return {
    fileThreads,
    fileDraftCount,
    hasActiveDrafts: fileDraftCount > 0,
  };
}

/**
 * Hook for a specific diff line. Deals with comments, draft typing local caches, and actions.
 */
export function useLineAnnotation(
  filename: string,
  side: "additions" | "deletions",
  lineNumber: number
) {
  const { manager, context } = useCommentManager();
  const { threads } = useAnnotations();

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Locate the thread matching this line coordinates
  const thread = useMemo(() => {
    return threads.find(
      (t) => t.filename === filename && t.side === side && t.lineNumber === lineNumber
    );
  }, [threads, filename, side, lineNumber]);

  const comments = useMemo(() => {
    return thread?.comments || [];
  }, [thread]);

  const managerDraftText = thread?.draft?.text;

  // React state adjustment during render (You Might Not Need An Effect pattern)
  const [prevDraftText, setPrevDraftText] = useState(managerDraftText);
  const [localText, setLocalText] = useState(managerDraftText);

  if (managerDraftText !== prevDraftText) {
    setPrevDraftText(managerDraftText);
    setLocalText(managerDraftText);
  }

  const isEditing = localText !== undefined;

  const startDraft = useCallback(() => {
    setLocalText("");
    manager.dispatch(context, {
      type: "UPDATE_DRAFT",
      filename,
      lineNumber,
      side,
      text: "",
    });
  }, [manager, context, filename, side, lineNumber]);

  const updateDraft = useCallback((text: string) => {
    setLocalText(text);
    manager.dispatch(context, {
      type: "UPDATE_DRAFT",
      filename,
      lineNumber,
      side,
      text,
    });
  }, [manager, context, filename, side, lineNumber]);

  const cancelDraft = useCallback(() => {
    setLocalText(undefined);
    setError(null);
    manager.dispatch(context, {
      type: "DISCARD_DRAFT",
      filename,
      lineNumber,
      side,
    });
  }, [manager, context, filename, side, lineNumber]);

  const submitComment = useCallback(async () => {
    if (localText === undefined || !localText.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      await manager.dispatch(context, {
        type: "PUBLISH_DRAFT",
        filename,
        lineNumber,
        side,
      });
      setLocalText(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsSaving(false);
    }
  }, [manager, context, filename, side, lineNumber, localText]);

  const deleteComment = useCallback(async (commentId: string) => {
    try {
      await manager.dispatch(context, {
        type: "DELETE_COMMENT",
        commentId,
      });
    } catch (err) {
      console.error(`Failed to delete comment ${commentId}:`, err);
    }
  }, [manager, context]);

  return {
    comments,
    draftText: localText,
    isEditing,
    isSaving,
    error,
    startDraft,
    updateDraft,
    cancelDraft,
    submitComment,
    deleteComment,
  };
}
