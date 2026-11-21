import { existsSync } from "fs";
import type { ExpoConfig, ConfigContext } from "expo/config";
import { withAndroidStyles, type ConfigPlugin } from "expo/config-plugins";

/**
 * Extends app.json with values that must not live in git.
 * GOOGLE_MAPS_ANDROID_KEY comes from apps/customer/.env (or an EAS secret);
 * GOOGLE_SERVICES_JSON is the Firebase file (EAS file secret).
 */
/** Firebase file for push: EAS file secret in cloud builds, else a local file if present (dev runs without it). */
const firebaseFile = process.env.GOOGLE_SERVICES_JSON ?? (existsSync("./google-services.json") ? "./google-services.json" : undefined);

/**
 * Light-only on Android: a Light app theme instead of DayNight, and opt out of the
 * "force dark" some phones (Xiaomi, Realme, Vivo) apply to apps that don't say no.
 */
const lightOnly: ConfigPlugin = (cfg) =>
  withAndroidStyles(cfg, (c) => {
    const app = c.modResults.resources.style?.find((s) => s.$.name === "AppTheme");
    if (app) {
      app.$.parent = "Theme.AppCompat.Light.NoActionBar";
      const items = (app.item ?? []).filter((i) => i.$.name !== "android:forceDarkAllowed");
      items.push({ $: { name: "android:forceDarkAllowed", "tools:targetApi": "29" } as { name: string }, _: "false" });
      app.item = items;
    }
    return c;
  });

export default ({ config }: ConfigContext): ExpoConfig => lightOnly({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    // Firebase config for delivery alerts: EAS file secret, or a local file.
    ...(firebaseFile ? { googleServicesFile: firebaseFile } : {}),
    config: {
      ...config.android?.config,
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? "" },
    },
  },
}) as ExpoConfig;
