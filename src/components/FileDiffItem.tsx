import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, FileText, Trash2, ShieldAlert } from "lucide-react";
import { fetchFileContent } from "../services/github";
import type { FileChange, GitHubUrlInfo } from "../services/github";
import { FileDiff } from "@pierre/diffs/react";
import { parsePatchFiles, parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { InlineComment } from "./DiffViewer";

interface DraftComment {
  filename: string;
  lineNumber: number;
  side: "additions" | "deletions";
}

interface FileDiffItemProps {
  file: FileChange;
  info: GitHubUrlInfo | null;
  token: string;
  baseSha?: string;
  headSha?: string;
  layout: "split" | "unified";
  wrapLines: boolean;
  theme: "github-dark" | "github-light" | "dracula" | "solarized-light";
  comments: InlineComment[];
  onSaveComment: (comment: InlineComment) => void;
  onDeleteComment: (commentId: string) => void;
  sessionKey: string;
}

export function FileDiffItem({
  file,
  info,
  token,
  baseSha,
  headSha,
  layout,
  wrapLines,
  theme,
  comments,
  onSaveComment,
  onDeleteComment,
  sessionKey,
}: FileDiffItemProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedDiff, setParsedDiff] = useState<FileDiffMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local drafts state to prevent typing lag across all files
  const [drafts, setDrafts] = useState<DraftComment[]>([]);
  const [draftText, setDraftText] = useState<Record<string, string>>({});

  const getDraftKey = (filename: string, side: string, lineNumber: number) =>
    `${filename}-${side}-${lineNumber}`;

  // Fetch diff logic for this specific file
  useEffect(() => {
    let active = true;

    async function loadDiff() {
      if (active) {
        setIsLoading(true);
        setError(null);
        setParsedDiff(null);
      }

      try {
        // Option 1: Try using the direct file patch if available
        if (file.patch) {
          try {
            const patchResult = parsePatchFiles(
              `diff --git a/${file.filename} b/${file.filename}\nindex 1111111..2222222 100644\n--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`
            );
            if (patchResult && patchResult.length > 0 && patchResult[0].files && patchResult[0].files.length > 0) {
              if (active) {
                setParsedDiff(patchResult[0].files[0]);
                setIsLoading(false);
              }
              return;
            }
          } catch (patchErr) {
            console.warn("Failed to parse quick patch, falling back to full fetch:", patchErr);
          }
        }

        // Option 2: Fallback to fetching full file content for side-by-side high fidelity rendering
        if (info && baseSha && headSha) {
          const oldContentPromise = file.status !== "added"
            ? fetchFileContent(info.owner, info.repo, file.filename, baseSha, token)
            : Promise.resolve("");

          const newContentPromise = file.status !== "removed"
            ? fetchFileContent(info.owner, info.repo, file.filename, headSha, token)
            : Promise.resolve("");

          const [oldContent, newContent] = await Promise.all([oldContentPromise, newContentPromise]);

          try {
            const diffData = parseDiffFromFile(
              { name: file.filename, contents: oldContent },
              { name: file.filename, contents: newContent }
            );
            if (active) {
              setParsedDiff(diffData);
            }
          } catch (diffErr) {
            throw new Error(`Diff rendering engine failed: ${diffErr instanceof Error ? diffErr.message : String(diffErr)}`, { cause: diffErr });
          }
        } else {
          throw new Error("Unable to render diff: Complete branch SHA information or patch is missing.");
        }
      } catch (err) {
        if (active) {
          console.error("Error rendering diff:", err);
          const message = err instanceof Error ? err.message : String(err);
          setError(message || "An unexpected error occurred while loading this diff.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadDiff();

    return () => {
      active = false;
    };
  }, [file, info, token, baseSha, headSha]);

  interface LineClickProps {
    lineNumber: number;
    annotationSide: "additions" | "deletions";
  }

  const handleLineClick = (props: LineClickProps) => {
    const { lineNumber, annotationSide } = props;
    const side = annotationSide;
    const draftKey = getDraftKey(file.filename, side, lineNumber);
    const alreadyHasDraft = drafts.some(
      (d) => d.filename === file.filename && d.side === side && d.lineNumber === lineNumber
    );

    if (alreadyHasDraft) return;

    setDrafts((prev) => [
      ...prev,
      { filename: file.filename, lineNumber, side },
    ]);
    setDraftText((prev) => ({
      ...prev,
      [draftKey]: "",
    }));
  };

  const handleSaveComment = (lineNumber: number, side: "additions" | "deletions") => {
    const draftKey = getDraftKey(file.filename, side, lineNumber);
    const text = draftText[draftKey]?.trim();

    if (!text) return;

    const newComment: InlineComment = {
      id: Math.random().toString(36).substring(2, 9),
      sessionKey,
      filename: file.filename,
      lineNumber,
      side,
      author: "You",
      text,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    onSaveComment(newComment);
    
    // Clear draft
    setDrafts((prev) =>
      prev.filter(
        (d) =>
          !(
            d.filename === file.filename &&
            d.side === side &&
            d.lineNumber === lineNumber
          )
      )
    );
    setDraftText((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  const handleCancelDraft = (lineNumber: number, side: "additions" | "deletions") => {
    setDrafts((prev) =>
      prev.filter(
        (d) =>
          !(
            d.filename === file.filename &&
            d.side === side &&
            d.lineNumber === lineNumber
          )
      )
    );
    const draftKey = getDraftKey(file.filename, side, lineNumber);
    setDraftText((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  const fileComments = useMemo(() => {
    return comments.filter((c) => c.filename === file.filename && c.sessionKey === sessionKey);
  }, [comments, file.filename, sessionKey]);

  const groupedAnnotations = useMemo(() => {
    const groups: Record<string, {
      side: "additions" | "deletions";
      lineNumber: number;
      comments: InlineComment[];
      hasDraft: boolean;
    }> = {};

    fileComments.forEach((c) => {
      const key = `${c.side}-${c.lineNumber}`;
      if (!groups[key]) {
        groups[key] = { side: c.side, lineNumber: c.lineNumber, comments: [], hasDraft: false };
      }
      groups[key].comments.push(c);
    });

    drafts.forEach((d) => {
      const key = `${d.side}-${d.lineNumber}`;
      if (!groups[key]) {
        groups[key] = { side: d.side, lineNumber: d.lineNumber, comments: [], hasDraft: false };
      }
      groups[key].hasDraft = true;
    });

    return Object.values(groups).map((g) => ({
      side: g.side,
      lineNumber: g.lineNumber,
      metadata: {
        type: "thread" as const,
        comments: g.comments,
        hasDraft: g.hasDraft,
      },
    }));
  }, [fileComments, drafts]);

  interface GroupedAnnotation {
    side: "additions" | "deletions";
    lineNumber: number;
    metadata: {
      type: "thread";
      comments: InlineComment[];
      hasDraft: boolean;
    };
  }

  const renderAnnotation = (annotation: GroupedAnnotation) => {
    const { side, lineNumber, metadata } = annotation;
    if (metadata.type !== "thread") return undefined;

    const { comments: lineComments, hasDraft } = metadata;
    const draftKey = getDraftKey(file.filename, side, lineNumber);
    const text = draftText[draftKey] || "";

    return (
      <div className="inline-comment-container">
        {lineComments.map((comment: InlineComment) => (
          <div key={comment.id} className="comment-card">
            <div className="comment-header">
              <div className="comment-author-info">
                <div className="comment-author-avatar">
                  {comment.author[0]}
                </div>
                <span className="comment-author-name">{comment.author}</span>
                <span className="comment-time">{comment.createdAt}</span>
              </div>
              <button
                className="comment-delete-btn"
                onClick={() => onDeleteComment(comment.id)}
                title="Delete comment"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="comment-body">{comment.text}</div>
          </div>
        ))}

        {hasDraft && (
          <div className="comment-form">
            <textarea
              className="comment-textarea"
              placeholder="Write a comment..."
              value={text}
              onChange={(e) =>
                setDraftText((prev) => ({
                  ...prev,
                  [draftKey]: e.target.value,
                }))
              }
              autoFocus
            />
            <div className="comment-form-actions">
              <button
                className="btn btn-secondary"
                style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "var(--radius-sm)" }}
                onClick={() => handleCancelDraft(lineNumber, side)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "var(--radius-sm)" }}
                onClick={() => handleSaveComment(lineNumber, side)}
                disabled={!text.trim()}
              >
                Comment
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "added":
        return "file-status-icon file-status-added";
      case "removed":
        return "file-status-icon file-status-removed";
      case "renamed":
        return "file-status-icon file-status-renamed";
      default:
        return "file-status-icon file-status-modified";
    }
  };

  const getStatusLetter = (status: string) => {
    switch (status) {
      case "added":
        return "A";
      case "removed":
        return "D";
      case "renamed":
        return "R";
      default:
        return "M";
    }
  };

  const diffOptions = {
    diffStyle: layout,
    theme: theme,
    overflow: wrapLines ? ("wrap" as const) : ("scroll" as const),
    lineHoverHighlight: "both" as const,
    onLineNumberClick: handleLineClick,
  };

  return (
    <section
      id={`file-diff-${file.filename}`}
      className="file-diff-item-card"
    >
      {/* File Card Header */}
      <div
        className="file-diff-item-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? "Expand file diff" : "Collapse file diff"}
      >
        <div className="file-info">
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <FileText size={16} className="text-secondary" />
          <span className="file-name">{file.filename}</span>
          
          {/* Additions / Deletions count */}
          <span style={{ fontSize: "12px", display: "flex", gap: "6px", marginLeft: "12px", fontWeight: 600 }}>
            {file.additions > 0 && <span style={{ color: "var(--success)" }}>+{file.additions}</span>}
            {file.deletions > 0 && <span style={{ color: "var(--danger)" }}>-{file.deletions}</span>}
          </span>
        </div>

        <div className="file-diff-item-header-actions" onClick={(e) => e.stopPropagation()}>
          {/* File status A/M/D/R badge */}
          <div className={getStatusClass(file.status)} title={file.status} style={{ width: "20px", height: "20px", borderRadius: "var(--radius-sm)" }}>
            {getStatusLetter(file.status)}
          </div>
        </div>
      </div>

      {/* File Card Content */}
      <div className={`file-diff-item-content ${isCollapsed ? "collapsed" : ""}`}>
        {isLoading && (
          <div style={{ padding: "40px 0", display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column", gap: "12px", background: "hsl(var(--bg-primary-hsl))" }}>
            <div className="spinner" style={{ width: "32px", height: "32px" }}></div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Loading file differences...</p>
          </div>
        )}

        {error && (
          <div style={{ padding: "30px", textAlign: "center", color: "var(--danger)", background: "hsl(var(--bg-primary-hsl))", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <ShieldAlert size={28} />
            <h4 style={{ fontSize: "14px", fontWeight: 600 }}>Failed to load diff</h4>
            <p style={{ fontSize: "12px", maxWidth: "440px", color: "var(--text-secondary)" }}>{error}</p>
          </div>
        )}

        {!isLoading && !error && parsedDiff && (
          <div className="diff-container" style={{ padding: 0 }}>
            <div className="diff-shadow-dom-host" style={{ borderRadius: 0, border: "none" }}>
              <FileDiff
                fileDiff={parsedDiff || undefined}
                options={diffOptions}
                lineAnnotations={groupedAnnotations}
                renderAnnotation={renderAnnotation}
              />
            </div>
          </div>
        )}

        {!isLoading && !error && !parsedDiff && (
          <div style={{ padding: "30px", textAlign: "center", color: "var(--text-secondary)", background: "hsl(var(--bg-primary-hsl))" }}>
            <p style={{ fontSize: "13px" }}>No diff details available (binary, empty, or renamed without edits).</p>
          </div>
        )}
      </div>
    </section>
  );
}
