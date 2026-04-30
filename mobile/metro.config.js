// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// @homie/sdk lives outside mobile/ — npm installs it as a junction (symlink).
// Metro needs to know about the real path so it can watch & resolve it.
const sdkPath = path.resolve(__dirname, '..', 'sdk', 'homie-sdk');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Required for @privy-io/expo:
// 1. Makes Metro respect the "exports" field in package.json.
// 2. Tells Metro to prefer the "browser" condition so packages like `jose`
//    resolve to their Web Crypto build instead of the Node.js build
//    (which uses Node-only APIs like `crypto` that don't exist in RN).
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['browser', 'require', 'default'];

// Let Metro follow the @homie/sdk symlink outside mobile/
config.watchFolders = [sdkPath];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

module.exports = config;
