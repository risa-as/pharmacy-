const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const hasWorkspaceModules = fs.existsSync(path.join(workspaceRoot, 'node_modules'));

const config = getDefaultConfig(projectRoot);

if (hasWorkspaceModules) {
    config.watchFolders = [workspaceRoot];
    config.resolver.nodeModulesPaths = [
        path.resolve(projectRoot, 'node_modules'),
        path.resolve(workspaceRoot, 'node_modules'),
    ];
    config.resolver.disableHierarchicalLookup = true;
} else {
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
