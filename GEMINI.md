# GEMINI.md: AI Developer Guide for Noble Fermi

Welcome! This guide outlines the project structure, design patterns, core functionalities, and strict styling and linting guidelines to accelerate development and prevent common pitfalls when working on `noble-fermi`.

---

## 🏗️ Architecture & Core Technologies

`Noble Fermi` is a premium, high-fidelity web client for reviewing GitHub pull requests, commits, and compare ranges. It is built as a single-page React app styled with pure CSS (no Tailwind CSS, except if explicitly requested).

### Core Stack
*   **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
*   **Build System**: [Vite 8](https://vite.dev/)
*   **Diff & Render Engine**: 
    *   `@pierre/diffs` (specifically `parsePatchFiles` and `parseDiffFromFile`)
    *   `@pierre/diffs/react` (the `<FileDiff />` component)
*   **Syntax Highlighter**: [Shiki](https://shiki.style/) (which drives `<FileDiff />` style configurations)
*   **Icons**: [Lucide React](https://lucide.dev/)
*   **Theme/Styles**: Vanilla CSS custom properties with Glassmorphism layouts.

---

## 📁 Directory Structure & File Map

```text
/noble-fermi
├── src/
│   ├── components/
│   │   ├── DiffViewer.tsx    # Diff styling, Shiki settings, and inline threads
│   │   ├── Navbar.tsx        # Top navigation, status indicator & token config trigger
│   │   ├── SidebarTree.tsx   # Collapsible hierarchical folder tree of files changed
│   │   ├── TokenModal.tsx    # Modal dialog for inputting and saving GitHub PATs
│   │   └── UrlInput.tsx      # Welcome/Search screen for inputting a GitHub resource URL
│   ├── hooks/
│   │   └── useLocalStorage.ts # Custom hook for synchronizing state with browser storage
│   ├── services/
│   │   └── github.ts         # GitHub REST API integrations and URL parser helper
│   ├── App.tsx               # Central router, state controller, and shell layout
│   ├── index.css             # Main stylesheet (color variables, typography, layouts)
│   └── main.tsx              # React mounting root
├── package.json              # Script shortcuts and project dependencies
└── tsconfig.json             # TypeScript configuration
```

---

## ⚡ Core Data Flows & Logic

### 1. URL Parsing & Resource Type Identification
*   **Location**: `src/services/github.ts` -> [parseGitHubUrl](file:///Users/jon/Dev/noble-fermi/src/services/github.ts#L34-L68)
*   **Function**: Splits the hostname and pathname to verify if the URL belongs to GitHub and extracts the `owner`, `repo`, and `resourceType` (`pull` | `commit` | `compare`).
*   **Edge Case**: Rejects URLs that point directly to repository homepages or branches without differences to render.

### 2. GitHub Authentication
*   **Location**: `src/App.tsx` -> [App](file:///Users/jon/Dev/noble-fermi/src/App.tsx#L12) and `src/components/TokenModal.tsx`
*   **Logic**: Personal Access Tokens (PATs) are saved via `useLocalStorage` under the key `github-pat`. When available, they are attached to headers (`Authorization: Bearer <token>`).
*   **API Limits**: Unauthenticated requests to GitHub are limited to **60/hour** (tied to IP). Authenticated requests allow up to **5,000/hour**.

### 3. Diff Rendering Path (Fast & Slow Paths)
*   **Location**: `src/components/DiffViewer.tsx` -> [loadDiff](file:///Users/jon/Dev/noble-fermi/src/components/DiffViewer.tsx#L60-L118)
*   *Fast Path*: If the file payload from GitHub contains a `.patch` block, the viewer attempts to wrap it in a mock git patch header and parse it using `parsePatchFiles`.
*   *Slow/High-Fidelity Path*: If the fast path fails or `.patch` is empty, it makes parallel requests to fetch the raw contents of the file at both the `baseSha` and the `headSha` using [fetchFileContent](file:///Users/jon/Dev/noble-fermi/src/services/github.ts#L178-L194). The content strings are then computed into a diff using `parseDiffFromFile`.

### 4. Gutter Comment Threads & Persistent Drafts
*   **Location**: `src/components/DiffViewer.tsx` -> [handleLineClick](file:///Users/jon/Dev/noble-fermi/src/components/DiffViewer.tsx#L125-L145)
*   **Interaction**: Click any line number inside the `<FileDiff />` component to add a draft comment block at that specific line.
*   **Persistence**: Comments are stored in `localStorage` under `diff-comments` and scoped uniquely by a `sessionKey` (defined as `owner/repo/resourceType/id`) and the file `filename` to prevent collisions.

---

## 🛠️ Commands & Verification

Use the following commands from the root directory during development:

```bash
# Start Vite development server
npm run dev

# Lint files with strict TypeScript/ESLint guidelines
npm run lint

# Build for production distribution (compiles TS files first)
npm run build
```

---

## ⚠️ Linting Guidelines & Common Warnings

The project has extremely strict linting guidelines. Failing to follow these rules will fail the `npm run lint` step.

### 1. Do Not Use `any` Types
*   Avoid declaring variables, arguments, or objects as `any`.
*   *Fix*: Define exact TypeScript interfaces or fallback to `unknown` if the format is dynamic.
*   *Example Error*: `Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any`

### 2. Avoid Synchronous State Updates Inside Effects
*   Calling state setters synchronously during an effect run can cause cascading renders.
*   *Fix*: Perform state checks, use refs, or update state inside asynchronous callbacks (like promises / `fetch` resolution paths) rather than directly in the synchronous block of `useEffect`.
*   *Example Error*: `Avoid calling setState() directly within an effect  react-hooks/set-state-in-effect`

### 3. Caught Errors Require a `cause` Property
*   When catching errors and throwing custom errors, you must forward the original error under the `cause` option to preserve debugability.
*   *Fix*: `throw new Error("Message", { cause: error });`
*   *Example Error*: `There is no 'cause' attached to the symptom error being thrown  preserve-caught-error`

---

## 🎨 Styling Guidelines & UI Theme
*   **Design Paradigm**: Modern Glassmorphism. Features blurred backdrops (`backdrop-filter: blur()`), glowing borders, and rich dark hues.
*   **Theme Integration**: The application tracks a custom `data-theme` attribute on the `<html>` or `.app-container` element.
*   **Colors & Properties**: Use the predefined CSS custom properties inside `src/index.css` (e.g. `var(--text-primary)`, `var(--bg-glass)`, `var(--border)`). Do not hardcode hex/RGB values.
