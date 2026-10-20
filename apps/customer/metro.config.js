// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Use Node's file watcher instead of Watchman. Watchman needs macOS
// privacy permission for ~/Documents and crashes Metro without it.
config.resolver.useWatchman = false;

module.exports = config;
