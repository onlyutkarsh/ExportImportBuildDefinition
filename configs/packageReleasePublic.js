/**
 * Create test version of vsix file for testing in VSTS with no baseURL
 * You can run the command `npm run package:vsts:nobaseurl` for creating the VSIX.
 * You can also specify version for VSIX, use `npm run package:vsts:nobaseurl -- --version=0.0.8`
 */

var exec = require("child_process").exec;
var argv = require('yargs').argv;
var fs = require("fs");
var path = require("path");

// Load existing publisher
 var distManifest = require("../dist/vss-extension.json");

if (argv.version) {
    console.log("Version " + argv.version + " specified as argument. Using it for VSIX...")
    var distManifestPath = path.join(__dirname, "/../dist/vss-extension.json");
    distManifest.version = argv.version;
    fs.writeFileSync(distManifestPath, JSON.stringify(distManifest, null, 4));
    console.log("Updated version in the manifest file...")
}
distManifest.public = true;
fs.writeFileSync(distManifestPath, JSON.stringify(distManifest, null, 4));

// Package extension
var command = `tfx extension create --manifest-globs vss-extension.json --no-prompt --json`;
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