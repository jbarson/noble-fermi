import React, { useState, useEffect, useMemo, useCallback } from "react";
import { GitCompare, Key, ArrowRight, AlertTriangle, RefreshCw, FolderOpen, User, Users, ChevronDown } from "lucide-react";
import { fetchUserProfile, fetchUserPRs, parseGitHubUrl } from "../services/github";
import type { SearchPRItem } from "../services/github";
import { useLocalStorage } from "../hooks/useLocalStorage";

interface DashboardProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  token: string;
  onOpenTokenModal: () => void;
}

export function Dashboard({ onSubmit, isLoading, token, onOpenTokenModal }: DashboardProps) {
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  // User and PR states
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [prs, setPrs] = useState<SearchPRItem[]>([]);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [collapsedOrgs, setCollapsedOrgs] = useLocalStorage<Record<string, boolean>>("dashboard-collapsed-orgs", {});

  const toggleOrgCollapse = useCallback((org: string) => {
    setCollapsedOrgs((prev) => ({
      ...prev,
      [org]: !prev[org],
    }));
  }, []);

  const isAuthenticated = !!token && token.trim().length > 0;

  const loadDashboardData = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoadingDashboard(true);
    setDashboardError(null);

    try {
      const profile = await fetchUserProfile(token);
      setUsername(profile.login);
      setAvatarUrl(profile.avatar_url);

      const items = await fetchUserPRs(profile.login, token);
      setPrs(items);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setDashboardError(message || "Failed to load dashboard PRs. Verify your token has proper scopes.");
    } finally {
      setIsLoadingDashboard(false);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadDashboardData();
    });
  }, [loadDashboardData]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);

    if (!url.trim()) {
      setUrlError("Please enter a GitHub URL");
      return;
    }

    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      setUrlError("Invalid GitHub URL. Must be a pull request, commit, or compare URL.");
      return;
    }

    if (parsed.resourceType === "repo") {
      setUrlError("Please provide a link directly to a Pull Request, Commit, or Compare.");
      return;
    }

    onSubmit(url);
  };

  // Extract owner and repo from repository_url: e.g. "https://api.github.com/repos/owner/repo"
  const parseRepoInfo = (repoUrl: string) => {
    try {
      const urlObj = new URL(repoUrl);
      const paths = urlObj.pathname.split("/").filter(Boolean);
      // paths will be ["repos", "owner", "repo"]
      return {
        owner: paths[1] || "Unknown",
        repo: paths[2] || "Unknown"
      };
    } catch {
      return { owner: "Unknown", repo: "Unknown" };
    }
  };

  // Group PRs by Organization (owner)
  const groupedPrs = useMemo(() => {
    const groups: Record<string, SearchPRItem[]> = {};
    
    prs.forEach((pr) => {
      const { owner } = parseRepoInfo(pr.repository_url);
      if (!groups[owner]) {
        groups[owner] = [];
      }
      groups[owner].push(pr);
    });

    return groups;
  }, [prs]);

  const getRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="dashboard-container">
      {/* Top Search bar */}
      <div className="dashboard-search-section">
        <form onSubmit={handleUrlSubmit} className="url-form" style={{ margin: 0, maxWidth: "780px", width: "100%" }}>
          <div className="url-input-wrapper">
            <input
              type="text"
              placeholder="Paste any GitHub PR, Commit, or Compare URL..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError(null);
              }}
              className="text-input"
              disabled={isLoading}
              style={{ padding: "12px 16px", borderRadius: "var(--radius-sm)" }}
            />
          </div>
          <button type="submit" className="btn btn-primary flex-center-gap" disabled={isLoading} style={{ borderRadius: "var(--radius-sm)" }}>
            <span>{isLoading ? "Fetching..." : "Review"}</span>
            <ArrowRight size={16} />
          </button>
        </form>
        {urlError && (
          <div className="url-validation-error" style={{ maxWidth: "780px", width: "100%", marginTop: "8px", marginBottom: 0 }}>
            <AlertTriangle size={14} />
            <span>{urlError}</span>
          </div>
        )}
      </div>

      {/* Main Grid area */}
      <div className="dashboard-main-grid">
        {!isAuthenticated ? (
          /* UNATHENTICATED STATE */
          <div className="dashboard-welcome-card glass-card">
            <div className="splash-icon-wrapper">
              <GitCompare size={42} />
            </div>
            <h1>Noble Fermi Review Center</h1>
            <p className="subtitle">
              A premium, high-fidelity visual workspace for GitHub diffs. Connect your account to automatically load and organize your PRs.
            </p>

            <div className="auth-promo-box">
              <h3>Unlock Your PR Dashboard</h3>
              <p>Save a GitHub Personal Access Token (PAT) to unlock:</p>
              <ul>
                <li>⚡ Automatic PR detection for pull requests you created or are assigned to.</li>
                <li>🏢 Smart grouping of review items sorted by Organization.</li>
                <li>🚀 Stricter rate limits (up to 5,000 requests/hr vs. 60/hr public limit).</li>
              </ul>
              <button onClick={onOpenTokenModal} className="btn btn-primary flex-center-gap" style={{ marginTop: "18px" }}>
                <Key size={16} />
                <span>Configure GitHub Token</span>
              </button>
            </div>
          </div>
        ) : (
          /* AUTHENTICATED STATE */
          <div className="dashboard-workspace">
            {/* Header info */}
            <div className="workspace-header">
              <div className="user-profile-badge">
                {avatarUrl && <img src={avatarUrl} alt={username || ""} className="user-avatar" />}
                <div className="user-details">
                  <span className="welcome-text">Reviewing as</span>
                  <span className="username-text">@{username}</span>
                </div>
              </div>

              <div className="header-actions">
                <button
                  onClick={loadDashboardData}
                  className="btn btn-secondary btn-icon"
                  title="Refresh Dashboard"
                  disabled={isLoadingDashboard}
                >
                  <RefreshCw size={16} className={isLoadingDashboard ? "spin" : ""} />
                </button>
              </div>
            </div>

            {/* Error notifications */}
            {dashboardError && (
              <div className="url-validation-error" style={{ marginBottom: "20px", padding: "12px", background: "var(--danger-bg)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)" }}>
                <AlertTriangle size={16} />
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong>Failed to Load Dashboard:</strong>
                  <span>{dashboardError}</span>
                </div>
              </div>
            )}

            {/* PRs Display */}
            {isLoadingDashboard ? (
              <div className="dashboard-loading">
                <div className="spinner"></div>
                <p>Loading your pull request review feed...</p>
              </div>
            ) : Object.keys(groupedPrs).length === 0 ? (
              <div className="dashboard-empty glass-card">
                <FolderOpen size={48} style={{ opacity: 0.3, marginBottom: "16px" }} />
                <h3>No Open Pull Requests Found</h3>
                <p>We couldn't find any open pull requests created by or assigned to you.</p>
                <div style={{ marginTop: "20px", fontSize: "13px", color: "var(--text-secondary)" }}>
                  Want to review other PRs? Simply paste a PR link in the input bar at the top!
                </div>
              </div>
            ) : (
              <div className="org-list">
                {Object.entries(groupedPrs).map(([org, items]) => {
                  const isCollapsed = !!collapsedOrgs[org];
                  return (
                    <div key={org} className="org-section">
                      <h2
                        className={`org-title ${isCollapsed ? "collapsed" : ""}`}
                        onClick={() => toggleOrgCollapse(org)}
                      >
                        <ChevronDown size={14} className="chevron" />
                        <span>{org} ({items.length})</span>
                      </h2>
                      
                      {!isCollapsed && (
                        <div className="pr-cards-grid">
                          {items.map((pr) => {
                            const { repo } = parseRepoInfo(pr.repository_url);
                            const isAuthor = pr.user.login === username;
                            const isAssignee = pr.assignees?.some((a) => a.login === username);

                            return (
                              <div key={pr.id} className="pr-card glass-card" onClick={() => onSubmit(pr.html_url)}>
                                <div className="pr-card-header">
                                  <span className="repo-badge">{repo}</span>
                                  <span className="pr-time">{getRelativeTime(pr.updated_at)}</span>
                                </div>

                                <h3 className="pr-title" title={pr.title}>
                                  {pr.title}
                                </h3>

                                <div className="pr-card-footer">
                                  <span className="pr-number">#{pr.number}</span>
                                  
                                  <div className="pr-author-info">
                                    <img src={pr.user.avatar_url} alt={pr.user.login} className="pr-author-avatar" title={`Opened by ${pr.user.login}`} />
                                    <span className="pr-author-name">{pr.user.login}</span>
                                  </div>

                                  <div className="role-badges">
                                    {isAuthor && (
                                      <span className="badge badge-role badge-author" title="You authored this PR">
                                        <User size={10} /> Author
                                      </span>
                                    )}
                                    {isAssignee && (
                                      <span className="badge badge-role badge-assignee" title="You are assigned to this PR">
                                        <Users size={10} /> Assignee
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
