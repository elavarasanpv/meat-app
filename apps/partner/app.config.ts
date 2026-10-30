import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * app.json plus the Firebase config for push alerts. google-services.json is
 * not committed: EAS builds get it from the GOOGLE_SERVICES_JSON file secret,
 * local builds read ./google-services.json if present.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
});
