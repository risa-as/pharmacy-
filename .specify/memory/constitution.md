<!--
SYNC IMPACT REPORT
==================
Version change: [PLACEHOLDER] → 1.0.0 (initial ratification)
Modified principles: N/A — initial creation from template
Added sections:
  - Core Principles (6 principles: I–VI)
  - Technology Stack
  - Development Workflow
  - Governance
Removed sections: N/A — initial creation
Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check gates populated
  ✅ .specify/templates/tasks-template.md — Sync-impact note and monorepo paths added
  ✅ .specify/templates/spec-template.md — Platform/offline constraints note added
  ⚠  .specify/templates/agent-file-template.md — Pending runtime agent file population
Deferred TODOs: None
-->

# Faramace Constitution

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)

Every feature MUST have an approved `spec.md` before any implementation begins.
No production code MUST be written without a corresponding spec entry that has been
reviewed. The mandatory workflow is:

1. `/speckit.specify` — create/update `spec.md`
2. `/speckit.plan` — produce research, data model, contracts
3. `/speckit.tasks` — generate dependency-ordered `tasks.md`
4. `/speckit.implement` (or manual) — execute tasks in order

Skipping or reordering these steps is PROHIBITED. Prototype/spike code is permitted
in throwaway branches only and MUST NOT be merged without a full spec cycle.

**Rationale**: Three concurrent platforms (web, mobile, desktop) magnify the cost
of rework. Specs prevent divergent assumptions before code is written.

### II. Offline-First for Desktop

The Electron desktop POS MUST function fully without network connectivity. All
data operations MUST succeed against the local SQLite database first. Synchronisation
to the cloud (PostgreSQL) MUST be eventual and non-blocking. The UI MUST never block
on a network call. Background sync status MUST be surfaced to the user in a
non-intrusive, always-visible indicator.

Any feature that touches the desktop POS MUST document its offline behaviour in the
spec (`spec.md`) and its sync strategy in the plan (`plan.md`).

**Rationale**: Pharmacy point-of-sale cannot have availability tied to connectivity.
A network outage MUST never halt a sale or corrupt local data.

### III. Platform-Appropriate Security & Storage

Each platform MUST use its prescribed authentication and sensitive-data storage:

- **Desktop (Electron)**: Auth credentials and API keys MUST use OS-level secure
  storage (e.g., `electron-store` with encryption or the system keychain). Plain
  JSON config files MUST NOT store secrets.
- **Mobile (Expo)**: Auth tokens MUST be stored exclusively in `expo-secure-store`.
  `AsyncStorage` MUST NOT be used for any security-sensitive value.
- **Web (Next.js)**: Sessions MUST be managed server-side via NextAuth.js. Sensitive
  data MUST NOT be stored in `localStorage` or unencrypted cookies.

Cross-platform token sharing or reuse MUST go through the cloud API, never through
shared file paths or environment variables visible to the renderer process.

**Rationale**: Each platform has a distinct threat model. Mixing storage strategies
introduces vulnerabilities and violates least-privilege principles.

### IV. Monorepo Discipline

All packages MUST reside under `apps/*` or `packages/*` in the pnpm workspace.
Shared code MUST live in a named package (e.g., `packages/shared`); direct cross-app
imports (e.g., `import from '../../desktop/...'`) are PROHIBITED.

- Package manager: **pnpm only**. `npm` and `yarn` MUST NOT be used at any scope.
- Workspace root installs: `pnpm add <pkg> -w`
- App-scoped installs: `pnpm add <pkg> --filter <workspace-name>`
- Shared package installs: `pnpm add <pkg> --filter shared`

New apps or packages added to the monorepo MUST be registered in `pnpm-workspace.yaml`
and `turbo.json` before any code is written.

**Rationale**: Strict workspace boundaries prevent circular dependencies and ensure
reproducible builds via pnpm's deterministic lockfile.

### V. Schema as Single Source of Truth

Prisma `schema.prisma` files are the canonical definition for all data models. No
ad-hoc SQL, no schema-bypassing raw queries for entities that Prisma manages.

