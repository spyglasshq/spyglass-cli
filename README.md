# Spyglass CLI

![spyglass-cli-logo](./docs/spyglass-cli-logo.png)

Spyglass - access management for data teams.

## Overview

Basic usage of this tool looks like:

1. Import your current Snowflake objects/roles to YAML.
2. Manage them as code.
3. Automatically sync objects/roles between your Git repo and Snowflake.

## Getting Started

Install the CLI using `npm`:

```
npm install -g spyglass-cli
```

## Basic Usage

### 1 - Authentication

To start, connect an account

```
spyglass accounts:auth <orgID-accountID> --check
```

```
Welcome to Spyglass! Let's set up a ~/.snowsql/config file.
(See https://docs.snowflake.com/en/user-guide/snowsql-config for more info)

Username (required): <myUsername>
Password (required): *********************
Checking connection... done
Success!
```

(The identifier is a combination of your Organization ID and Account ID, viewable in the Snowsight UI, e.g. `zhjgixi-tv26532`)

### 2 - Import

Next, import your current Snowflake objects/roles to Spyglass YAML format.

```
spyglass import <orgID-accountID>
```

```
Fetching current Snowflake configuration... done
Successfully wrote current configuration to skigdyn-wu58851.yaml.
```

#### Git Commit

You should commit this code to your repo, so that the `apply` step later has an understanding of what changes have been made.

### 3 - Verify

After making changes to your config, you can verify that the configuration is valid, and catch any issues, prior to applying them to Snowflake.

```
spyglass verify <orgID-accountID>
```

```
Verifying configuration... done
```

### 4 -  Apply

Apply the latest changes to Snowflake.

```
spyglass apply <orgID-accountID>
```

## CI/CD Usage

TODO

## Security

We take the security of our products very seriously. Please email [security@spyglass.software](mailto:security@spyglass.software) with any security reports, including reproduction steps.

## License

This software is licensed under the MIT license, see the [LICENSE](./LICENSE) file.
