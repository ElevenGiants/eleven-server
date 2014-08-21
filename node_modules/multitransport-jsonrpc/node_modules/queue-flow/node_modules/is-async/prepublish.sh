#!/usr/bin/env bash

npm test
browserify ./lib/is-async.js | uglifyjs > ./lib/is-async.min.js
git commit -am "Automatic minification for version $npm_package_version"
git tag $npm_package_version
git push
git push --tags