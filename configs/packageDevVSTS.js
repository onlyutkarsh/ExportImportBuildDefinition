/**
 * Create test version of vsix file for testing in VSTS with no baseURL
 */

var exec = require("child_process").exec;
// Load existing publisher
var manifest = require("../vss-extension.json");
var extensionId = manifest.id;
// Package extension
var command = `tfx extension create --overrides-file ../configs/release.json --manifest-globs vss-extension.json --extension-id ${extensionId}-dev --no-prompt --rev-version --json`;
console.log(command);
exec(command, {
    "cwd": "./dist"
}, (error, stdout) => {
    if (error) {
        console.error(`Could not create package: '${error}'`);
        return;
    }
    let output = JSON.parse(stdout);
    console.log(`Package created ${output.path}`);
});