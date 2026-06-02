import { useState } from "react";
import { GitCompare, AlertTriangle, ArrowRight } from "lucide-react";
import { parseGitHubUrl } from "../services/github";

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export function UrlInput({ onSubmit, isLoading }: UrlInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError("Please enter a GitHub URL");
      return;
    }

    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      setError("Invalid GitHub URL. Must be a pull request, commit, or compare URL (e.g., github.com/owner/repo/pull/123).");
      return;
    }

    if (parsed.resourceType === "repo") {
      setError("Please provide a direct link to a Pull Request, Commit, or Compare comparison, rather than a repository home page.");
      return;
    }

    onSubmit(url);
  };

  const handleExampleClick = (exampleUrl: string) => {
    setUrl(exampleUrl);
    setError(null);
    onSubmit(exampleUrl);
  };

  const examples = [
    {
      title: "Vite Pull Request #15000",
      type: "PR",
      url: "https://github.com/vitejs/vite/pull/15000",
    },
    {
      title: "React Pull Request #26000",
      type: "PR",
      url: "https://github.com/facebook/react/pull/26000",
    },
    {
      title: "3Dmap Pull Request #108",
      type: "PR",
      url: "https://github.com/jbarson/3Dmap/pull/108",
    },
  ];

  return (
    <div className="splash-container">
      <div className="splash-card glass-card">
        <div className="splash-icon-wrapper">
          <GitCompare size={42} />
        </div>
        
        <h1>CodeGlass</h1>
        <p className="subtitle">
          A super-fast, virtualized code review interface for private and public repositories. 
          Simply paste any GitHub PR, Commit, or Compare link below to begin.
        </p>

        <form onSubmit={handleSubmit} className="url-form">
          <div className="url-input-wrapper">
            <input
              type="text"
              placeholder="Paste GitHub URL (e.g., github.com/facebook/react/pull/26356)"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              className="text-input"
              disabled={isLoading}
            />
          </div>
          <button type="submit" className="btn btn-primary flex-center-gap" disabled={isLoading}>
            <span>{isLoading ? "Fetching..." : "Review"}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {error && (
          <div className="url-validation-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ marginTop: "32px", textAlign: "left" }}>
          <h3 style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
            Or try these public examples:
          </h3>
          <div className="example-grid">
            {examples.map((ex, idx) => (
              <div
                key={idx}
                className="example-card"
                onClick={() => handleExampleClick(ex.url)}
              >
                <h4>{ex.type} • {ex.title}</h4>
                <code>{ex.url.replace("https://github.com/", "")}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
