#!/usr/bin/env bash

set -euxo pipefail

newversion=$1 # major | minor | patch | premajor | preminor | prepatch | prerelease | from-git

previous_version=$(jq -r .version package.json)

# Increment the version, commit, and tag
npm version "$newversion"

latest_version=$(jq -r .version package.json)

# Add release notes to changelog
head -n1 CHANGELOG.md >CHANGELOG.md.tmp
npx lerna-changelog --from="v$previous_version" --to="v$latest_version" >>CHANGELOG.md.tmp
tail -n +2 CHANGELOG.md >>CHANGELOG.md.tmp

mv CHANGELOG.md.tmp CHANGELOG.md

git add CHANGELOG.md
git commit --amend --no-edit
git tag -d "v$latest_version" # delete old tag on orphaned (pre-edit) commit
git tag -a "$latest_version" -m "$latest_version"
