interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    /** md: 48×24 track / 20px knob (settings rows). sm: 36×20 track / 16px knob (inline/table rows). */
    size?: "sm" | "md";
    /** Track color when ON. */
    activeClass?: string;
    title?: string;
}

// Knob is anchored to the RIGHT edge so its resting position never depends on
// the page's text direction, and travel keeps the same 2px margin on both
// sides (track − knob − 2×2px). OFF = right (RTL inline start), ON = left.
const SIZES = {
    md: { track: "w-12 h-6", knob: "w-5 h-5", travel: "-translate-x-6" },
    sm: { track: "w-9 h-5", knob: "w-4 h-4", travel: "-translate-x-4" },
};

export default function Toggle({
    checked, onChange, disabled, size = "md", activeClass = "bg-primary", title,
}: ToggleProps) {
    const s = SIZES[size];
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            title={title}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative shrink-0 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${s.track} ${checked ? activeClass : "bg-muted-foreground/30"}`}
        >
            <span
                className={`absolute top-0.5 right-0.5 rounded-full bg-white shadow transition-transform duration-200 ${s.knob} ${checked ? s.travel : "translate-x-0"}`}
            />
        </button>
    );
}
