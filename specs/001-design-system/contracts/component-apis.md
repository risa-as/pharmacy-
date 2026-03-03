# Contract: Shared UI Component APIs

**Package**: `packages/ui`
**Export path**: `@faramace/ui`
**Version**: 1.0.0 | **Date**: 2026-02-23

This contract defines the public API surface for all five foundational shared components.
Consumers (Web and Desktop apps) MUST use these interfaces. The contract is the source of
truth for the plan and tasks phases.

---

## Package Entry Point

```typescript
// packages/ui/src/index.ts — complete public exports after implementation

// Utilities
export { cn } from './lib/utils';

// Components
export { Button, buttonVariants }    from './components/ui/button';
export { Input }                     from './components/ui/input';
export { Card, CardHeader, CardTitle,
         CardDescription, CardContent,
         CardFooter }                from './components/ui/card';
export { Modal }                     from './components/ui/modal';
export { DataTable }                 from './components/ui/data-table';
export type { ColumnDef }            from '@tanstack/react-table';  // re-export for consumers
```

---

## Component 1: Button

**File**: `packages/ui/src/components/ui/button.tsx` *(extending existing)*

```typescript
import type { VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
          VariantProps<typeof buttonVariants> {
  /** Render as a child element (Radix Slot). Useful for Link wrapping. */
  asChild?: boolean;
  /**
   * Keyboard shortcut badge displayed on the button.
   * Example: shortcut="F4" renders a small badge "F4" on the button surface.
   * MUST NOT replace the button label — it is additive only.
   */
  shortcut?: string;
}

export declare const buttonVariants: (props?: {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary'
           | 'ghost' | 'link' | 'success' | 'warning';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}) => string;
```

**New variants added** (beyond existing):
- `success`: `bg-success text-success-foreground`
- `warning`: `bg-warning text-warning-foreground`

**Shortcut badge rendering rule**: When `shortcut` is provided, render a `<kbd>` element
inside the button to the right of the label, styled with:
`ml-2 text-[0.65rem] font-mono opacity-70 border border-current/30 rounded px-1`

---

## Component 2: Input

**File**: `packages/ui/src/components/ui/input.tsx` *(new)*

```typescript
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Accessible label. Rendered as <label> associated via htmlFor. */
  label?: string;
  /** Helper text displayed below the input in normal state. */
  hint?: string;
  /**
   * Error message. When present, overrides hint text and applies error styles
   * (red border, red helper text). ARIA: sets aria-invalid="true".
   */
  error?: string;
  /** Icon or element rendered inside the left edge of the input. */
  leftIcon?: ReactNode;
  /** Icon or element rendered inside the right edge of the input. */
  rightIcon?: ReactNode;
  /** Height preset. */
  size?: 'sm' | 'default' | 'lg';
}
```

**Behaviour contract**:
- MUST use `<label>` with `htmlFor` linked to input `id` when `label` is present.
- MUST apply `border-destructive ring-destructive` when `error` is truthy.
- MUST set `aria-invalid="true"` and `aria-describedby` pointing to error element when
  `error` is truthy.
- MUST inherit all native `<input>` props via spread.
- Focus ring MUST use `ring-ring/20` (2px transparent ring + 1px border = clear focus).

---

## Component 3: Card (with sub-components)

**File**: `packages/ui/src/components/ui/card.tsx` *(new)*

```typescript
import type { ElementType, HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * 'default'  — solid card background (bg-card border border-border)
   * 'glass'    — glassmorphism surface (backdrop-blur-md bg-card/15 border-border/20)
   *              falls back to bg-card/80 if backdrop-filter unsupported
   * 'elevated' — raised card with shadow (shadow-lg)
   */
  variant?: 'default' | 'glass' | 'elevated';
  /** Internal padding preset. */
  padding?: 'none' | 'sm' | 'default' | 'lg';
  /** Render as a different HTML element. */
  as?: ElementType;
}

// Sub-components — composable card anatomy
export declare const CardHeader: React.FC<HTMLAttributes<HTMLDivElement>>;
export declare const CardTitle:  React.FC<HTMLAttributes<HTMLHeadingElement>>;
export declare const CardDescription: React.FC<HTMLAttributes<HTMLParagraphElement>>;
export declare const CardContent: React.FC<HTMLAttributes<HTMLDivElement>>;
export declare const CardFooter: React.FC<HTMLAttributes<HTMLDivElement>>;
```

**Usage example**:
```tsx
<Card variant="glass" padding="default">
  <CardHeader>
    <CardTitle>Revenue Today</CardTitle>
    <CardDescription>Updated every minute</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-3xl font-bold">1,250,000 د.ع</p>
  </CardContent>
</Card>
```

---

## Component 4: Modal

**File**: `packages/ui/src/components/ui/modal.tsx` *(new)*
**Built on**: `@radix-ui/react-dialog`

```typescript
import type { ReactNode } from 'react';

export interface ModalProps {
  /** Controlled open state. */
  open: boolean;
  /** Called when user closes the modal (Escape, overlay click, × button). */
  onOpenChange: (open: boolean) => void;
  /** Modal heading — rendered in a visually hidden DialogTitle for screen readers. */
  title: string;
  /** Optional subtitle below the title. */
  description?: string;
  /**
   * Width preset:
   * 'sm'   = max-w-sm  (~384px)
   * 'default' = max-w-lg (~512px)
   * 'lg'   = max-w-2xl (~672px)
   * 'full' = max-w-[95vw]
   */
  size?: 'sm' | 'default' | 'lg' | 'full';
  /** Modal body content. */
  children: ReactNode;
  /** Footer content (typically action buttons). Rendered below a divider. */
  footer?: ReactNode;
  /** Hide the × close button in the top-right corner. */
  hideClose?: boolean;
}
```

