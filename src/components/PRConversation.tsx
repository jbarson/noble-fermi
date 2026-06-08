import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  GitCommit, 
  CheckCircle2, 
  XCircle, 
  MessageSquare, 
  GitMerge, 
  GitPullRequest, 
  RefreshCw, 
  AlertTriangle, 
  Users, 
  ChevronDown,
  Bold,
  Italic,
  Heading,
  Quote,
  Code,
  Link,
  List,
  ListOrdered,
  Image as ImageIcon,
  AtSign
} from "lucide-react";
import { fetchPRTimeline, postPRComment, closePullRequest, fetchUserProfile } from "../services/github";
import type { TimelineEvent, PRMetadata } from "../services/github";

interface PRConversationProps {
  owner: string;
  repo: string;
  prNumber: number;
  token: string;
  prMetadata: PRMetadata;
  onRefreshMetadata?: () => void;
  onOpenTokenModal?: () => void;
}

export function PRConversation({ 
  owner, 
  repo, 
  prNumber, 
  token, 
  prMetadata,
  onRefreshMetadata,
  onOpenTokenModal
}: PRConversationProps) {
  console.log("PRConversation prMetadata:", prMetadata);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCommits, setExpandedCommits] = useState<Record<string, boolean>>({});

  const [currentUser, setCurrentUser] = useState<{ login: string; avatar_url: string } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.resolve().then(async () => {
      if (!token) {
        setCurrentUser(null);
        return;
      }
      try {
        const profile = await fetchUserProfile(token);
        setCurrentUser(profile);
      } catch (err) {
        console.error("Failed to fetch user profile", err);
      }
    });
  }, [token]);

  const loadTimeline = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const events = await fetchPRTimeline(owner, repo, prNumber, token);
      setTimeline(events);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load pull request timeline.");
    } finally {
      setIsLoading(false);
    }
  }, [owner, repo, prNumber, token]);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadTimeline();
    });
  }, [loadTimeline]);

  const toggleCommitExpand = useCallback((sha: string) => {
    if (!sha) return;
    setExpandedCommits((prev) => ({
      ...prev,
      [sha]: prev[sha] !== undefined ? !prev[sha] : false,
    }));
  }, []);

  const insertMarkdown = useCallback((format: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let prefix = "";
    let suffix = "";
    let placeholder = "";

    switch (format) {
      case "bold":
        prefix = "**";
        suffix = "**";
        placeholder = "bold text";
        break;
      case "italic":
        prefix = "*";
        suffix = "*";
        placeholder = "italic text";
        break;
      case "heading":
        prefix = "### ";
        suffix = "";
        placeholder = "Heading";
        break;
      case "quote":
        prefix = "> ";
        suffix = "";
        placeholder = "Quote";
        break;
      case "code":
        prefix = "`";
        suffix = "`";
        placeholder = "code";
        break;
      case "link":
        prefix = "[";
        suffix = "](https://example.com)";
        placeholder = "link text";
        break;
      case "image":
        prefix = "![";
        suffix = "](url)";
        placeholder = "Image alt";
        break;
      case "list":
        prefix = "- ";
        suffix = "";
        placeholder = "List item";
        break;
      case "list-ordered":
        prefix = "1. ";
        suffix = "";
        placeholder = "List item";
        break;
      case "mention":
        prefix = "@";
        suffix = "";
        placeholder = "username";
        break;
      default:
        break;
    }

    const insertedText = selected || placeholder;
    const newText = text.substring(0, start) + prefix + insertedText + suffix + text.substring(end);
    setCommentText(newText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newStart = start + prefix.length;
        const newEnd = newStart + insertedText.length;
        textareaRef.current.setSelectionRange(newStart, newEnd);
      }
    }, 0);
  }, []);

  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target?.result;
      if (typeof base64Data === "string") {
        const textarea = textareaRef.current;
        const start = textarea ? textarea.selectionStart : commentText.length;
        const end = textarea ? textarea.selectionEnd : commentText.length;
        
        const imageMarkdown = `\n![${file.name}](${base64Data})\n`;
        const newText = commentText.substring(0, start) + imageMarkdown + commentText.substring(end);
        setCommentText(newText);

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const newPos = start + imageMarkdown.length;
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      }
    };
    reader.onerror = (err) => {
      console.error("Failed to read image file", err);
    };
    reader.readAsDataURL(file);
  }, [commentText]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleImageFile(file);
    }
  }, [handleImageFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      if (file.type.startsWith("image/")) {
        e.preventDefault();
        handleImageFile(file);
      }
    }
  }, [handleImageFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleImageFile(file);
      e.target.value = "";
    }
  }, [handleImageFile]);

  const handleCommentSubmit = useCallback(async () => {
    if (!commentText.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await postPRComment(owner, repo, prNumber, commentText, token);
      setCommentText("");
      setActiveTab("write");
      await loadTimeline();
      if (onRefreshMetadata) {
        onRefreshMetadata();
      }
    } catch (err) {
      console.error(err);
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [owner, repo, prNumber, commentText, token, loadTimeline, onRefreshMetadata]);

  const handleClosePRSubmit = useCallback(async () => {
    setIsClosing(true);
    setSubmitError(null);
    try {
      if (commentText.trim()) {
        await postPRComment(owner, repo, prNumber, commentText, token);
        setCommentText("");
        setActiveTab("write");
      }
      await closePullRequest(owner, repo, prNumber, token);
      await loadTimeline();
      if (onRefreshMetadata) {
        onRefreshMetadata();
      }
    } catch (err) {
      console.error(err);
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsClosing(false);
    }
  }, [owner, repo, prNumber, commentText, token, loadTimeline, onRefreshMetadata]);


  const getRelativeTime = (dateStr: string | undefined) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return dateStr;
      }
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      
      if (diffMs < 0) return "just now";
      
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return dateStr;
    }
  };

  const parseTextDecorations = (text: string, partIndex: number): React.ReactNode => {
    const regex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3|(!?)\[([^\]]*)\]\(([^)]+)\)/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let keyIdx = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        elements.push(text.substring(lastIndex, match.index));
      }

      if (match[1]) {
        elements.push(
          <strong key={`bold-${partIndex}-${keyIdx++}`}>
            {parseTextDecorations(match[2], partIndex + 1)}
          </strong>
        );
      } else if (match[3]) {
        elements.push(
          <em key={`italic-${partIndex}-${keyIdx++}`}>
            {parseTextDecorations(match[4], partIndex + 1)}
          </em>
        );
      } else if (match[6] !== undefined && match[7] !== undefined) {
        const isImage = match[5] === "!";
        const label = match[6];
        const url = match[7];

        if (isImage) {
          elements.push(
            <img 
              key={`image-${partIndex}-${keyIdx++}`} 
              src={url} 
              alt={label} 
              className="formatted-image"
            />
          );
        } else {
          elements.push(
            <a 
              key={`link-${partIndex}-${keyIdx++}`} 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              {label}
            </a>
          );
        }
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      elements.push(text.substring(lastIndex));
    }

    return <span key={`decorations-${partIndex}`}>{elements}</span>;
  };

  const parseInlineMarkdown = (text: string): React.ReactNode[] => {
    const parts = text.split("`");
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <code key={`code-${i}`}>{part}</code>;
      }
      return parseTextDecorations(part, i);
    });
  };

  const renderFormattedBody = (text: string | null) => {
    if (!text) return <p className="body-empty">No description provided.</p>;

    const lines = text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").split("\n");
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];
    let inBlockquote = false;
    let blockquoteText: string[] = [];
    let inCodeBlock = false;
    let codeBlockText: string[] = [];
    let codeBlockLang = "";

    const flushList = (key: number) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${key}`} className="formatted-list">
            {listItems.map((item, idx) => (
              <li key={idx}>{parseInlineMarkdown(item)}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    const flushBlockquote = (key: number) => {
      if (blockquoteText.length > 0) {
        elements.push(
          <blockquote key={`quote-${key}`} className="formatted-quote">
            {blockquoteText.map((line, idx) => (
              <p key={idx}>{parseInlineMarkdown(line)}</p>
            ))}
          </blockquote>
        );
        blockquoteText = [];
        inBlockquote = false;
      }
    };

    const flushCodeBlock = (key: number) => {
      if (codeBlockText.length > 0) {
        elements.push(
          <pre key={`code-${key}`} className="formatted-pre-block">
            <code className={codeBlockLang ? `language-${codeBlockLang}` : ""}>
              {codeBlockText.join("\n")}
            </code>
          </pre>
        );
        codeBlockText = [];
        inCodeBlock = false;
        codeBlockLang = "";
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Check code blocks
      if (trimmed.startsWith("```")) {
        flushList(index);
        flushBlockquote(index);
        
        if (inCodeBlock) {
          flushCodeBlock(index);
        } else {
          inCodeBlock = true;
          codeBlockLang = trimmed.slice(3).trim();
        }
        return;
      }

      if (inCodeBlock) {
        // We preserve original spaces inside code blocks
        // But trim carriage returns if present
        const cleanLine = line.endsWith("\r") ? line.slice(0, -1) : line;
        codeBlockText.push(cleanLine);
        return;
      }

      if (trimmed.startsWith(">")) {
        flushList(index);
        inBlockquote = true;
        blockquoteText.push(trimmed.slice(1).trim());
        return;
      } else if (inBlockquote && !trimmed.startsWith(">") && trimmed.length > 0) {
        blockquoteText.push(trimmed);
        return;
      } else if (inBlockquote) {
        flushBlockquote(index);
      }

      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        listItems.push(trimmed.slice(2));
        return;
      } else {
        flushList(index);
      }

      if (trimmed.startsWith("### ")) {
        elements.push(<h4 key={index} className="formatted-h4">{parseInlineMarkdown(trimmed.slice(4))}</h4>);
      } else if (trimmed.startsWith("## ")) {
        elements.push(<h3 key={index} className="formatted-h3">{parseInlineMarkdown(trimmed.slice(3))}</h3>);
      } else if (trimmed.startsWith("# ")) {
        elements.push(<h2 key={index} className="formatted-h2">{parseInlineMarkdown(trimmed.slice(2))}</h2>);
      } else if (trimmed.length === 0) {
        // Empty space
      } else {
        elements.push(<p key={index} className="formatted-p">{parseInlineMarkdown(trimmed)}</p>);
      }
    });

    flushList(lines.length);
    flushBlockquote(lines.length);
    flushCodeBlock(lines.length);

    return <div className="formatted-markdown">{elements}</div>;
  };

  return (
    <div className="pr-conversation-container">
      <div className="conversation-feed">
        {/* Main PR Description Comment */}
        <div className="timeline-comment-card main-description glass-card">
          <div className="comment-header">
            <img 
              src={prMetadata.user.avatar_url} 
              alt={prMetadata.user.login} 
              className="comment-author-avatar" 
            />
            <div className="comment-meta-info">
              <span className="comment-author-name">@{prMetadata.user.login}</span>
              <span className="comment-date">opened this PR {getRelativeTime(prMetadata.created_at)}</span>
            </div>
            <div className="comment-badge author-badge">Author</div>
          </div>
          <div className="comment-body">
            {renderFormattedBody(prMetadata.body)}
          </div>
        </div>

        {/* Timeline Events divider line */}
        <div className="timeline-divider-line"></div>

        {/* Timeline Events Feed */}
        {isLoading ? (
          <div className="timeline-loading">
            <RefreshCw size={24} className="spin" />
            <span>Loading discussion timeline...</span>
          </div>
        ) : error ? (
          <div className="timeline-error glass-card">
            <AlertTriangle size={20} />
            <span>{error}</span>
            <button onClick={loadTimeline} className="btn btn-secondary flex-center-gap" style={{ marginTop: "12px" }}>
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        ) : timeline.length === 0 ? (
          <div className="timeline-empty">
            <MessageSquare size={32} style={{ opacity: 0.3 }} />
            <span>No comments or activity on this pull request yet.</span>
          </div>
        ) : (
          <div className="timeline-events-list">
            {timeline.map((event, idx) => {
              const eventId = event.id || idx;

              switch (event.event) {
                case "commented":
                  if (!event.body) return null;
                  return (
                    <div key={`event-commented-${eventId}`} className="timeline-comment-card glass-card">
                      <div className="comment-header">
                        <img 
                          src={event.actor?.avatar_url} 
                          alt={event.actor?.login} 
                          className="comment-author-avatar" 
                        />
                        <div className="comment-meta-info">
                          <span className="comment-author-name">@{event.actor?.login}</span>
                          <span className="comment-date">commented {getRelativeTime(event.created_at)}</span>
                        </div>
                        {event.actor?.login === prMetadata.user.login && (
                          <div className="comment-badge author-badge">Author</div>
                        )}
                      </div>
                      <div className="comment-body">
                        {renderFormattedBody(event.body)}
                      </div>
                    </div>
                  );

                case "committed": {
                  const sha = event.sha || event.commit_id || "";
                  const shortSha = sha.substring(0, 7);
                  const commitMsg = event.message || "";
                  const rawLines = commitMsg.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r/g, "").split("\n");
                  const subject = rawLines[0] || "";
                  const body = rawLines.slice(1).join("\n").trim();
                  const hasBody = body.length > 0;
                  const isExpanded = expandedCommits[sha] !== undefined ? expandedCommits[sha] : true;
                  const commitDate = event.created_at || event.author?.date || event.committer?.date || "";

                  return (
                    <div key={`event-committed-${eventId}`} className="timeline-commit-group">
                      <div className="timeline-row-event commit-header-event">
                        <div className="event-icon-badge commit-badge">
                          <GitCommit size={14} />
                        </div>
                        <div className="event-detail-text">
                          <span className="commit-message" title={subject}>
                            {subject}
                          </span>
                          {hasBody && (
                            <button
                              onClick={() => toggleCommitExpand(sha)}
                              className="commit-expand-btn"
                              aria-label={isExpanded ? "Collapse commit body" : "Expand commit body"}
                              title={isExpanded ? "Collapse commit body" : "Expand commit body"}
                            >
                              ...
                            </button>
                          )}
                        </div>
                        <span className="commit-sha-badge">
                          {shortSha}
                        </span>
                        <span className="event-time-stamp">{getRelativeTime(commitDate)}</span>
                      </div>
                      {hasBody && isExpanded && (
                        <div className="timeline-comment-card commit-body-card glass-card">
                          <div className="comment-body">
                            {renderFormattedBody(body)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                case "reviewed": {
                  const isApproved = event.state?.toLowerCase() === "approved";
                  const isChangesRequested = event.state?.toLowerCase() === "changes_requested";
                  
                  let reviewClass = "reviewed-commented";
                  let reviewLabel = "reviewed";
                  let reviewIcon = <MessageSquare size={14} />;

                  if (isApproved) {
                    reviewClass = "reviewed-approved";
                    reviewLabel = "approved these changes";
                    reviewIcon = <CheckCircle2 size={14} />;
                  } else if (isChangesRequested) {
                    reviewClass = "reviewed-changes-requested";
                    reviewLabel = "requested changes";
                    reviewIcon = <XCircle size={14} />;
                  }

                  return (
                    <div key={`event-reviewed-${eventId}`} className="timeline-review-group">
                      <div className={`timeline-row-event review-header-event ${reviewClass}`}>
                        <div className="event-icon-badge">
                          {reviewIcon}
                        </div>
                        <div className="event-detail-text">
                          <strong>@{event.user?.login}</strong> {reviewLabel}
                        </div>
                        <span className="event-time-stamp">{getRelativeTime(event.submitted_at || event.created_at)}</span>
                      </div>
                      {event.body && event.body.trim().length > 0 && (
                        <div className="timeline-comment-card review-comment-card glass-card">
                          <div className="comment-body">
                            {renderFormattedBody(event.body)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                case "merged":
                  return (
                    <div key={`event-merged-${eventId}`} className="timeline-row-event state-change-event merged">
                      <div className="event-icon-badge">
                        <GitMerge size={14} />
                      </div>
                      <div className="event-detail-text">
                        <strong>@{event.actor?.login}</strong> merged commit <code className="inline-code">{(event.commit_id || "").substring(0, 7)}</code> into <code>{prMetadata.base.ref}</code>
                      </div>
                      <span className="event-time-stamp">{getRelativeTime(event.created_at)}</span>
                    </div>
                  );

                case "closed":
                  return (
                    <div key={`event-closed-${eventId}`} className="timeline-row-event state-change-event closed">
                      <div className="event-icon-badge">
                        <XCircle size={14} />
                      </div>
                      <div className="event-detail-text">
                        <strong>@{event.actor?.login}</strong> closed this pull request
                      </div>
                      <span className="event-time-stamp">{getRelativeTime(event.created_at)}</span>
                    </div>
                  );

                case "reopened":
                  return (
                    <div key={`event-reopened-${eventId}`} className="timeline-row-event state-change-event reopened">
                      <div className="event-icon-badge">
                        <GitPullRequest size={14} />
                      </div>
                      <div className="event-detail-text">
                        <strong>@{event.actor?.login}</strong> reopened this pull request
                      </div>
                      <span className="event-time-stamp">{getRelativeTime(event.created_at)}</span>
                    </div>
                  );

                case "review_requested":
                  return (
                    <div key={`event-review-requested-${eventId}`} className="timeline-row-event info-event">
                      <div className="event-icon-badge">
                        <Users size={14} />
                      </div>
                      <div className="event-detail-text">
                        <strong>@{event.actor?.login}</strong> requested a review from <strong>@{event.requested_reviewer?.login || "someone"}</strong>
                      </div>
                      <span className="event-time-stamp">{getRelativeTime(event.created_at)}</span>
                    </div>
                  );

                default:
                  // Simple fallback rendering for other issues/timeline events
                  if (!event.event) return null;
                  return (
                    <div key={`event-fallback-${eventId}`} className="timeline-row-event info-event">
                      <div className="event-icon-badge">
                        <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
                      </div>
                      <div className="event-detail-text">
                        <strong>@{event.actor?.login || "someone"}</strong> {event.event.replace(/_/g, " ")}
                      </div>
                      <span className="event-time-stamp">{getRelativeTime(event.created_at)}</span>
                    </div>
                  );
              }
            })}
          </div>
        )}

        {/* Add Comment Section */}
        <div className="composer-timeline-row">
          <div className="composer-avatar-column">
            <img 
              src={currentUser?.avatar_url || "https://github.com/identicons/placeholder.png"} 
              alt={currentUser?.login || "User"} 
              className="composer-author-avatar" 
            />
          </div>
          
          <div className="composer-card-column">
            <div className="comment-composer-wrapper glass-card">
              {!token ? (
                <div className="composer-token-warning">
                  <AlertTriangle size={20} className="warning-icon" />
                  <p>You must configure a GitHub Personal Access Token to comment or close this pull request.</p>
                  <button onClick={onOpenTokenModal} className="btn btn-primary" style={{ marginTop: "8px" }}>
                    Configure Token
                  </button>
                </div>
              ) : (
                <>
                  <div className="composer-header-tabs-row">
                    <div className="composer-tabs">
                      <button 
                        className={`composer-tab-btn ${activeTab === "write" ? "active" : ""}`}
                        onClick={() => setActiveTab("write")}
                        type="button"
                      >
                        Write
                      </button>
                      <button 
                        className={`composer-tab-btn ${activeTab === "preview" ? "active" : ""}`}
                        onClick={() => setActiveTab("preview")}
                        type="button"
                      >
                        Preview
                      </button>
                    </div>

                    {activeTab === "write" && (
                      <div className="composer-toolbar">
                        <button onClick={() => insertMarkdown("heading")} title="Add heading" type="button"><Heading size={15} /></button>
                        <button onClick={() => insertMarkdown("bold")} title="Add bold text" type="button"><Bold size={15} /></button>
                        <button onClick={() => insertMarkdown("italic")} title="Add italic text" type="button"><Italic size={15} /></button>
                        <div className="toolbar-divider" />
                        <button onClick={() => insertMarkdown("quote")} title="Insert quote" type="button"><Quote size={15} /></button>
                        <button onClick={() => insertMarkdown("code")} title="Insert code" type="button"><Code size={15} /></button>
                        <button onClick={() => insertMarkdown("link")} title="Add a link" type="button"><Link size={15} /></button>
                        <div className="toolbar-divider" />
                        <button onClick={() => insertMarkdown("list")} title="Add a bullet list" type="button"><List size={15} /></button>
                        <button onClick={() => insertMarkdown("list-ordered")} title="Add a numbered list" type="button"><ListOrdered size={15} /></button>
                        <button onClick={() => insertMarkdown("image")} title="Add an image link" type="button"><ImageIcon size={15} /></button>
                        <button onClick={() => insertMarkdown("mention")} title="Mention a user" type="button"><AtSign size={15} /></button>
                      </div>
                    )}
                  </div>

                  <div className="composer-body-container">
                    {activeTab === "write" ? (
                      <div 
                        className={`textarea-drag-drop-zone ${isDragOver ? "drag-over" : ""}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <textarea
                          ref={textareaRef}
                          className="composer-textarea"
                          placeholder="Add your comment here... (Paste, drop, or click below to attach images)"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          onPaste={handlePaste}
                        />
                        <div className="drag-drop-overlay-msg">
                          <span>Drop image to insert</span>
                        </div>
                      </div>
                    ) : (
                      <div className="composer-preview-area formatted-markdown">
                        {renderFormattedBody(commentText)}
                      </div>
                    )}
                  </div>

                  <div className="composer-footer">
                    <div className="composer-footer-info">
                      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" className="markdown-icon" style={{ fill: "currentColor" }}>
                        <path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.69C0 12.48.52 13 1.15 13h13.69c.63 0 1.15-.52 1.15-1.15v-7.7C16 3.52 15.48 3 14.85 3zM9 11H7V8L5.5 9.78 4 8v3H2V5h2l1.5 1.8L7 5h2v6zm5.2-3h-1.6v3h-1.7V8h-1.6l2.45-3 2.45 3z"></path>
                      </svg>
                      <span>Markdown is supported</span>
                    </div>
                    
                    <button 
                      type="button" 
                      className="composer-upload-trigger-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon size={14} />
                      <span>Attach files by pasting, dropping, or clicking here</span>
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept="image/*" 
                      style={{ display: "none" }} 
                    />
                  </div>
                </>
              )}
            </div>

            {token && (
              <div className="composer-actions">
                {submitError && <div className="composer-submit-error">{submitError}</div>}
                
                {prMetadata.state === "open" && (
                  <button
                    onClick={handleClosePRSubmit}
                    disabled={isSubmitting || isClosing}
                    className="btn btn-secondary btn-close-pr flex-center-gap"
                    type="button"
                  >
                    {isClosing ? <RefreshCw size={14} className="spin" /> : <XCircle size={14} />}
                    <span>{commentText.trim() ? "Close with comment" : "Close pull request"}</span>
                  </button>
                )}

                <button
                  onClick={handleCommentSubmit}
                  disabled={isSubmitting || isClosing || !commentText.trim()}
                  className="btn btn-success btn-post-comment flex-center-gap"
                  type="button"
                >
                  {isSubmitting ? <RefreshCw size={14} className="spin" /> : <MessageSquare size={14} />}
                  <span>Comment</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
