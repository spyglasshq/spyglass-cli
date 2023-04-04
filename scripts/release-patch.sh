#!/usr/bin/env bash

set -euxo pipefail

previous_version=$(jq -r .version package.json)

# Increment the version, commit, and tag
npm version patch

latest_version=$(jq -r .version package.json)

# Add release notes to changelog
head -n1 CHANGELOG.md >CHANGELOG.md.tmp
npx lerna-changelog --from="v$previous_version" --to="v$latest_version" >>CHANGELOG.md.tmp
tail -n +2 CHANGELOG.md >>CHANGELOG.md.tmp

mv CHANGELOG.md.tmp CHANGELOG.md

git add CHANGELOG.md
git commit --amend --no-edit
