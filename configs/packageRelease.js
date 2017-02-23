/**
 * Create the release version vsix file without the baseurl and without dev string in the extension manifest.
 */

"use strict";

var exec = require("child_process").exec;

// Package extension
var command = `tfx extension create --overrides-file ../configs/release.json --manifest-globs vss-extension.json --no-prompt --json`;
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