import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, FileText, Trash2, ShieldAlert } from "lucide-react";
import { fetchFileContent } from "../services/github";
import type { FileChange, GitHubUrlInfo } from "../services/github";
import { FileDiff } from "@pierre/diffs/react";
import { parsePatchFiles, parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { useFileAnnotations, useLineAnnotation, useCommentManager } from "../hooks/useAnnotations";

interface FileDiffItemProps {
  file: FileChange;
  info: GitHubUrlInfo | null;
  token: string;
  baseSha?: string;
  headSha?: string;
  layout: "split" | "unified";
  wrapLines: boolean;
  theme: "github-dark" | "github-light" | "dracula" | "solarized-light";
}

interface LineAnnotationBoxProps {
  filename: string;
  side: "additions" | "deletions";
  lineNumber: number;
}

function LineAnnotationBox({ filename, side, lineNumber }: LineAnnotationBoxProps) {
  const {
    comments,
    draftText,
    isSaving,
    error,
    updateDraft,
    cancelDraft,
    submitComment,
    deleteComment,
  } = useLineAnnotation(filename, side, lineNumber);

  const hasDraft = draftText !== undefined;

  return (
    <div className="inline-comment-container">
      {comments.map((comment) => (
        <div key={comment.id} className={`comment-card ${comment.isGitHubComment ? "github-comment" : ""}`}>
          <div className="comment-header">
            <div className="comment-author-info">
              <div className="comment-author-avatar">
                {comment.avatarUrl ? (
                  <img src={comment.avatarUrl} alt={comment.author} className="comment-avatar-img" />
                ) : (
                  comment.author[0]
                )}
              </div>
              <span className="comment-author-name">{comment.author}</span>
              {comment.isGitHubComment && (
                <span className="comment-badge-github">GitHub</span>
              )}
              <span className="comment-time">{comment.createdAt}</span>
            </div>
            {!comment.isGitHubComment && (
              <button
                className="comment-delete-btn"
                onClick={() => deleteComment(comment.id)}
                title="Delete comment"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <div className="comment-body">{comment.text}</div>
        </div>
      ))}

      {hasDraft && (
        <div className="comment-form">
          <textarea
            className="comment-textarea"
            placeholder="Write a comment..."
            value={draftText}
            onChange={(e) => updateDraft(e.target.value)}
            disabled={isSaving}
            autoFocus
          />
          {error && <div className="error-message" style={{ color: "var(--danger)", fontSize: "11px", marginTop: "4px" }}>Failed to save: {error.message}</div>}
          <div className="comment-form-actions">
            <button
              className="btn btn-secondary"
              style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "var(--radius-sm)" }}
              onClick={cancelDraft}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "var(--radius-sm)" }}
              onClick={submitComment}
              disabled={!draftText.trim() || isSaving}
            >
              {isSaving ? "Saving..." : "Comment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
}: FileDiffItemProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedDiff, setParsedDiff] = useState<FileDiffMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { manager, context } = useCommentManager();
  const { fileThreads } = useFileAnnotations(file.filename);

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
    manager.dispatch(context, {
      type: "UPDATE_DRAFT",
      filename: file.filename,
      lineNumber,
      side: annotationSide,
      text: "",
    });
  };

  // Format annotations for <FileDiff /> component consumption
  const groupedAnnotations = useMemo(() => {
    return fileThreads.map((thread) => ({
      side: thread.side,
      lineNumber: thread.lineNumber,
      metadata: {
        type: "thread" as const,
        comments: thread.comments,
        hasDraft: thread.draft !== undefined,
      },
    }));
  }, [fileThreads]);

  interface GroupedAnnotation {
    side: "additions" | "deletions";
    lineNumber: number;
    metadata: {
      type: "thread";
      comments: unknown[];
      hasDraft: boolean;
    };
  }

  const renderAnnotation = (annotation: GroupedAnnotation) => {
    const { side, lineNumber, metadata } = annotation;
    if (metadata.type !== "thread") return undefined;

    return (
      <LineAnnotationBox
        filename={file.filename}
        side={side}
        lineNumber={lineNumber}
      />
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
