// Utilities
export * from './lib/utils';

// Button (includes shortcut prop + success/warning variants)
export { Button, buttonVariants } from './components/ui/button';
export type { ButtonProps } from './components/ui/button';

// Input — accessible, supports label / error / icon slots
export { Input } from './components/ui/input';
export type { InputProps } from './components/ui/input';

// Card — default / glass / elevated variants
export {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
    cardVariants,
} from './components/ui/card';
export type { CardProps } from './components/ui/card';

// Modal — thin Radix Dialog wrapper with header/footer/size API
export {
    Modal,
    Dialog,
    DialogTrigger,
    DialogClose,
    DialogOverlay,
    DialogContent,
} from './components/ui/modal';

// DataTable — TanStack Table wrapper with keyboard nav + pagination
export { DataTable } from './components/ui/data-table';
export type { DataTableProps, ColumnDef } from './components/ui/data-table';
