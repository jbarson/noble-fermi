import { Sun, Moon, Key, GitCompare, Check, AlertCircle } from "lucide-react";

interface NavbarProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  token: string;
  onOpenTokenModal: () => void;
  onReset: () => void;
}

export function Navbar({ theme, onToggleTheme, token, onOpenTokenModal, onReset }: NavbarProps) {
  const isAuthenticated = !!token && token.trim().length > 0;

  return (
    <header className="navbar glass-panel">
      <div className="nav-brand" onClick={onReset}>
        <div className="nav-logo-icon">
          <GitCompare size={20} />
        </div>
        <span>CodeGlass</span>
      </div>

      <div className="nav-controls">
        {isAuthenticated ? (
          <div className="badge badge-success flex-center-gap" onClick={onOpenTokenModal} style={{ cursor: "pointer" }}>
            <Check size={12} />
            <span>Authenticated</span>
          </div>
        ) : (
          <div className="badge badge-warning flex-center-gap" onClick={onOpenTokenModal} style={{ cursor: "pointer" }}>
            <AlertCircle size={12} />
            <span>Public Only</span>
          </div>
        )}

        <button
          onClick={onOpenTokenModal}
          className="btn btn-secondary flex-center-gap"
          title="Configure GitHub Token"
        >
          <Key size={16} />
          <span style={{ display: "inline" }}>Token</span>
        </button>

        <button
          onClick={onToggleTheme}
          className="btn btn-secondary btn-icon"
          aria-label="Toggle visual theme"
          title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>
    </header>
  );
}
