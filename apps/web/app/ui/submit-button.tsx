"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@faramace/ui";

interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    text: string;
    loadingText?: string;
    icon?: React.ElementType;
}

export function SubmitButton({
    text,
    loadingText = "جاري الحفظ...",
    icon: Icon,
    className,
    ...props
}: SubmitButtonProps) {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending || props.disabled}
            className={cn(
                "flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                className
            )}
            {...props}
        >
            {pending ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{loadingText}</span>
                </>
            ) : (
                <>
                    {Icon && <Icon className="w-4 h-4" />}
                    <span>{text}</span>
                </>
            )}
        </button>
    );
}
