import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, AlertCircle, MessageSquare, FileCode, GitMerge, GitPullRequest } from "lucide-react";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./components/Dashboard";
import { SidebarTree } from "./components/SidebarTree";
import { DiffViewer } from "./components/DiffViewer";
import { TokenModal } from "./components/TokenModal";
import { PRConversation } from "./components/PRConversation";
import { fetchDiffSession, parseGitHubUrl } from "./services/github";
import type { DiffSession, FileChange } from "./services/github";

export default function App() {
  const [token, setToken] = useLocalStorage<string>("github-pat", "");
  const [theme, setTheme] = useLocalStorage<"light" | "dark">("theme", "dark");
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<DiffSession | null>(null);
  const [activeFile, setActiveFile] = useState<FileChange | null>(null);
  const [activeTab, setActiveTab] = useState<"conversation" | "files">("files");

  // Sync theme with HTML data attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleLoadUrl = useCallback(async (targetUrl: string) => {
    const parsed = parseGitHubUrl(targetUrl);
    if (!parsed) {
      setError("Invalid GitHub URL format.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setActiveSession(null);
    setActiveFile(null);

    // Update query params in address bar for easy bookmarking & sharing
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("url", targetUrl);

    // Read initial tab parameter if present (e.g. on initial load or deep link)
    const currentParams = new URLSearchParams(window.location.search);
    const initialTab = currentParams.get("tab");
    if (initialTab) {
      newUrl.searchParams.set("tab", initialTab);
    } else {
      newUrl.searchParams.delete("tab");
    }

    window.history.pushState({}, "", newUrl.toString());

    try {
      const session = await fetchDiffSession(parsed, token);
      console.log("App session loaded:", session);
      setActiveSession(session);
      if (session.prMetadata) {
        if (initialTab === "files") {
          setActiveTab("files");
        } else {
          setActiveTab("conversation");
        }
      } else {
        setActiveTab("files");
      }
      
      // Select the first file by default if files are available
      if (session.files.length > 0) {
        // Find modified/added files first, otherwise fallback to first
        const defaultFile = session.files.find(f => f.status !== "removed") || session.files[0];
        setActiveFile(defaultFile);
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load differences. Verify the URL is correct and your token has permission.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Handle URL Query Params (Routing)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("url");
    if (urlParam) {
      Promise.resolve().then(() => {
        handleLoadUrl(urlParam);
      });
    }
  }, [handleLoadUrl]);

  const handleTabChange = useCallback((tab: "conversation" | "files") => {
    setActiveTab(tab);
    
    const newUrl = new URL(window.location.href);
    if (activeSession?.prMetadata && tab === "files") {
      newUrl.searchParams.set("tab", "files");
    } else {
      newUrl.searchParams.delete("tab");
    }
    window.history.pushState({}, "", newUrl.toString());
  }, [activeSession]);

  const handleReset = () => {
    setActiveSession(null);
    setActiveFile(null);
    setError(null);
    setActiveTab("files");
    
    // Clear query parameters
    const newUrl = new URL(window.location.href);
    newUrl.search = "";
    window.history.pushState({}, "", newUrl.toString());
  };

  const handleToggleTheme = () => {
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  };

  return (
    <div className="app-container" data-theme={theme}>
      <Navbar
        theme={theme}
        onToggleTheme={handleToggleTheme}
        token={token}
        onOpenTokenModal={() => setIsTokenModalOpen(true)}
        onReset={handleReset}
      />

      <main className="main-content">
        {isLoading && !activeSession && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p style={{ fontSize: "15px", color: "var(--text-secondary)", fontWeight: 500 }}>
              Connecting to GitHub & fetching differences...
            </p>
          </div>
        )}

        {error && !activeSession && (
          <div className="splash-container">
            <div className="splash-card glass-card" style={{ maxWidth: "560px", padding: "32px" }}>
              <div className="splash-icon-wrapper" style={{ color: "var(--danger)", background: "var(--danger-bg)" }}>
                <AlertCircle size={36} />
              </div>
              <h2 style={{ fontSize: "22px", marginBottom: "12px", color: "var(--text-primary)" }}>Failed to Load</h2>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: "1.6", marginBottom: "24px" }}>
                {error}
              </p>
              <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                <button onClick={() => setIsTokenModalOpen(true)} className="btn btn-primary">
                  Configure Token
                </button>
                <button onClick={handleReset} className="btn btn-secondary">
                  Back Home
                </button>
              </div>
            </div>
          </div>
        )}

        {!activeSession && !isLoading && !error ? (
          <Dashboard
            onSubmit={handleLoadUrl}
            isLoading={isLoading}
            token={token}
            onOpenTokenModal={() => setIsTokenModalOpen(true)}
          />
        ) : (
          activeSession && (
            <div className="active-session-viewport">
              {activeSession.prMetadata && (
                <div className="pr-detail-header">
                  <div className="pr-header-title-row">
                    <h1 className="pr-title">{activeSession.prMetadata.title}</h1>
                    <span className="pr-number">#{activeSession.info.id}</span>
                  </div>
                  <div className="pr-header-meta">
                    <span className={`pr-state-badge ${activeSession.prMetadata.merged ? "merged" : activeSession.prMetadata.state}`}>
                      {activeSession.prMetadata.merged ? <GitMerge size={14} /> : <GitPullRequest size={14} />}
                      {activeSession.prMetadata.merged ? "Merged" : activeSession.prMetadata.state === "open" ? "Open" : "Closed"}
                    </span>
                    <span className="pr-meta-text">
                      <strong>@{activeSession.prMetadata.user.login}</strong> wants to merge{" "}
                      <code>{activeSession.prMetadata.head.ref}</code> into{" "}
                      <code>{activeSession.prMetadata.base.ref}</code>
                    </span>
                  </div>

                  <div className="pr-tabs-nav">
                    <button
                      className={`pr-tab-btn ${activeTab === "conversation" ? "active" : ""}`}
                      onClick={() => handleTabChange("conversation")}
                    >
                      <MessageSquare size={14} />
                      <span>Conversation</span>
                      <span className="tab-count-badge">{activeSession.prMetadata.comments}</span>
                    </button>
                    <button
                      className={`pr-tab-btn ${activeTab === "files" ? "active" : ""}`}
                      onClick={() => handleTabChange("files")}
                    >
                      <FileCode size={14} />
                      <span>Files changed</span>
                      <span className="tab-count-badge">{activeSession.files.length}</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="active-session-content">
                {activeTab === "conversation" && activeSession.prMetadata ? (
                  <PRConversation
                    owner={activeSession.info.owner}
                    repo={activeSession.info.repo}
                    prNumber={parseInt(activeSession.info.id, 10)}
                    token={token}
                    prMetadata={activeSession.prMetadata}
                  />
                ) : (
                  <>
                    <SidebarTree
                      files={activeSession.files}
                      activeFile={activeFile}
                      onSelectFile={setActiveFile}
                      isCollapsed={isSidebarCollapsed}
                    />

                    <button
                      className={`sidebar-toggle-btn ${isSidebarCollapsed ? "collapsed" : ""}`}
                      onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                      title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                      aria-label={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    >
                      {isSidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                    </button>

                    <DiffViewer
                      files={activeSession.files}
                      activeFile={activeFile}
                      info={activeSession.info}
                      token={token}
                      baseSha={activeSession.baseSha}
                      headSha={activeSession.headSha}
                    />
                  </>
                )}
              </div>
            </div>
          )
        )}
      </main>

      <TokenModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        token={token}
        onSaveToken={(newToken) => {
          setToken(newToken);
          // If we had a loading error, let the user re-try after adding a token
          if (error) {
            handleReset();
          }
        }}
      />
    </div>
  );
}
