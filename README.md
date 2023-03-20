![spyglass-cli-logo](https://user-images.githubusercontent.com/121976108/225433315-7997ae61-5a9b-4ba1-9300-8756db25c729.png)


![GitHub Workflow Status (with branch)](https://img.shields.io/github/actions/workflow/status/spyglasshq/spyglass-cli/test.yml?branch=master) ![GitHub commit activity](https://img.shields.io/github/commit-activity/m/spyglasshq/spyglass-cli) ![GitHub](https://img.shields.io/github/license/spyglasshq/spyglass-cli) ![GitHub milestone](https://img.shields.io/github/milestones/progress-percent/spyglasshq/spyglass-cli/1)

Manage your Snowflake access control as code.

## Overview

Basic usage of this tool looks like:

```
1. Import your current Snowflake objects/roles to YAML.

┌───────────┐     spyglass import / sync      ┌──────────┐
│ Snowflake │ ──────────────────────────────► │   YAML   │
└───────────┘                                 └──────────┘

2. Manage them as code.

┌───────────┐          make changes           ┌──────────┐
│           │ ──────────────────────────────► │          │
│ Data User │        spyglass verify          │   YAML   │
│           │ ──────────────────────────────► │          │
└───────────┘                                 └──────────┘

3. Automatically sync objects/roles between your Git repo and Snowflake.

┌───────────┐        spyglass apply           ┌──────────┐
│ Snowflake │ ◄────────────────────────────── │   YAML   │
└───────────┘                                 └──────────┘
```

## Getting Started

Install the CLI using `npm`:

```
sudo npm install -g spyglass-cli@latest
```

## Basic Usage

See [How do I set up the CLI? #43](https://github.com/spyglasshq/spyglass-cli/discussions/43).

## CI/CD Usage

See [How do I set up github actions / workflows? #42](https://github.com/spyglasshq/spyglass-cli/discussions/42).

## Query Usage

For getting insight into "who can access what?", see [Announcing Queries (alpha) #45](https://github.com/spyglasshq/spyglass-cli/discussions/45).

## Getting Help and Contributing

We love working with the community, here's a few ways to get involved:

1. [Discussions](https://github.com/spyglasshq/spyglass-cli/discussions) - For FAQs, Q&A, feature requests, ideas, announcements, and sharing your use cases.
2. [Issues](https://github.com/spyglasshq/spyglass-cli/issues) - For bug reports and concrete work items.
3. [Email](mailto:devs@spyglass.software) - If all else fails, or if you'd just like to chat, let us know at devs@spyglass.software.
4. [Slack](mailto:demo@spyglass.software) - For early partners, we're working on Slack for real time feedback and support. If you're interested, reach out to demo@spyglass.software.

## Security

See [SECURITY.md](./SECURITY.md)

## Usage Analytics

We constantly improve this software, but we need your help!

By default, we log **anonymous analytics** such as: which commands are invoked, what errors are encountered, and contextual data such as OS/node/CLI version. We never send any personally-identifiable user information.

To opt out, you can run `spyglass config:set disableAnalytics true`. See https://github.com/spyglasshq/spyglass-cli/issues/9 and [logging.ts](./src/lib/logging.ts) for more information.

## Roadmap

As of Q1 '23, Spyglass has full support for **Snowflake**. Support for other analytics databases (BigQuery, Databricks, Redshift, Oracle, etc.) is planned to follow.

Check out the [Milestones](https://github.com/spyglasshq/spyglass-cli/milestones) page to track further progress.
