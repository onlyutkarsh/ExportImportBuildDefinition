/**
 * Publish the extension to VSTS and share with the 'account'
 */
var exec = require("child_process").exec;

// Load existing publisher
var manifest = require("../vss-extension.json");
var extensionId = manifest.id;

// Package extension
var command = `tfx extension publish --overrides-file configs/dev.https.json --manifest-globs vss-extension.json --extension-id ${extensionId}-dev --no-prompt --rev-version --auth-type PAT --token <<MY_TOKEN>> --share-with <<MY_ACCOUNT>>`;
exec(command, (error, stdout) => {
    if (error) {
        console.error(`Could not create package: '${error}'`);
        return;
    }
    console.log(stdout);
    console.log("Shared with iamutkarsh");
});