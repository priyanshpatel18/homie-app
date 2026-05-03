// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// Shared @homie/* packages live outside mobile/ and are installed as symlinks.
// Metro needs each real path in watchFolders so it can resolve through the link.
const sharedRoots = [
  path.resolve(__dirname, '..', 'sdk', 'homie-sdk'),
  path.resolve(__dirname, '..', 'packages', 'sandbox'),
  path.resolve(__dirname, '..', 'packages', 'lesson-content'),
  path.resolve(__dirname, '..', 'packages', 'progress'),
];

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Required for @privy-io/expo:
// 1. Makes Metro respect the "exports" field in package.json.
// 2. Tells Metro to prefer the "browser" condition so packages like `jose`
//    resolve to their Web Crypto build instead of the Node.js build
//    (which uses Node-only APIs like `crypto` that don't exist in RN).
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['browser', 'require', 'default'];

// Let Metro follow the @homie/* symlinks pointing outside mobile/
config.watchFolders = sharedRoots;
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

module.exports = config;
