import { existsSync } from "fs";
import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Extends app.json with values that must not live in git.
 * GOOGLE_MAPS_ANDROID_KEY comes from apps/customer/.env (or an EAS secret);
 * GOOGLE_SERVICES_JSON is the Firebase file (EAS file secret).
 */
/** Firebase file for push: EAS file secret in cloud builds, else a local file if present (dev runs without it). */
const firebaseFile = process.env.GOOGLE_SERVICES_JSON ?? (existsSync("./google-services.json") ? "./google-services.json" : undefined);

export default ({ config }: ConfigContext): ExpoConfig => ({
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
});
