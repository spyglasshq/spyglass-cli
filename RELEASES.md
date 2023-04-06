# Releases

## Process

1. Ensure automated tests are passing on master
2. Run https://github.com/spyglasshq/spyglass-cli/actions/workflows/all-tests.yml
3. Run `./scripts/release-patch.sh` on master, push with tags
4. Run npm publish
