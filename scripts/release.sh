#!/usr/bin/env bash

set -euxo pipefail

newversion=$1 # major | minor | patch | premajor | preminor | prepatch | prerelease | from-git

previous_version=$(jq -r .version package.json)

# Increment the version, commit, and tag
npm version "$newversion" --no-git-tag-version

latest_version=$(jq -r .version package.json)

# Add release notes to changelog
head -n1 CHANGELOG.md >CHANGELOG.md.tmp
npx lerna-changelog --from="v$previous_version" --to="v$latest_version" >>CHANGELOG.md.tmp
tail -n +2 CHANGELOG.md >>CHANGELOG.md.tmp

mv CHANGELOG.md.tmp CHANGELOG.md
rm CHANGELOG.md.tmp

git add CHANGELOG.md package.json package-lock.json
git commit -m "$latest_version"
git tag -a "$latest_version" -m "$latest_version"
