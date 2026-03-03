# Feature Specification: Dynamic Subscription Engine & Tenant Management

**Feature Branch**: `004-dynamic-subscriptions`
**Created**: 2026-02-26
**Status**: Ready for Planning

## User Scenarios & Testing

### User Story 1 - Subscription Plan CRUD (Priority: P1)
As a SUPER_ADMIN, I want to create, read, update, and deactivate Subscription Plans so that I can dynamically control the pricing and limits available to organizations.

**Why this priority**: Without dynamic plans, no organizations can be assigned to them, blocking all other features.

**Independent Test**: Navigate to `/dashboard/admin/plans`. Create a new plan "Ramadan Offer". Deactivate an old plan. Verify the changes persist in the database.

**Acceptance Scenarios**:
1. **Given** the system has no active plans, **When** the SUPER_ADMIN creates a new plan specifying limits and price, **Then** the plan appears in the active plans list and is stored in the database.
2. **Given** an existing plan, **When** the SUPER_ADMIN deactivates it, **Then** it is no longer available for new organizations to select, but existing organizations remain unaffected until changed.

### User Story 2 - Tenant Management with Dynamic Plans (Priority: P1)
As a SUPER_ADMIN, I want to assign dynamic plans to new or existing organizations and optionally override their limits, so I can handle tailored enterprise deals. 

**Why this priority**: Required to actually use the plans created in US1 and complete the tenant onboarding process.

**Independent Test**: Navigate to `/dashboard/tenants`. Open the Create/Edit form. The Plan dropdown populates from the DB. Selecting a plan auto-fills `maxBranches` and `maxUsers`, which can then be manually overridden before saving.

**Acceptance Scenarios**:
1. **Given** the organization form, **When** the SUPER_ADMIN selects a plan from the dropdown, **Then** the default `maxBranches` and `maxUsers` for that plan are populated into the input fields.
2. **Given** populated default limits, **When** the SUPER_ADMIN modifies these values and saves, **Then** the organization is created/updated with the custom limits instead of the strict plan defaults.
3. **Given** the tenant list, **When** viewing the table, **Then** the assigned Plan Name, real-time Status, and Expiry Date are clearly displayed for each organization.

### User Story 3 - Emergency DRM Controls (Priority: P2)
As a SUPER_ADMIN, I want emergency Suspend/Reactivate buttons on the tenant list to immediately kill or restore an organization's access and cascade to all their device licenses.

**Why this priority**: Allows immediate action against malicious or non-paying tenants without navigating deep into edit forms.

**Independent Test**: Click "Suspend" on an active organization in the tenant list. Verify the organization and all its device licenses become inactive instantly.

**Acceptance Scenarios**:
1. **Given** an active organization, **When** the SUPER_ADMIN clicks "Suspend" from the table, **Then** the DRM cascade kills all licenses and the tenant status immediately shows as "Suspended".
2. **Given** a suspended organization, **When** the SUPER_ADMIN clicks "Reactivate", **Then** the organization and its previously active licenses are restored.

### User Story 4 - Dynamic Iron Wall Enforcement (Priority: P1)
As the system, I must enforce branch and user limits based on the organization's dynamic plan (or custom overrides) to ensure tenants cannot exceed what they pay for.

**Why this priority**: Secures the business model. Without this, the UI limits are meaningless.

**Independent Test**: Attempt to create a branch via API when the organization has reached the `maxBranches` defined in its database record. It must return a 403 Forbidden.

**Acceptance Scenarios**:
1. **Given** an organization at its custom branch limit, **When** a user attempts to add a branch, **Then** the API rejects the request using dynamic limit values rather than the legacy Enum defaults.

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide a Prisma model `SubscriptionPlan` containing `id`, `name`, `price`, `maxBranches`, `maxUsers`, `features` (JSON layout), and `isActive`.
- **FR-002**: System MUST link the `Organization` model to `SubscriptionPlan` via a `planId` relation, replacing the hardcoded `plan` Enum.
- **FR-003**: System MUST retain the `maxBranches` and `maxUsers` fields natively on `Organization` to support custom overrides.
- **FR-004**: System MUST provide a Plan Management UI at `/dashboard/admin/plans` allowing SUPER_ADMIN full CRUD on `SubscriptionPlan`.
- **FR-005**: System MUST provide a Tenant Management UI at `/dashboard/tenants` showing a data table with Organization Name, Plan Name, Status, and Expiry Date.
- **FR-006**: System MUST ensure the Plan dropdown in the Organization Create/Edit form dynamically fetches active plans from the DB.
- **FR-007**: System MUST auto-populate the form's `maxBranches` and `maxUsers` when a plan is selected, while keeping the fields editable by SUPER_ADMIN.
- **FR-008**: System MUST provide inline "Suspend" and "Reactivate" actions on the tenant table rows that instantly trigger the organization suspension and license DRM cascade.
- **FR-009**: System MUST enforce resource limits in `lib/saas-guards.ts` by checking the dynamically stored `maxBranches` and `maxUsers` on the `Organization` record.

### Key Entities

- **SubscriptionPlan**: Represents a tier of service with default quotas and pricing.
- **Organization**: A tenant using the software, linked to a SubscriptionPlan, possessing its own (potentially overridden) quotas.

### Assumptions

- Existing organizations currently using the hardcoded Enum will need a database migration to map them to newly created equivalent `SubscriptionPlan` records.
- Deactivating a `SubscriptionPlan` prevents new organizations from selecting it, but does not break or alter organizations already assigned to it.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of organization resource limits are evaluated against database-backed values rather than hardcoded Enums.
- **SC-002**: SUPER_ADMIN can create and assign a completely new plan to an organization in less than 2 minutes without deploying any code.
- **SC-003**: Emergency suspension of a tenant via the list table executes in under 2 seconds, providing immediate visual feedback.
- **SC-004**: System handles API limit checks dynamically with no noticeable performance degradation (under 50ms query overhead).
