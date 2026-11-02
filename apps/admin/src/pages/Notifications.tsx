import { useEffect, useState } from "react";
import { PageHeader, AlertRow } from "../shell/Shell";
import { useAlerts } from "../lib/alerts";
import { Btn, Empty, ErrorBox, Segments } from "../ui/kit";

type View = "all" | "action" | "updates";

/** Everything that needs the admin, plus the last 24 hours of updates. */
export function Notifications() {
  const { alerts, isNew, markSeen, isLoading, error, refetch, isFetching } = useAlerts();
  const [view, setView] = useState<View>("all");
  const open = alerts.filter((a) => a.open);
  const updates = alerts.filter((a) => !a.open);
  // Seeing this page counts as reading the updates (after a moment, so new ones still show highlighted).
  useEffect(() => {
    if (!alerts.length) return;
    const t = setTimeout(markSeen, 4000);
    return () => clearTimeout(t);
  }, [alerts.length, markSeen]);

  return (
    <div className="pb-6">
      <PageHeader
        title="Notifications"
        sub="Live alerts that need someone, and what happened in the last 24 hours. Refreshes every 30 s."
        actions={
          <Btn onClick={() => void refetch()} busy={isFetching}>
            Refresh
          </Btn>
        }
      />
      <div className="px-4 pt-4 md:px-6">
        <Segments
          value={view}
          onChange={setView}
          items={[
            { id: "all", label: "All", count: alerts.length },
            { id: "action", label: "Needs action", count: open.length },
            { id: "updates", label: "Updates", count: updates.length },
          ]}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-3 md:px-6">
        <ErrorBox error={error} />
        {view !== "updates" && (
          <section className="card p-2">
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <div className="card-title text-[14px]">Needs action</div>
              <span className="text-[11px] text-muted">Clears itself once handled</span>
            </div>
            {open.map((a) => (
              <AlertRow key={a.id} a={a} fresh={false} />
            ))}
            {!isLoading && !open.length && <Empty>Nothing is waiting on you. Nice.</Empty>}
          </section>
        )}
        {view !== "action" && (
          <section className="card p-2">
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <div className="card-title text-[14px]">Last 24 hours</div>
              {updates.some(isNew) && (
                <button onClick={markSeen} className="text-[11.5px] font-bold text-primary">
                  Mark all read
                </button>
              )}
            </div>
            {updates.map((a) => (
              <AlertRow key={a.id} a={a} fresh={isNew(a)} />
            ))}
            {!isLoading && !updates.length && <Empty>No failed, cancelled or declined orders today.</Empty>}
          </section>
        )}
      </div>
    </div>
  );
}