**Behaviour contract**:
- MUST trap focus within the modal while open (Radix handles this via `FocusScope`).
- MUST close on `Escape` key press (Radix `Dialog` built-in).
- MUST close on overlay (backdrop) click (Radix default, can be overridden by
  `onPointerDownOutside={(e) => e.preventDefault()}` on the content).
- MUST restore focus to the previously focused element on close (Radix built-in).
- Overlay MUST be `bg-background/80 backdrop-blur-sm`.
- Animation: enter with `fade-in + slide-up-4`, exit with `fade-out + slide-down-4`
  (Tailwind `data-[state=open]` / `data-[state=closed]` variants).

---

## Component 5: DataTable

**File**: `packages/ui/src/components/ui/data-table.tsx` *(new)*
**Built on**: `@tanstack/react-table` (headless table logic)

```typescript
import type { ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';

export interface PaginationConfig {
  /** Page size (rows per page). */
  pageSize: number;
  /** Zero-based current page index. */
  pageIndex: number;
  /** Total row count (required for server-side pagination; use data.length for client). */
  total: number;
  /** Called when user changes page. */
  onPageChange: (pageIndex: number) => void;
}

export interface DataTableProps<TData extends object> {
  /** TanStack Table column definitions. Re-exported as `ColumnDef` from @faramace/ui. */
  columns: ColumnDef<TData>[];
  /** Row data array. */
  data: TData[];
  /** Show skeleton loading state (3 ghost rows). */
  loading?: boolean;
  /**
   * Message shown when data is empty.
   * Default: 'لا توجد بيانات' (Arabic: No data available)
   */
  emptyMessage?: string;
  /**
   * Called when a row is clicked or activated via Enter key.
   * Receives the row data object.
   */
  onRowClick?: (row: TData) => void;
  /**
   * Field name used as React key for rows.
   * Default: 'id'
   */
  rowKeyField?: keyof TData;
  /** Pin header row when scrolling. */
  stickyHeader?: boolean;
  /** Client or server-side pagination config. Omit for no pagination. */
  pagination?: PaginationConfig;
}
```

**Behaviour contract**:
- MUST support full keyboard navigation:
  - `Tab` / `Shift+Tab` → move between table rows.
  - `↑` / `↓` → move between rows (when table is focused).
  - `Enter` → trigger `onRowClick` on focused row.
  - `Escape` → blur table, return focus to last focused element outside table.
- MUST render a visible focus ring on the focused row.
- MUST render a stable "no data" empty state when `data.length === 0` and `loading` is false.
  Empty state MUST be visually styled (icon + message, centred) — not a blank area.
- `loading` MUST render 3 skeleton rows matching the column count.
- Row `onClick` and `onKeyDown` (Enter) MUST call the same `onRowClick` handler.
- MUST support dark mode automatically via token classes (no manual theme prop).

---

## New Dependencies Required

| Package | Version | Where | Purpose |
|---------|---------|-------|---------|
| `@radix-ui/react-dialog` | `^1.1.0` | `packages/ui` | Modal (focus trap, Escape close) |
| `@radix-ui/react-label` | `^2.1.0` | `packages/ui` | Input accessible label |
| `@tanstack/react-table` | `^8.17.0` | `packages/ui` | DataTable headless logic |
| `recharts` | `^2.12.0` | `apps/web` | Interactive dashboard charts |
| `react-hotkeys-hook` | `^4.5.0` | `apps/desktop` | POS keyboard shortcuts |

---

## Keyboard Shortcut Contract (Desktop POS)

All shortcuts MUST be registered using `react-hotkeys-hook`. The hook MUST be called
with `{ scopes: ['pos'] }` to prevent leaking into other screens.

```typescript
// Contract: POS shortcut registration
const POS_SHORTCUTS: Record<string, { key: string; description: string }> = {
  FOCUS_SEARCH:     { key: 'f2',      description: 'البحث عن دواء' },
  APPLY_DISCOUNT:   { key: 'f3',      description: 'تطبيق خصم' },
  OPEN_CHECKOUT:    { key: 'f4',      description: 'الدفع والتسوية' },
  CANCEL_SALE:      { key: 'f5',      description: 'إلغاء البيع' },
  RETURN_MODE:      { key: 'f6',      description: 'إرجاع / استرجاع' },
  PRINT_RECEIPT:    { key: 'f8',      description: 'طباعة الفاتورة' },
  HELP_PANEL:       { key: 'f1',      description: 'اختصارات لوحة المفاتيح' },
  ADD_TOP_RESULT:   { key: 'enter',   description: 'إضافة أول نتيجة' },  // in search field only
  CLOSE_MODAL:      { key: 'escape',  description: 'إغلاق / رجوع' },
  QTY_INCREMENT:    { key: '+',       description: 'زيادة الكمية' },      // in cart row focus only
  QTY_DECREMENT:    { key: '-',       description: 'تقليل الكمية' },      // in cart row focus only
};
```

Every `Button` component used for these actions MUST receive the corresponding
`shortcut` prop so the key badge is visible on screen.
