import { existsSync } from "fs";
import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * app.json plus the Firebase config for push alerts. google-services.json is
 * not committed: EAS builds get it from the GOOGLE_SERVICES_JSON file secret,
 * local builds read ./google-services.json if present.
 */
/** Firebase file for push: EAS file secret in cloud builds, else a local file if present (dev runs without it). */
const firebaseFile = process.env.GOOGLE_SERVICES_JSON ?? (existsSync("./google-services.json") ? "./google-services.json" : undefined);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    ...(firebaseFile ? { googleServicesFile: firebaseFile } : {}),
  },
});
