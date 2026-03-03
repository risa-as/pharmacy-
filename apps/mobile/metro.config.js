const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
// Shared design tokens — explicit entry ensures Metro hot-reloads on token changes
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo + explicit shared package for design tokens
config.watchFolders = [workspaceRoot, sharedRoot];

// 2. Resolve packages from project and workspace root
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Force resolving nested modules to the folders below
config.resolver.disableHierarchicalLookup = true;

// 4. Exclude irrelevant folders manually using simple regex
config.resolver.blockList = [
    /.*\/apps\/web\/.next\/.*/,
    /.*\/apps\/desktop\/dist\/.*/,
    /.*\/apps\/desktop\/dist-electron\/.*/,
    /.*\/apps\/desktop\/out\/.*/,
];

module.exports = config;
