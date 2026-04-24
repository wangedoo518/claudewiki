---
title: Desktop Shell Architecture Overview
doc_type: architecture
status: active
owner: desktop-shell
last_verified: 2026-04-24
source_of_truth: true
related:
  - docs/desktop-shell/README.md
  - docs/superpowers/specs/2026-04-06-desktop-shell-architecture-refactor-design.md
---

# Desktop Shell Architecture Overview

This document answers: how `desktop-shell` is currently organized.

## Application Layers

- App shell and routing
- Feature modules
- Neutral API clients under `apps/desktop-shell/src/api/` for cross-feature HTTP/SSE surfaces
- Shared UI and utility layer
- Desktop integration layer

## State Ownership

- Router owns navigational identity.
- TanStack Query owns remote state.
- Zustand owns local application state under `apps/desktop-shell/src/state/`.
- Persisted Zustand domains currently include `settings`, `command-palette`, and `wiki-tabs`.
- `ask-ui`, `permissions`, `skill-store`, and `streaming-store` are in-memory UI/runtime stores and are not persisted.
- Wiki maintenance progress is delivered through `/api/wiki/absorb/events`, a session-agnostic SSE stream backed by desktop-core SKILL events.

## Change Policy

If these boundaries change, update this document in the same change set.
