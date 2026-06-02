import { useState, useMemo } from "react";
import { Folder, ChevronDown, ChevronRight, Search, FileCode } from "lucide-react";
import type { FileChange } from "../services/github";

interface SidebarTreeProps {
  files: FileChange[];
  activeFile: FileChange | null;
  onSelectFile: (file: FileChange) => void;
  isCollapsed: boolean;
}

interface TreeItem {
  name: string;
  path: string;
  isFolder: boolean;
  children: Map<string, TreeItem>;
  file?: FileChange;
}

export function SidebarTree({ files, activeFile, onSelectFile, isCollapsed }: SidebarTreeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Parse files into a hierarchical tree structure
  const fileTree = useMemo(() => {
    const root: TreeItem = { name: "root", path: "", isFolder: true, children: new Map() };

    // Filter files based on search query
    const filteredFiles = files.filter((f) =>
      f.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    for (const file of filteredFiles) {
      const parts = file.filename.split("/");
      let current = root;
      let currentPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = i === parts.length - 1;

        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: currentPath,
            isFolder: !isLast,
            children: new Map(),
            file: isLast ? file : undefined,
          });
        }
        current = current.children.get(part)!;
      }
    }

    return root;
  }, [files, searchQuery]);

  const toggleFolder = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
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

  const renderTree = (node: TreeItem, depth = 0) => {
    // Sort directories first, then files alphabetically
    const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    return sortedChildren.map((item) => {
      if (item.isFolder) {
        // Expand folders by default, unless collapsed by user
        const isExpanded = expandedFolders[item.path] !== false;
        
        return (
          <div key={item.path} style={{ userSelect: "none" }}>
            <div
              className="file-node-item"
              onClick={(e) => toggleFolder(item.path, e)}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              <div className="file-info">
                {isExpanded ? (
                  <ChevronDown size={14} className="text-secondary" />
                ) : (
                  <ChevronRight size={14} className="text-secondary" />
                )}
                <Folder size={14} className="text-primary" style={{ fill: "currentColor", fillOpacity: 0.1 }} />
                <span className="file-name" style={{ fontWeight: 500 }}>{item.name}</span>
              </div>
            </div>
            {isExpanded && renderTree(item, depth + 1)}
          </div>
        );
      } else {
        const isActive = activeFile?.filename === item.file?.filename;
        const fileStatus = item.file?.status || "modified";

        return (
          <div
            key={item.path}
            className={`file-node-item ${isActive ? "active" : ""}`}
            onClick={() => item.file && onSelectFile(item.file)}
            style={{ paddingLeft: `${depth * 12 + 16}px` }}
          >
            <div className="file-info">
              <FileCode size={14} className={isActive ? "text-primary" : "text-secondary"} />
              <span className="file-name">{item.name}</span>
            </div>
            <div className={getStatusClass(fileStatus)} title={fileStatus}>
              {getStatusLetter(fileStatus)}
            </div>
          </div>
        );
      }
    });
  };

  return (
    <aside className={`sidebar glass-panel ${isCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-title">
          <h3>Files Changed</h3>
          <span className="badge badge-success" style={{ fontSize: "9px" }}>
            {files.length} {files.length === 1 ? "File" : "Files"}
          </span>
        </div>
        <div className="sidebar-search">
          <Search className="search-icon" size={14} />
          <input
            type="text"
            placeholder="Filter files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="sidebar-tree-container">
        {files.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
            No files modified.
          </div>
        ) : (
          renderTree(fileTree)
        )}
      </div>
    </aside>
  );
}
