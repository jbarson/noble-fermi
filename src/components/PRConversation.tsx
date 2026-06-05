import React, { useState, useEffect, useCallback } from "react";
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
  ChevronDown 
} from "lucide-react";
import { fetchPRTimeline } from "../services/github";
import type { TimelineEvent, PRMetadata } from "../services/github";

interface PRConversationProps {
  owner: string;
  repo: string;
  prNumber: number;
  token: string;
  prMetadata: PRMetadata;
}

export function PRConversation({ owner, repo, prNumber, token, prMetadata }: PRConversationProps) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCommits, setExpandedCommits] = useState<Record<string, boolean>>({});

  const toggleCommitExpand = useCallback((sha: string) => {
    if (!sha) return;
    setExpandedCommits((prev) => ({
      ...prev,
      [sha]: !prev[sha],
    }));
  }, []);

  const loadTimeline = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const events = await fetchPRTimeline(owner, repo, prNumber, token);
      // Filter out empty events or duplicates
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

  const getRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
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
    const regex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3|\[([^\]]+)\]\(([^)]+)\)/g;
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
      } else if (match[5]) {
        elements.push(
          <a 
            key={`link-${partIndex}-${keyIdx++}`} 
            href={match[6]} 
            target="_blank" 
            rel="noopener noreferrer"
          >
            {match[5]}
          </a>
        );
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
                  const rawLines = commitMsg.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").split("\n");
                  const subject = rawLines[0] || "";
                  const body = rawLines.slice(1).join("\n").trim();
                  const hasBody = body.length > 0;
                  const isExpanded = !!expandedCommits[sha];

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
                        <span className="event-time-stamp">{getRelativeTime(event.created_at)}</span>
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
      </div>
    </div>
  );
}
