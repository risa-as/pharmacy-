# Specification Quality Checklist: SaaS Control Tower & Iron Wall

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-02-25
**Updated**: 2026-02-25 (added Parts C, D, E + PE Recommendations)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs)
- [X] Focused on user value and business needs
- [X] Written for non-technical stakeholders
- [X] All mandatory sections completed

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous
- [X] Success criteria are measurable
- [X] Success criteria are technology-agnostic (no implementation details)
- [X] All acceptance scenarios are defined
- [X] Edge cases are identified
- [X] Scope is clearly bounded
- [X] Dependencies and assumptions identified

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria
- [X] User scenarios cover primary flows
- [X] Feature meets measurable outcomes defined in Success Criteria
- [X] No implementation details leak into specification

## Coverage by Part

| Part | User Stories | FRs | SCs | Status |
|------|-------------|-----|-----|--------|
| A — Control Tower | US1 | FR-001–005 | SC-001–002 | ✓ |
| B — Iron Wall | US2, US3 | FR-006–014 | SC-003–007 | ✓ |
| C — Subscription Timers | US4 | FR-015–023 | SC-008–011 | ✓ |
| D — License Binding | US5 | FR-024–028 | SC-012 | ✓ |
| E — Offline Time-Bomb | US6 | FR-029–035 | SC-013–015 | ✓ |

## Principal Engineer Recommendations Status

| Rec | Risk | Topic | CTO Decision Needed |
|-----|------|--------|-------------------|
| REC-001 | HIGH | Clock rollback: use `lastSeenAt` as second anchor | ✓ Adopted in FR-032 |
| REC-002 | HIGH | Use asymmetric JWT (RS256/ES256) for offline token | ✓ Adopted in FR-030 |
| REC-003 | MEDIUM | Suspended state: allow read-only historical access | ✓ **CTO APPROVED** — FR-021 updated |
| REC-004 | MEDIUM | Grace period blocked ops: canonical list | ✓ **CTO APPROVED** — FR-019 updated |
| REC-005 | MEDIUM | Add `suspendedByOrgSuspension` flag to DeviceLicense | ✓ **CTO APPROVED** — Task 1 in plan |
| REC-006 | MEDIUM | Add `isSuspended` + `suspendedAt` to Organization schema | ✓ **CTO APPROVED** — Task 1 in plan |
| REC-007 | LOW | Grace period abuse prevention (track grace usage count) | ⏳ Deferred to Phase 2 billing |
| REC-008 | LOW | Define acceptable latency for lock-lift after renewal | ✓ Documented in spec assumptions |

## Implementation Status

**COMPLETE** — All 37 tasks (T001–T037) implemented on 2026-02-25.

### Key Architecture Decisions Made During Implementation

- `isSuspended`/`suspendedAt` added to Organization model (schema.prisma updated + db push run).
- `suspendedByOrgSuspension` already existed on DeviceLicense in the current schema (confirmed at line 870).
- Subscription state and plan limits are sourced from the `Tenant` model (has `maxBranches`, `maxUsers`, `subscriptionEndsAt`, `isSuspended`) — NOT the `Organization` model.
- TODO: Add `tenantId` FK to `Organization` to link each pharmacy to its Tenant plan record.
- Branch/user creation enforcement is in Server Actions (`branch.ts`, `create-user-safe.ts`), not API routes, matching the actual codebase architecture.
- Offline token endpoint uses `branchId`+`licenseKey` query params (matching existing sync API pattern) since desktop sync doesn't use JWT auth headers.
- `OFFLINE_TOKEN_PRIVATE_KEY` env var must be set before the offline token endpoint can issue tokens.
