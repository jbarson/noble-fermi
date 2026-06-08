import React from "react";
import ReactDOMServer from "react-dom/server";

const markdown = `## Overview
This PR replaces the default landing page (\`UrlInput\`) with a unified PR Review Dashboard. The dashboard automatically displays all open pull requests created by or assigned to the authenticated user, grouped by GitHub organization. One-off repository review search remains available as a secondary input at the top.

## Key Changes
- **Parallel Search Queries**: Resolved GitHub Search API 422 validation errors by splitting the complex query into parallel \`author\` and \`assignee\` requests, merging and deduplicating results.
- **Collapsible Grouping**: Groups PR cards under organization headers. Headers display the PR count, toggle list visibility, and feature a rotation chevron indicator.
- **State Persistence**: The collapsed/expanded state of each organization is persisted client-side in \`localStorage\` across page refreshes.
- **Glassmorphic Styling**: Appended dark glassmorphic cards, list layouts, and smooth transition animations matching the core application themes.`;

const parseTextDecorations = (text, partIndex) => {
  const regex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3|\[([^\]]+)\]\(([^)]+)\)/g;
  const elements = [];
  let lastIndex = 0;
  let match;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.substring(lastIndex, match.index));
    }

    if (match[1]) {
      elements.push(
        React.createElement(
          "strong",
          { key: `bold-${partIndex}-${keyIdx++}` },
          parseTextDecorations(match[2], partIndex + 1)
        )
      );
    } else if (match[3]) {
      elements.push(
        React.createElement(
          "em",
          { key: `italic-${partIndex}-${keyIdx++}` },
          parseTextDecorations(match[4], partIndex + 1)
        )
      );
    } else if (match[5]) {
      elements.push(
        React.createElement(
          "a",
          {
            key: `link-${partIndex}-${keyIdx++}`,
            href: match[6],
            target: "_blank",
            rel: "noopener noreferrer"
          },
          match[5]
        )
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }

  return React.createElement("span", { key: `decorations-${partIndex}` }, elements);
};

const parseInlineMarkdown = (text) => {
  const parts = text.split("`");
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return React.createElement("code", { key: `code-${i}` }, part);
    }
    return parseTextDecorations(part, i);
  });
};

const renderFormattedBody = (text) => {
  if (!text) return React.createElement("p", { className: "body-empty" }, "No description provided.");

  const lines = text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").split("\n");
  const elements = [];
  let listItems = [];
  let inBlockquote = false;
  let blockquoteText = [];
  let inCodeBlock = false;
  let codeBlockText = [];
  let codeBlockLang = "";

  const flushList = (key) => {
    if (listItems.length > 0) {
      elements.push(
        React.createElement(
          "ul",
          { key: `list-${key}`, className: "formatted-list" },
          listItems.map((item, idx) =>
            React.createElement("li", { key: idx }, parseInlineMarkdown(item))
          )
        )
      );
      listItems = [];
    }
  };

  const flushBlockquote = (key) => {
    if (blockquoteText.length > 0) {
      elements.push(
        React.createElement(
          "blockquote",
          { key: `quote-${key}`, className: "formatted-quote" },
          blockquoteText.map((line, idx) =>
            React.createElement("p", { key: idx }, parseInlineMarkdown(line))
          )
        )
      );
      blockquoteText = [];
      inBlockquote = false;
    }
  };

  const flushCodeBlock = (key) => {
    if (codeBlockText.length > 0) {
      elements.push(
        React.createElement(
          "pre",
          { key: `code-${key}`, className: "formatted-pre-block" },
          React.createElement(
            "code",
            { className: codeBlockLang ? `language-${codeBlockLang}` : "" },
            codeBlockText.join("\n")
          )
        )
      );
      codeBlockText = [];
      inCodeBlock = false;
      codeBlockLang = "";
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

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
      elements.push(
        React.createElement("h4", { key: index, className: "formatted-h4" }, parseInlineMarkdown(trimmed.slice(4)))
      );
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        React.createElement("h3", { key: index, className: "formatted-h3" }, parseInlineMarkdown(trimmed.slice(3)))
      );
    } else if (trimmed.startsWith("# ")) {
      elements.push(
        React.createElement("h2", { key: index, className: "formatted-h2" }, parseInlineMarkdown(trimmed.slice(2)))
      );
    } else if (trimmed.length === 0) {
      // ignore
    } else {
      elements.push(
        React.createElement("p", { key: index, className: "formatted-p" }, parseInlineMarkdown(trimmed))
      );
    }
  });

  flushList(lines.length);
  flushBlockquote(lines.length);
  flushCodeBlock(lines.length);

  return React.createElement("div", { className: "formatted-markdown" }, elements);
};

const html = ReactDOMServer.renderToStaticMarkup(renderFormattedBody(markdown));
console.log(html);
