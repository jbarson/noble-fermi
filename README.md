# Noble Fermi: High-Fidelity GitHub Diff & Review Client

`Noble Fermi` is a premium, high-fidelity web client for viewing and reviewing GitHub pull requests, commits, and compare ranges. Designed with a modern, glassmorphic dark-mode aesthetic, it provides developers with a powerful, interactive visual review workspace.

![Vite](https://img.shields.io/badge/Vite-8A2BE2?style=for-the-badge&logo=vite&logoColor=FFD700)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![GitHub API](https://img.shields.io/badge/GitHub_API-181717?style=for-the-badge&logo=github&logoColor=white)

---

## 🌟 Key Features

### 📁 Collapsible Hierarchical Sidebar
- Maps changed files into a dynamic nested folder tree interface.
- Distinct color-coded status badges for **Added (A)**, **Modified (M)**, **Deleted (D)**, and **Renamed (R)** files.
- Integrated search bar to filter changes instantly.
- The entire sidebar tree transitions smoothly from `320px` to `0px` with a highly polished sliding animation.

### 🔍 Advanced Diff Layouts
- Switch dynamically between **Split (Side-by-Side)** and **Unified** views.
- High-fidelity syntax highlighting powered by **Shiki**.
- Selectable custom styling themes: *GitHub Dark, GitHub Light, Dracula, and Solarized Light*.
- Toggable word wrap option for long lines of code.

### 💬 Persistent Inline Commenting Threads
- **Visual Gutter Click**: Click any line number in either column (additions or deletions) to instantly open an inline form under that exact line.
- **Unified Thread Mapping**: Comments and new draft boxes on the same line are grouped together into a single cohesive visual feed card.
- **LocalStorage Persistence**: Comments are persisted across sessions and scoped dynamically by repository, PR/Commit URL, and filename to prevent any collision.
- Lucide-backed delete buttons and premium visual initial-based user avatars.

---

## 🛠️ Technology Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 8](https://vite.dev/)
- **Diff Engine**: [@pierre/diffs](https://github.com/pierre-co/diffs)
- **Highlighter**: [Shiki](https://shiki.style/) (for premium syntax highlighting engine)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Styling**: Vanilla CSS3 Custom Variables (featuring dynamic Glassmorphism layouts, light/dark themes, and micro-transitions)

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (v18+) and `npm` installed.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jbarson/noble-fermi.git
   cd noble-fermi
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

---

## 📖 How to Use

1. **Configure Token (Optional)**: If you are reviewing private repositories or want to avoid GitHub's API rate limits, click **Configure Token** in the navbar to securely save a GitHub Personal Access Token (PAT). It is stored solely in your local browser storage.
2. **Review a Session**: Paste any public or private GitHub pull request, commit, or branch compare URL in the home screen input, for example:
   - PR: `https://github.com/owner/repo/pull/12`
   - Commit: `https://github.com/owner/repo/commit/a8f902c`
   - Compare: `https://github.com/owner/repo/compare/main...feature-branch`
3. **Draft Inline Feedback**: Click any line number in the diff panel gutter, draft your message inside the smooth textarea, and save!
