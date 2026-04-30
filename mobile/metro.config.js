// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Required for @privy-io/expo:
// 1. Makes Metro respect the "exports" field in package.json.
// 2. Tells Metro to prefer the "browser" condition so packages like `jose`
//    resolve to their Web Crypto build instead of the Node.js build
//    (which uses Node-only APIs like `crypto` that don't exist in RN).
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['browser', 'require', 'default'];

module.exports = config;
