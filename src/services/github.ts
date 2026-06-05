export interface GitHubUrlInfo {
  owner: string;
  repo: string;
  resourceType: "pull" | "commit" | "compare" | "repo";
  id: string; // PR number, commit SHA, compare range, or branch
}

export interface FileChange {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
  blob_url: string;
}

export interface PRMetadata {
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  base: {
    ref: string;
    repo: {
      full_name: string;
    };
  };
  head: {
    ref: string;
    repo: {
      full_name: string;
    };
  };
  additions: number;
  deletions: number;
  changed_files: number;
  comments: number;
}

export interface DiffSession {
  info: GitHubUrlInfo;
  files: FileChange[];
  baseSha?: string;
  headSha?: string;
  prMetadata?: PRMetadata;
}

/**
 * Parses a GitHub URL into structured components.
 * Supports:
 * - https://github.com/owner/repo/pull/123
 * - https://github.com/owner/repo/commit/abcdef
 * - https://github.com/owner/repo/compare/branchA...branchB
 * - https://github.com/owner/repo
 */
export function parseGitHubUrl(urlStr: string): GitHubUrlInfo | null {
  try {
    let cleanUrl = urlStr.trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = "https://" + cleanUrl;
    }
    const url = new URL(cleanUrl);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      return null;
    }

    const paths = url.pathname.split("/").filter(Boolean);
    if (paths.length < 2) return null;

    const owner = paths[0];
    const repo = paths[1];

    if (paths.length === 2) {
      return { owner, repo, resourceType: "repo", id: "" };
    }

    const type = paths[2];
    if (type === "pull" && paths[3]) {
      return { owner, repo, resourceType: "pull", id: paths[3] };
    } else if (type === "commit" && paths[3]) {
      return { owner, repo, resourceType: "commit", id: paths[3] };
    } else if (type === "compare" && paths[3]) {
      return { owner, repo, resourceType: "compare", id: paths[3] };
    }

    return { owner, repo, resourceType: "repo", id: "" };
  } catch {
    return null;
  }
}

/**
 * Creates headers for GitHub API requests.
 */
function getHeaders(token?: string, raw: boolean = false): HeadersInit {
  const headers: Record<string, string> = {
    Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token && token.trim()) {
    headers["Authorization"] = `Bearer ${token.trim()}`;
  }
  return headers;
}

/**
 * Error handling helper.
 */
async function handleResponse(response: Response) {
  if (!response.ok) {
    let message = `API request failed with status ${response.status}`;
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // ignore
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed or API rate limit exceeded: ${message}. If this is a private repository, please check your Personal Access Token.`);
    }
    throw new Error(message);
  }
}

/**
 * Fetches pull request files and metadata.
 */
async function fetchPullRequest(info: GitHubUrlInfo, token?: string): Promise<DiffSession> {
  const prUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/pulls/${info.id}`;
  const prResponse = await fetch(prUrl, { headers: getHeaders(token) });
  await handleResponse(prResponse);
  const prData = await prResponse.json();

  const filesUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/pulls/${info.id}/files?per_page=300`;
  const filesResponse = await fetch(filesUrl, { headers: getHeaders(token) });
  await handleResponse(filesResponse);
  const filesData = await filesResponse.json();

  return {
    info,
    files: filesData,
    baseSha: prData.base.sha,
    headSha: prData.head.sha,
    prMetadata: {
      title: prData.title,
      body: prData.body,
      state: prData.state,
      merged: prData.merged || false,
      draft: prData.draft || false,
      user: {
        login: prData.user.login,
        avatar_url: prData.user.avatar_url,
      },
      created_at: prData.created_at,
      base: {
        ref: prData.base.ref,
        repo: {
          full_name: prData.base.repo?.full_name || `${info.owner}/${info.repo}`,
        },
      },
      head: {
        ref: prData.head.ref,
        repo: {
          full_name: prData.head.repo?.full_name || `${info.owner}/${info.repo}`,
        },
      },
      additions: prData.additions || 0,
      deletions: prData.deletions || 0,
      changed_files: prData.changed_files || 0,
      comments: prData.comments || 0,
    },
  };
}

/**
 * Fetches commit files and metadata.
 */
async function fetchCommit(info: GitHubUrlInfo, token?: string): Promise<DiffSession> {
  const commitUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/commits/${info.id}`;
  const response = await fetch(commitUrl, { headers: getHeaders(token) });
  await handleResponse(response);
  const data = await response.json();

  return {
    info,
    files: data.files || [],
    baseSha: data.parents?.[0]?.sha || "",
    headSha: data.sha,
  };
}

/**
 * Fetches compare/diff between branches/commits.
 */
async function fetchCompare(info: GitHubUrlInfo, token?: string): Promise<DiffSession> {
  const compareUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/compare/${info.id}`;
  const response = await fetch(compareUrl, { headers: getHeaders(token) });
  await handleResponse(response);
  const data = await response.json();

  return {
    info,
    files: data.files || [],
    baseSha: data.base_commit?.sha || "",
    headSha: data.merge_base_commit?.sha || (data.commits && data.commits.length > 0 ? data.commits[data.commits.length - 1]?.sha : "") || "",
  };
}

/**
 * Unified entry point to fetch GitHub resources.
 */
export async function fetchDiffSession(info: GitHubUrlInfo, token?: string): Promise<DiffSession> {
  switch (info.resourceType) {
    case "pull":
      return fetchPullRequest(info, token);
    case "commit":
      return fetchCommit(info, token);
    case "compare":
      return fetchCompare(info, token);
    default:
      throw new Error(`Unsupported resource type: "${info.resourceType}". Please input a valid GitHub PR, Commit, or Compare URL.`);
  }
}

/**
 * Fetches the raw content of a file at a specific commit SHA/ref.
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token?: string
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`;
  const response = await fetch(url, { headers: getHeaders(token, true) });
  
  if (response.status === 404) {
    return ""; // File doesn't exist at this ref (e.g., added/removed files)
  }
  
  await handleResponse(response);
  return response.text();
}

export interface GraphQLComment {
  id: string;
  body: string;
  createdAt: string;
  author: {
    login: string;
    avatarUrl: string;
  } | null;
}

export interface GraphQLReviewThread {
  id: string;
  path: string;
  line: number;
  diffSide: "LEFT" | "RIGHT";
  comments: {
    nodes: GraphQLComment[];
  };
}

/**
 * Fetches pull request review threads via GitHub GraphQL API.
 */
export async function fetchGraphQLComments(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
): Promise<GraphQLReviewThread[]> {
  if (!token || !token.trim()) {
    // GraphQL API requires authentication
    return [];
  }

  const query = `
    query GetPullRequestComments($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 80) {
            nodes {
              id
              path
              line
              diffSide
              comments(first: 30) {
                nodes {
                  id
                  body
                  createdAt
                  author {
                    login
                    avatarUrl
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const url = "https://api.github.com/graphql";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify({
      query,
      variables: {
        owner,
        repo,
        number: prNumber,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`);
  }

  const result = await response.json();
  if (result.errors && result.errors.length > 0) {
    throw new Error(`GitHub GraphQL Error: ${result.errors[0].message}`);
  }

  const nodes: GraphQLReviewThread[] = result.data?.repository?.pullRequest?.reviewThreads?.nodes || [];
  return nodes.filter((n) => n.line !== null && n.line !== undefined);
}

