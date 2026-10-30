import { useEffect, useState } from "react";
import { startGps, stopGps } from "@/lib/riderGps";
import { useT } from "@/i18n";

/**
 * Track while the rider is online: every 20 s on a trip, every 60 s idle.
 * Uses the background task when the build allows it, else foreground only.
 * Returns the mode so screens can warn when screen-off tracking is off.
 */
export function useRiderGps(online: boolean | undefined, onTrip: boolean) {
  const t = useT();
  const [mode, setMode] = useState<"background" | "foreground" | "denied" | "off">("off");

  useEffect(() => {
    let cancelled = false;
    if (!online) {
      stopGps().finally(() => !cancelled && setMode("off"));
      return () => {
        cancelled = true;
      };
    }
    startGps(onTrip, {
      title: t("bgLocTitle"),
      body: t("bgLocBody"),
      notifTitle: t("gpsNotifTitle"),
      notifBody: t("gpsNotifBody"),
    })
      .then((m) => !cancelled && setMode(m))
      .catch(() => !cancelled && setMode("denied"));
    return () => {
      cancelled = true;
    };
  }, [online, onTrip]);

  return mode;
}
