import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { Navbar } from "./components/Navbar";
import { UrlInput } from "./components/UrlInput";
import { SidebarTree } from "./components/SidebarTree";
import { DiffViewer } from "./components/DiffViewer";
import { TokenModal } from "./components/TokenModal";
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
    window.history.pushState({}, "", newUrl.toString());

    try {
      const session = await fetchDiffSession(parsed, token);
      setActiveSession(session);
      
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

  const handleReset = () => {
    setActiveSession(null);
    setActiveFile(null);
    setError(null);
    
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
          <UrlInput onSubmit={handleLoadUrl} isLoading={isLoading} />
        ) : (
          activeSession && (
            <>
              {/* Sidebar File list */}
              <SidebarTree
                files={activeSession.files}
                activeFile={activeFile}
                onSelectFile={setActiveFile}
                isCollapsed={isSidebarCollapsed}
              />

              {/* Collapsible Divider Button */}
              <button
                className={`sidebar-toggle-btn ${isSidebarCollapsed ? "collapsed" : ""}`}
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                aria-label={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                {isSidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
              </button>

              {/* Main Diff Code Display */}
              <DiffViewer
                files={activeSession.files}
                activeFile={activeFile}
                info={activeSession.info}
                token={token}
                baseSha={activeSession.baseSha}
                headSha={activeSession.headSha}
              />
            </>
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
