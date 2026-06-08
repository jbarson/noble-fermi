# noble-fermi Domain Context

This document outlines the core domain concepts and terminology for `noble-fermi`, a premium, high-fidelity visual workspace for reviewing GitHub differences.

## Language

**Diff Session**:
The active workspace representing the set of files and differences changed in a specific GitHub pull request, commit, or branch comparison.
_Avoid_: Review session, workspace loader

**Session Key**:
A unique identifier for a Diff Session, formatted as `owner/repo/resourceType/id` (e.g. `jbarson/noble-fermi/pull/3`).
_Avoid_: Session ID, target string

**Annotation**:
An inline feedback item (either a published comment or a temporary draft) attached to a specific file, diff side, and line number.
_Avoid_: Gutter item, inline note

**Draft**:
An unsaved, in-progress annotation currently being composed locally by the reviewer.
_Avoid_: Pending comment, buffer

**Comment**:
A published and saved annotation, which can be retrieved from GitHub's remote API or loaded from local cache.
_Avoid_: Post, reply

**Thread**:
A collection of annotations (comments and/or drafts) grouped together at the exact same file, side, and line number.
_Avoid_: Comment list, visual card
