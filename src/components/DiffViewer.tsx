import { useState, useEffect, useMemo } from "react";
import { Eye, EyeOff, FileText, Trash2 } from "lucide-react";
import { fetchFileContent } from "../services/github";
import type { FileChange, GitHubUrlInfo } from "../services/github";
import { FileDiff } from "@pierre/diffs/react";
import { parsePatchFiles, parseDiffFromFile } from "@pierre/diffs";
import { useLocalStorage } from "../hooks/useLocalStorage";

interface DiffViewerProps {
  activeFile: FileChange | null;
  info: GitHubUrlInfo | null;
  token: string;
  baseSha?: string;
  headSha?: string;
}

export interface InlineComment {
  id: string;
  sessionKey: string;
  filename: string;
  lineNumber: number;
  side: "additions" | "deletions";
  author: string;
  text: string;
  createdAt: string;
}

export interface DraftComment {
  filename: string;
  lineNumber: number;
  side: "additions" | "deletions";
}

export function DiffViewer({ activeFile, info, token, baseSha, headSha }: DiffViewerProps) {
  const [layout, setLayout] = useState<"split" | "unified">("split");
  const [wrapLines, setWrapLines] = useState(false);
  const [theme, setTheme] = useState<"github-dark" | "github-light" | "dracula" | "solarized-light">("github-dark");
  const [isLoading, setIsLoading] = useState(false);
  const [parsedDiff, setParsedDiff] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // comments and draft states
  const [comments, setComments] = useLocalStorage<InlineComment[]>("diff-comments", []);
  const [drafts, setDrafts] = useState<DraftComment[]>([]);
  const [draftText, setDraftText] = useState<Record<string, string>>({});

  const getDraftKey = (filename: string, side: string, lineNumber: number) => 
    `${filename}-${side}-${lineNumber}`;

  const sessionKey = info ? `${info.owner}/${info.repo}/${info.resourceType}/${info.id}` : "local";

  useEffect(() => {
    const file = activeFile;
    if (!file) {
      setParsedDiff(null);
      setError(null);
      return;
    }

    async function loadDiff() {
      setIsLoading(true);
      setError(null);
      setParsedDiff(null);

      try {
        if (!file) return; // double check for safety

        // Option 1: Try using the direct file patch if available
        if (file.patch) {
          try {
            // Note: parsePatchFiles takes a diff patch string and returns a ParsedPatch object
            const patchResult = parsePatchFiles(
              `diff --git a/${file.filename} b/${file.filename}\nindex 1111111..2222222 100644\n--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`
            );
            if (patchResult && patchResult.length > 0 && patchResult[0].files && patchResult[0].files.length > 0) {
              setParsedDiff(patchResult[0].files[0]);
              setIsLoading(false);
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
            setParsedDiff(diffData);
          } catch (diffErr: any) {
            throw new Error(`Diff rendering engine failed: ${diffErr.message || diffErr}`);
          }
        } else {
          throw new Error("Unable to render diff: Complete branch SHA information or patch is missing.");
        }
      } catch (err: any) {
        console.error("Error rendering diff:", err);
        setError(err.message || "An unexpected error occurred while loading this diff.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDiff();
  }, [activeFile, info, token, baseSha, headSha]);

  interface LineClickProps {
    lineNumber: number;
    annotationSide: "additions" | "deletions";
  }

  const handleLineClick = (props: LineClickProps) => {
    const { lineNumber, annotationSide } = props;
    const side = annotationSide;
    if (!activeFile) return;

    const draftKey = getDraftKey(activeFile.filename, side, lineNumber);
    const alreadyHasDraft = drafts.some(
      (d) => d.filename === activeFile.filename && d.side === side && d.lineNumber === lineNumber
    );

    if (alreadyHasDraft) return;

    setDrafts((prev) => [
      ...prev,
      { filename: activeFile.filename, lineNumber, side },
    ]);
    setDraftText((prev) => ({
      ...prev,
      [draftKey]: "",
    }));
  };

  const handleSaveComment = (lineNumber: number, side: "additions" | "deletions") => {
    if (!activeFile) return;
    const draftKey = getDraftKey(activeFile.filename, side, lineNumber);
    const text = draftText[draftKey]?.trim();

    if (!text) return;

    const newComment: InlineComment = {
      id: Math.random().toString(36).substring(2, 9),
      sessionKey,
      filename: activeFile.filename,
      lineNumber,
      side,
      author: "You",
      text,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setComments((prev) => [...prev, newComment]);
    setDrafts((prev) =>
      prev.filter(
        (d) =>
          !(
            d.filename === activeFile.filename &&
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
    if (!activeFile) return;
    setDrafts((prev) =>
      prev.filter(
        (d) =>
          !(
            d.filename === activeFile.filename &&
            d.side === side &&
            d.lineNumber === lineNumber
          )
      )
    );
    const draftKey = getDraftKey(activeFile.filename, side, lineNumber);
    setDraftText((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  const handleDeleteComment = (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const activeFileComments = useMemo(() => {
    if (!activeFile) return [];
    return comments.filter((c) => c.filename === activeFile.filename && c.sessionKey === sessionKey);
  }, [comments, activeFile, sessionKey]);

  const fileDrafts = useMemo(() => {
    if (!activeFile) return [];
    return drafts.filter((d) => d.filename === activeFile.filename);
  }, [drafts, activeFile]);

  const groupedAnnotations = useMemo(() => {
    if (!activeFile) return [];
    
    const groups: Record<string, {
      side: "additions" | "deletions";
      lineNumber: number;
      comments: InlineComment[];
      hasDraft: boolean;
    }> = {};

    activeFileComments.forEach((c) => {
      const key = `${c.side}-${c.lineNumber}`;
      if (!groups[key]) {
        groups[key] = { side: c.side, lineNumber: c.lineNumber, comments: [], hasDraft: false };
      }
      groups[key].comments.push(c);
    });

    fileDrafts.forEach((d) => {
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
        type: "thread",
        comments: g.comments,
        hasDraft: g.hasDraft,
      },
    }));
  }, [activeFileComments, fileDrafts, activeFile]);

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
    if (metadata.type !== "thread" || !activeFile) return undefined;

    const { comments: lineComments, hasDraft } = metadata;
    const draftKey = getDraftKey(activeFile.filename, side, lineNumber);
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
                onClick={() => handleDeleteComment(comment.id)}
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

  if (!activeFile) {
    return (
      <div className="viewer-pane" style={{ justifyContent: "center", alignItems: "center", color: "var(--text-secondary)" }}>
        <div style={{ textAlign: "center", padding: "40px" }}>
          <FileText size={48} style={{ opacity: 0.3, marginBottom: "16px" }} />
          <h3>No File Selected</h3>
          <p style={{ fontSize: "14px", marginTop: "8px" }}>Select a file from the sidebar list to view its changes.</p>
        </div>
      </div>
    );
  }

  // Construct options for FileDiff component to configure styling and behavior
  const diffOptions = {
    diffStyle: layout,
    theme: theme,
    overflow: wrapLines ? ("wrap" as const) : ("scroll" as const),
    lineHoverHighlight: "both" as const,
    onLineNumberClick: handleLineClick,
  };

  return (
    <div className="viewer-pane">
      <div className="viewer-header">
        <div className="active-file-title">
          <FileText size={16} />
          <span>{activeFile.filename}</span>
        </div>

        <div className="viewer-actions">
          {/* Layout Controls */}
          <div className="btn-group" style={{ display: "flex", gap: "2px", background: "var(--border)", padding: "2px", borderRadius: "var(--radius-sm)" }}>
            <button
              onClick={() => setLayout("split")}
              className={`btn btn-secondary ${layout === "split" ? "btn-primary" : ""}`}
              style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "calc(var(--radius-sm) - 2px)" }}
            >
              Split
            </button>
            <button
              onClick={() => setLayout("unified")}
              className={`btn btn-secondary ${layout === "unified" ? "btn-primary" : ""}`}
              style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "calc(var(--radius-sm) - 2px)" }}
            >
              Unified
            </button>
          </div>

          {/* Wrap lines */}
          <button
            onClick={() => setWrapLines(!wrapLines)}
            className={`btn btn-secondary btn-icon`}
            style={{ width: "32px", height: "32px" }}
            title={wrapLines ? "Disable Word Wrap" : "Enable Word Wrap"}
          >
            {wrapLines ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>

          {/* Theme Selector */}
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            className="text-input"
            style={{ padding: "4px 8px", fontSize: "12px", height: "32px", width: "120px", fontFamily: "var(--font-sans)" }}
          >
            <option value="github-dark">GitHub Dark</option>
            <option value="github-light">GitHub Light</option>
            <option value="dracula">Dracula</option>
            <option value="solarized-light">Solarized Light</option>
          </select>
        </div>
      </div>

      <div className="viewer-body">
        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Loading file differences...</p>
          </div>
        )}

        {error && (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--danger)" }}>
            <h3>Failed to Render Diff</h3>
            <p style={{ fontSize: "14px", marginTop: "12px", maxWidth: "480px", margin: "12px auto 0" }}>{error}</p>
          </div>
        )}

        {!isLoading && !error && parsedDiff && (
          <div className="diff-container">
            <div className="diff-shadow-dom-host">
              <FileDiff
                fileDiff={parsedDiff}
                options={diffOptions}
                lineAnnotations={groupedAnnotations}
                renderAnnotation={renderAnnotation}
              />
            </div>
          </div>
        )}

        {!isLoading && !error && !parsedDiff && (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
            <h3>No diff data</h3>
            <p style={{ fontSize: "14px", marginTop: "12px" }}>The file may be binary, empty, or has no diff details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
