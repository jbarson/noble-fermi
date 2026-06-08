import { useState, useEffect } from "react";
import { Eye, EyeOff, FileText, Files } from "lucide-react";
import type { FileChange, GitHubUrlInfo } from "../services/github";
import { FileDiffItem } from "./FileDiffItem";

interface DiffViewerProps {
  files: FileChange[];
  activeFile: FileChange | null;
  info: GitHubUrlInfo | null;
  token: string;
  baseSha?: string;
  headSha?: string;
}

export function DiffViewer({ files, activeFile, info, token, baseSha, headSha }: DiffViewerProps) {
  const [layout, setLayout] = useState<"split" | "unified">("split");
  const [wrapLines, setWrapLines] = useState(false);
  const [theme, setTheme] = useState<"github-dark" | "github-light" | "dracula" | "solarized-light">("github-dark");

  // Scroll to active file when sidebar item is clicked
  useEffect(() => {
    if (activeFile) {
      const elementId = `file-diff-${activeFile.filename}`;
      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
        
        // Apply neon highlights
        element.classList.remove("highlight-active");
        void element.offsetWidth; // force browser layout recalculation
        element.classList.add("highlight-active");
      }
    }
  }, [activeFile]);

  return (
    <div className="viewer-pane">
      {/* Global Header controls */}
      <div className="viewer-header">
        <div className="active-file-title" style={{ gap: "6px" }}>
          <Files size={16} />
          <span>PR Review Workspace ({files.length} {files.length === 1 ? "file" : "files"})</span>
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
            className="btn btn-secondary btn-icon"
            style={{ width: "32px", height: "32px" }}
            title={wrapLines ? "Disable Word Wrap" : "Enable Word Wrap"}
          >
            {wrapLines ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>

          {/* Theme Selector */}
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as "github-dark" | "github-light" | "dracula" | "solarized-light")}
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
        {files.length === 0 ? (
          <div className="viewer-pane" style={{ justifyContent: "center", alignItems: "center", color: "var(--text-secondary)" }}>
            <div style={{ textAlign: "center", padding: "40px" }}>
              <FileText size={48} style={{ opacity: 0.3, marginBottom: "16px" }} />
              <h3>No Files Changed</h3>
              <p style={{ fontSize: "14px", marginTop: "8px" }}>There are no modified files in this review session.</p>
            </div>
          </div>
        ) : (
          <div className="file-diff-list">
            {files.map((file) => (
              <FileDiffItem
                key={file.filename}
                file={file}
                info={info}
                token={token}
                baseSha={baseSha}
                headSha={headSha}
                layout={layout}
                wrapLines={wrapLines}
                theme={theme}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