export interface SearchPRItem {
  id: number;
  title: string;
  html_url: string;
  number: number;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string }>;
  repository_url: string;
}

/**
 * Fetches the authenticated user's profile.
 */
export async function fetchUserProfile(token: string): Promise<{ login: string; avatar_url: string }> {
  const response = await fetch("https://api.github.com/user", {
    headers: getHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: status ${response.status}`);
  }
  return response.json();
}

/**
 * Searches for open PRs created by or assigned to the authenticated user.
 */
export async function fetchUserPRs(username: string, token: string): Promise<SearchPRItem[]> {
  const qAuthor = `type:pr state:open author:${username}`;
  const qAssignee = `type:pr state:open assignee:${username}`;

  const fetchWithQuery = async (query: string): Promise<SearchPRItem[]> => {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100`;
    try {
      const response = await fetch(url, {
        headers: getHeaders(token),
      });
      if (!response.ok) {
        throw new Error(`Failed to search PRs with query "${query}": status ${response.status}`);
      }
      const data = await response.json();
      return data.items || [];
    } catch (err) {
      throw new Error(`Failed to execute search query "${query}"`, { cause: err });
    }
  };

  const [authorItems, assigneeItems] = await Promise.all([
    fetchWithQuery(qAuthor),
    fetchWithQuery(qAssignee),
  ]);

  // Combine and deduplicate by item.id
  const seenIds = new Set<number>();
  const combined: SearchPRItem[] = [];

  for (const item of [...authorItems, ...assigneeItems]) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      combined.push(item);
    }
  }

  // Sort by updated_at descending
  combined.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return combined;
}

export interface TimelineEvent {
  id: number;
  event: string;
  created_at: string;
  actor?: {
    login: string;
    avatar_url: string;
  };
  body?: string;
  commit_id?: string;
  sha?: string;
  message?: string;
  author?: {
    name: string;
    email: string;
  };
  review_requester?: {
    login: string;
  };
  requested_reviewer?: {
    login: string;
  };
  state?: string;
  user?: {
    login: string;
    avatar_url: string;
  };
  body_html?: string;
  submitted_at?: string;
}

/**
 * Fetches the timeline/events for a PR.
 */
export async function fetchPRTimeline(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
): Promise<TimelineEvent[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/timeline?per_page=100`;
  const response = await fetch(url, { headers: getHeaders(token) });
  if (response.status === 404) {
    return [];
  }
  await handleResponse(response);
  return response.json();
}
