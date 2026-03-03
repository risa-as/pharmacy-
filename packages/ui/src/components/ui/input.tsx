'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, label, error, leftIcon, rightIcon, id, ...props }, ref) => {
        const generatedId = React.useId();
        const inputId = id ?? generatedId;
        const errorId = error ? `${inputId}-error` : undefined;

        return (
            <div className="w-full space-y-1.5">
                {label && (
                    <LabelPrimitive.Root
                        htmlFor={inputId}
                        className="text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        {label}
                    </LabelPrimitive.Root>
                )}

                <div className="relative">
                    {leftIcon && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none flex items-center">
                            {leftIcon}
                        </span>
                    )}

                    <input
                        id={inputId}
                        type={type}
                        ref={ref}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={errorId}
                        className={cn(
                            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
                            'text-sm text-foreground ring-offset-background',
                            'file:border-0 file:bg-transparent file:text-sm file:font-medium',
                            'placeholder:text-muted-foreground',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                            'transition-colors duration-150',
                            error && 'border-destructive focus-visible:ring-destructive/30',
                            leftIcon  && 'pl-9',
                            rightIcon && 'pr-9',
                            className,
                        )}
                        {...props}
                    />

                    {rightIcon && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none flex items-center">
                            {rightIcon}
                        </span>
                    )}
                </div>

                {error && (
                    <p id={errorId} role="alert" className="text-xs text-destructive font-medium">
                        {error}
                    </p>
                )}
            </div>
        );
    },
);
Input.displayName = 'Input';

export { Input };
