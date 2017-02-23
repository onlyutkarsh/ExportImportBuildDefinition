/**
 * This script publishes the extension to local on-prem TFS.
 */

var exec = require("child_process").exec;
var semver = require("semver");
var fs = require("fs");
var path = require("path");

// Load existing publisher
var manifest = require("../vss-extension.json");
var extensionId = manifest.id;
var devContent = require("./dev.json");
devContent.version = semver.inc(devContent.version, "patch");

fs.writeFileSync(path.join(__dirname, "dev.json"), JSON.stringify(devContent, null, 4));

// Package extension
var command = `tfx extension publish --overrides-file configs/dev.json --manifest-globs vss-extension.json --extension-id ${extensionId}-dev --auth-type PAT --token <<MY_TOKEN>> --service-url http://localhost:8080/tfs`;
exec(command, (error, stdout) => {
    if (error) {
        console.error(`Could not create package: '${error}'`);
        return;
    }
    console.log("Package published");
});