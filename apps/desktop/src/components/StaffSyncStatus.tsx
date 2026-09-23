import { createPortal } from "react-dom";
import { useState } from "react";
import { Cloud, X } from "lucide-react";
import SyncOverview, { useSyncHealth } from "./SyncOverview";
export default function StaffSyncStatus({
  onDetails,
}: {
  onDetails?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { health, error } = useSyncHealth();
  return (
    <div dir="rtl">
      <button
        className="relative shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-zinc-800"
        title="المزامنة"
        aria-label="المزامنة"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Cloud size={16} />
        {(error || health?.pendingCount > 0 || health?.failedCount > 0) && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
        )}
      </button>
      {open &&
        createPortal(
          <div
            dir="rtl"
            role="dialog"
            aria-label="المزامنة"
            className="fixed z-[100] bottom-4 left-20 w-80 max-w-[calc(100vw-6rem)] max-h-[85vh] overflow-y-auto rounded-lg border border-border bg-card text-foreground p-2 shadow-lg"
          >
            <button
              className="block mr-auto p-1"
              aria-label="إغلاق"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
            <SyncOverview
              onDetails={
                onDetails
                  ? () => {
                      setOpen(false);
                      onDetails();
                    }
                  : undefined
              }
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
