'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

const Dialog    = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose   = DialogPrimitive.Close;
const DialogPortal  = DialogPrimitive.Portal;

/* ── Overlay ─────────────────────────────────────────────────────────── */
const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm',
            'transition-opacity duration-150',
            'data-[state=open]:opacity-100 data-[state=closed]:opacity-0',
            className,
        )}
        {...props}
    />
));
DialogOverlay.displayName = 'DialogOverlay';

/* ── Content ──────────────────────────────────────────────────────────── */
const sizeMap = {
    sm:      'max-w-sm',
    default: 'max-w-lg',
    lg:      'max-w-2xl',
    full:    'max-w-[95vw]',
} as const;

interface DialogContentProps
    extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
    /** Dialog title — required for accessibility */
    title: string;
    /** Optional subtitle shown below the title */
    description?: string;
    /** Size variant */
    size?: keyof typeof sizeMap;
    /** Content rendered in the sticky footer row */
    footer?: React.ReactNode;
    /** Hide the × close button */
    hideClose?: boolean;
}

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    DialogContentProps
>(({ className, size = 'default', title, description, footer, hideClose, children, ...props }, ref) => (
    <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
            ref={ref}
            className={cn(
                'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2',
                'bg-card border border-border text-card-foreground shadow-xl rounded-xl',
                'focus:outline-none',
                'transition-all duration-200',
                'data-[state=open]:opacity-100 data-[state=open]:scale-100',
                'data-[state=closed]:opacity-0 data-[state=closed]:scale-95',
                sizeMap[size],
                className,
            )}
            {...props}
        >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-border gap-4">
                <div>
                    <DialogPrimitive.Title className="text-lg font-semibold leading-none text-foreground">
                        {title}
                    </DialogPrimitive.Title>
                    {description && (
                        <DialogPrimitive.Description className="text-sm text-muted-foreground mt-1">
                            {description}
                        </DialogPrimitive.Description>
                    )}
                </div>
                {!hideClose && (
                    <DialogClose
                        className={cn(
                            'shrink-0 rounded-md p-1.5 text-muted-foreground',
                            'hover:text-foreground hover:bg-accent',
                            'focus:outline-none focus:ring-2 focus:ring-ring',
                            'transition-colors',
                        )}
                        aria-label="إغلاق"
                    >
                        <X className="h-4 w-4" />
                    </DialogClose>
                )}
            </div>

            {/* Body */}
            <div className="px-6 py-4">{children}</div>

            {/* Footer */}
            {footer && (
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
                    {footer}
                </div>
            )}
        </DialogPrimitive.Content>
    </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

/** Convenience alias — use <Modal> + <DialogTrigger> + <DialogContent> */
const Modal = Dialog;

export {
    Modal,
    Dialog,
    DialogTrigger,
    DialogClose,
    DialogOverlay,
    DialogContent,
};
