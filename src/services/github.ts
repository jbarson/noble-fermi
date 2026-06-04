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

export interface DiffSession {
  info: GitHubUrlInfo;
  files: FileChange[];
  baseSha?: string;
  headSha?: string;
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
