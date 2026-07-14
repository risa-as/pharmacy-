import { useEffect, useState } from "react";
import AppAlertModal from "./AppAlertModal";
import { subscribeDialogs, dismissDialog, type DialogRequest } from "../lib/dialog";

/** Renders showAlert/showConfirm requests one at a time. Mounted once in main.tsx. */
export default function DialogHost() {
    const [queue, setQueue] = useState<DialogRequest[]>([]);
    useEffect(() => subscribeDialogs(setQueue), []);

    const current = queue[0];
    if (!current) return null;

    return (
        <AppAlertModal
            key={current.id}
            open
            variant={current.variant ?? "warning"}
            title={current.title}
            message={current.message}
            icon={current.icon}
            actionLabel={current.kind === "confirm" ? current.actionLabel : undefined}
            autoCloseMs={current.autoCloseMs}
            onAction={() => dismissDialog(current.id, true)}
            onClose={() => dismissDialog(current.id, false)}
        />
    );
}
