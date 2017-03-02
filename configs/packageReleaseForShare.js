/**
 * Create the release version vsix file without the baseurl and without dev string in the extension manifest.
 */

"use strict";

var exec = require("child_process").exec;
var fs = require("fs");
var path = require("path");
var argv = require('yargs').argv;

// Load existing publisher
var distManifest = require("../dist/vss-extension.json");
var distManifestPath = path.join(__dirname, "/../dist/vss-extension.json");

if (argv.version) {
    console.log("Version " + argv.version + " specified as argument. Using it for VSIX...")

    distManifest.version = argv.version;
}
distManifest.public = false;
var extensionId = distManifest.id;
distManifest.name = "Dev:" + distManifest.name;
fs.writeFileSync(distManifestPath, JSON.stringify(distManifest, null, 4));
console.log("Updated version in the manifest file...")

// Package extension
var command = `tfx extension create --overrides-file ../configs/release.json --manifest-globs vss-extension.json --extension-id ${extensionId}-dev --no-prompt --json`;
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