const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Detect monorepo: workspace root node_modules exist (local dev / CI with full repo)
const hasWorkspaceModules = fs.existsSync(path.join(workspaceRoot, 'node_modules'));

const config = getDefaultConfig(projectRoot);

if (hasWorkspaceModules) {
    // Local dev / CI with full monorepo — resolve from both roots
    config.watchFolders = [workspaceRoot];
    config.resolver.nodeModulesPaths = [
        path.resolve(projectRoot, 'node_modules'),
        path.resolve(workspaceRoot, 'node_modules'),
    ];
    config.resolver.disableHierarchicalLookup = true;
} else {
    // EAS cloud build — only local node_modules are available
    config.resolver.nodeModulesPaths = [
        path.resolve(projectRoot, 'node_modules'),
    ];
}

config.resolver.blockList = [
    /.*\/apps\/web\/.next\/.*/,
    /.*\/apps\/desktop\/dist\/.*/,
    /.*\/apps\/desktop\/dist-electron\/.*/,
    /.*\/apps\/desktop\/out\/.*/,
];

module.exports = config;
