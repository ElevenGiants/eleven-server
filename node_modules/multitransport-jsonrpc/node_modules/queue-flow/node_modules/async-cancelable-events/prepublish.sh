#!/usr/bin/env bash

npm test
docco ./lib/async-cancelable-events.js
git stash
git checkout gh-pages
rm docco.css index.html
mv docs/docco.css docco.css
mv docs/async-cancelable-events.html index.html
git commit -am "Automatic documentation for version $npm_package_version"
git checkout master
git stash pop
browserify ./lib/async-cancelable-events.js | uglifyjs > ./lib/async-cancelable-events.min.js
git commit -am "Automatic minification for version $npm_package_version"
git tag $npm_package_version
git push
git push --tags