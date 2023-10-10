# Changelog

## v0.5.0 (2023-10-10)

#### :bug: Bug Fix
* [#237](https://github.com/spyglasshq/spyglass-cli/pull/237) import/sync no longer forces all names to lower case ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.4.7 (2023-09-29)

#### :house: Internal
* [#231](https://github.com/spyglasshq/spyglass-cli/pull/231) upgrade to snowflake-sdk@1.9 ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.4.6 (2023-09-20)

#### :bug: Bug Fix
* [#228](https://github.com/spyglasshq/spyglass-cli/pull/228) fix database role deletion ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))




## v0.4.2 (2023-08-10)

#### :bug: Bug Fix
* [#195](https://github.com/spyglasshq/spyglass-cli/pull/195) yaml: add 'create stage' to allowed privileges ([@spyglass-software](https://github.com/spyglass-software))
* [#196](https://github.com/spyglasshq/spyglass-cli/pull/196) apply-dry-run: only look for supported entities existence ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.4.1 (2023-07-14)

#### :bug: Bug Fix
* [#173](https://github.com/spyglasshq/spyglass-cli/pull/173) Fix database role permission filter ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.4.0 (2023-07-14)

#### :rocket: Enhancement
* [#172](https://github.com/spyglasshq/spyglass-cli/pull/172) Add support for database roles ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.3.4 (2023-06-14)

#### :rocket: Enhancement
* [#155](https://github.com/spyglasshq/spyglass-cli/pull/155) yaml: Add file split strategy config option ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.3.3 (2023-05-16)

#### :house: Internal
* [#139](https://github.com/spyglasshq/spyglass-cli/pull/139) apply: Calls return a list of entities affected ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.3.2 (2023-05-12)

#### :bug: Bug Fix
* [#136](https://github.com/spyglasshq/spyglass-cli/pull/136) Add privileges to result of `query:user-objects` command ([@spyglass-software](https://github.com/spyglass-software))
* [#132](https://github.com/spyglasshq/spyglass-cli/pull/132) Make queries inputs case-insensitive ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.3.1 (2023-05-01)

#### :house: Internal
* [#131](https://github.com/spyglasshq/spyglass-cli/pull/131) allow injecting a snowflake conn ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))


## v0.3.0 (2023-04-13)

#### :bug: Bug Fix
* [#113](https://github.com/spyglasshq/spyglass-cli/pull/113) support double-quoted identifiers with special characters ([@spyglass-software](https://github.com/spyglass-software))
* [#111](https://github.com/spyglasshq/spyglass-cli/pull/111) yaml: make roles key optional ([@spyglass-software](https://github.com/spyglass-software))

#### :house: Internal
* [#114](https://github.com/spyglasshq/spyglass-cli/pull/114) npm update ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.2.6 (2023-04-06)

#### :bug: Bug Fix
* [#107](https://github.com/spyglasshq/spyglass-cli/pull/107) apply: skip drop/revoke queries on deleted objects ([@spyglass-software](https://github.com/spyglass-software))

#### :memo: Documentation
* [#105](https://github.com/spyglasshq/spyglass-cli/pull/105) apply: only show error ux when its a git ref error ([@spyglass-software](https://github.com/spyglass-software))
* [#104](https://github.com/spyglasshq/spyglass-cli/pull/104) apply: improve error when file not found in git ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.2.5 (2023-04-04)

#### :rocket: Enhancement
* [#100](https://github.com/spyglasshq/spyglass-cli/pull/100) normalize accountId to be lower case ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.2.4 (2023-04-03)

#### :rocket: Enhancement
* [#95](https://github.com/spyglasshq/spyglass-cli/pull/95) verify: implement sr1005, role not granted to sysadmin ([@spyglass-software](https://github.com/spyglass-software))

#### :bug: Bug Fix
* [#97](https://github.com/spyglasshq/spyglass-cli/pull/97) yaml: add missing privileges to allowlist, `delete`, `truncate`, etc. ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))

## v0.2.3 (2023-04-03)

#### :bug: Bug Fix
* [#93](https://github.com/spyglasshq/spyglass-cli/pull/93) yaml: allow managing the sysadmin role ([@spyglass-software](https://github.com/spyglass-software))

#### Committers: 1
- Spyglass Software, Inc. ([@spyglass-software](https://github.com/spyglass-software))