- Cloud (Web): `apps/web/prisma/schema.prisma` — PostgreSQL provider.
- Desktop: `apps/desktop/prisma/schema.prisma` — SQLite provider.
- Migrations MUST be generated via `prisma migrate dev` (dev) and applied via
  `prisma migrate deploy` (production/CI).
- Synced entities MUST have structurally identical fields in both schemas. Deviations
  (e.g., desktop-only local fields) MUST be documented in `packages/shared`.

Any feature that introduces a new synced entity MUST include migrations for both
schemas as part of its task list.

**Rationale**: Dual-database architecture amplifies drift risk. A single schema
authority prevents sync conflicts and data-loss bugs.

### VI. UI Consistency via TailwindCSS

All user interfaces across all platforms MUST use TailwindCSS for styling:

- **Web/Desktop**: `tailwind.config.ts` per app; extend from a shared base config
  in `packages/shared` where design tokens are common.
- **Mobile**: NativeWind MUST be used as the TailwindCSS adapter for Expo.
- Inline `style={{}}` props are PROHIBITED except for values that are dynamically
  computed at runtime and cannot be expressed as Tailwind utilities.
- Component-level CSS modules are PROHIBITED. Global CSS additions to `globals.css`
  MUST be minimal and justified.

**Rationale**: Three separate apps risk visual divergence. TailwindCSS with a shared
token base enforces a coherent design language at near-zero overhead.

## Technology Stack

| Layer | Web (`apps/web`) | Mobile (`apps/mobile`) | Desktop (`apps/desktop`) |
|-------|-----------------|----------------------|--------------------------|
| Framework | Next.js (App Router) | Expo (React Native) | Electron + React |
| Database | PostgreSQL via Prisma | API-backed (no local DB) | SQLite via Prisma |
| Auth | NextAuth.js | JWT in SecureStore | Local session (encrypted store) |
| Styling | TailwindCSS | NativeWind (TailwindCSS) | TailwindCSS |
| Package manager | pnpm | pnpm | pnpm |
| Build pipeline | turbo | turbo | turbo + electron-builder |

Adding or replacing any entry in this table constitutes a MINOR amendment (or MAJOR
if a removal). All changes MUST follow the amendment procedure below.

## Development Workflow

1. **Spec First** — Run `/speckit.specify` before creating a feature branch.
2. **Plan** — Run `/speckit.plan`; research, data model, and contracts MUST be
   complete before tasks are generated.
3. **Tasks** — Run `/speckit.tasks`; output is a dependency-ordered `tasks.md`.
4. **Implement** — Run `/speckit.implement` or execute tasks manually in order.
   No task MUST be started unless its declared prerequisites are complete.
5. **Sync Awareness** — Any task touching a synced entity MUST carry a
   `[SYNC-IMPACT]` label and include both cloud and desktop migration tasks.
6. **PR Gate** — Every PR MUST reference its `spec.md`; reviewers MUST verify all
   Constitution Check gates in `plan.md` are marked satisfied before merging.

## Governance

This constitution supersedes all other project conventions. In any conflict, the
constitution takes precedence over READMEs, comments, or verbal agreements.

**Amendment Procedure**:
1. Open a dedicated PR with the proposed change and a written rationale.
2. All active contributors MUST review and approve.
3. Bump `CONSTITUTION_VERSION` per the versioning policy below.
4. Update `LAST_AMENDED_DATE` to today's ISO date.
5. Propagate changes to all affected templates and agent-guidance files.
6. Add an entry to the Sync Impact Report (HTML comment at top of this file).

**Versioning Policy**:
- **MAJOR**: Removal or incompatible redefinition of an existing principle.
- **MINOR**: New principle, new section, or material guidance expansion.
- **PATCH**: Clarifications, wording improvements, typo fixes.

**Compliance Review**: Every PR review MUST include a Constitution Check (see the
`plan.md` Constitution Check section for the active gate list). Non-compliant PRs
MUST NOT be merged without an exception documented in the PR description and approved
by at least one other contributor.

**Version**: 1.0.0 | **Ratified**: 2026-02-23 | **Last Amended**: 2026-02-23
