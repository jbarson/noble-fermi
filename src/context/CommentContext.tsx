import React, { useMemo } from "react";
import { CommentManager } from "../services/annotations";
import type { SessionContext } from "../services/annotations";
import { CommentManagerContext } from "../hooks/useAnnotations";

export interface CommentManagerProviderProps {
  manager: CommentManager;
  context: SessionContext;
  children: React.ReactNode;
}

export function CommentManagerProvider({ manager, context, children }: CommentManagerProviderProps) {
  const value = useMemo(() => ({ manager, context }), [manager, context]);
  return (
    <CommentManagerContext.Provider value={value}>
      {children}
    </CommentManagerContext.Provider>
  );
}
