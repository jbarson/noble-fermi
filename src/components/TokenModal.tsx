import React, { useState } from "react";
import { X, Key, ShieldAlert, ExternalLink, CheckCircle } from "lucide-react";

interface TokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onSaveToken: (token: string) => void;
}

export function TokenModal({ isOpen, onClose, token, onSaveToken }: TokenModalProps) {
  const [inputToken, setInputToken] = useState(token);
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveToken(inputToken);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1500);
  };

  const handleClear = () => {
    setInputToken("");
    onSaveToken("");
    setIsSaved(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-card">
        <div className="modal-header">
          <div className="title-area">
            <Key className="icon text-primary" size={22} />
            <h2>GitHub Authentication</h2>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          <p className="description">
            To view <strong>private repositories</strong> and avoid restrictive GitHub API rate limits on public repositories, please provide a GitHub Personal Access Token (PAT).
          </p>

          <div className="security-notice">
            <ShieldAlert className="warning-icon" size={20} />
            <div className="notice-text">
              <strong>Local Security Model:</strong> Your token is stored strictly in your browser's <code>localStorage</code>. It is sent directly to the GitHub API and is never transmitted to any third-party servers.
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="github-token">Personal Access Token</label>
            <input
              id="github-token"
              type="password"
              placeholder="ghp_... or github_pat_..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              className="text-input"
              autoComplete="off"
            />
          </div>

          <div className="instructions">
            <h3>How to generate a token:</h3>
            <ul>
              <li>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=CodeGlass%20Diff%20Viewer"
                  target="_blank"
                  rel="noreferrer"
                  className="flex-link"
                >
                  Generate Classic Token (Recommended: "repo" scope) <ExternalLink size={12} />
                </a>
              </li>
              <li>
                Alternatively, generate a <strong>Fine-grained Token</strong> with read-only access to <strong>Contents</strong> and <strong>Metadata</strong>.
              </li>
            </ul>
          </div>

          <div className="modal-actions">
            {token && (
              <button type="button" onClick={handleClear} className="btn btn-secondary btn-danger-hover">
                Remove Token
              </button>
            )}
            <div className="right-actions">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary flex-center-gap">
                {isSaved ? (
                  <>
                    <CheckCircle size={16} /> Saved!
                  </>
                ) : (
                  "Save Token"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
