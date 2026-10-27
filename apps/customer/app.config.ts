import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Extends app.json with values that must not live in git.
 * GOOGLE_MAPS_ANDROID_KEY comes from apps/customer/.env (or an EAS secret).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? "" },
    },
  },
});
