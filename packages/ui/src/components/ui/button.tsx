import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-bold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default:     "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
                destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                outline:     "border border-border/60 bg-background/80 text-foreground hover:bg-muted hover:border-border",
                secondary:   "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                ghost:       "hover:bg-accent hover:text-accent-foreground",
                link:        "text-primary underline-offset-4 hover:underline",
                // Semantic variants for medical workflows
                success:     "bg-success text-success-foreground hover:bg-success/90",
                warning:     "bg-warning text-warning-foreground hover:bg-warning/90",
            },
            size: {
                default: "h-10 px-4 py-2",
                sm:      "h-9 rounded-md px-3",
                lg:      "h-11 rounded-md px-8",
                icon:    "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
    /**
     * Keyboard shortcut badge rendered on the button surface.
     * Example: shortcut="F4" renders a small <kbd>F4</kbd> badge.
     * Additive only — does NOT replace the button label.
     */
    shortcut?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, shortcut, children, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            >
                {children}
                {shortcut && !asChild && (
                    <kbd
                        className="ml-2 text-[0.65rem] font-mono opacity-70 border border-current/30 rounded px-1 py-0.5"
                        aria-hidden="true"
                    >
                        {shortcut}
                    </kbd>
                )}
            </Comp>
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
