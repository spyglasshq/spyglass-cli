oclif-hello-world
=================

oclif example Hello World CLI

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/oclif-hello-world.svg)](https://npmjs.org/package/oclif-hello-world)
[![CircleCI](https://circleci.com/gh/oclif/hello-world/tree/main.svg?style=shield)](https://circleci.com/gh/oclif/hello-world/tree/main)
[![Downloads/week](https://img.shields.io/npm/dw/oclif-hello-world.svg)](https://npmjs.org/package/oclif-hello-world)
[![License](https://img.shields.io/npm/l/oclif-hello-world.svg)](https://github.com/oclif/hello-world/blob/main/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g spyglass-cli
$ spyglass COMMAND
running command...
$ spyglass (--version)
spyglass-cli/0.0.0 darwin-x64 node-v18.8.0
$ spyglass --help [COMMAND]
USAGE
  $ spyglass COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`spyglass hello PERSON`](#spyglass-hello-person)
* [`spyglass hello world`](#spyglass-hello-world)
* [`spyglass help [COMMANDS]`](#spyglass-help-commands)
* [`spyglass plugins`](#spyglass-plugins)
* [`spyglass plugins:install PLUGIN...`](#spyglass-pluginsinstall-plugin)
* [`spyglass plugins:inspect PLUGIN...`](#spyglass-pluginsinspect-plugin)
* [`spyglass plugins:install PLUGIN...`](#spyglass-pluginsinstall-plugin-1)
* [`spyglass plugins:link PLUGIN`](#spyglass-pluginslink-plugin)
* [`spyglass plugins:uninstall PLUGIN...`](#spyglass-pluginsuninstall-plugin)
* [`spyglass plugins:uninstall PLUGIN...`](#spyglass-pluginsuninstall-plugin-1)
* [`spyglass plugins:uninstall PLUGIN...`](#spyglass-pluginsuninstall-plugin-2)
* [`spyglass plugins update`](#spyglass-plugins-update)

## `spyglass hello PERSON`

Say hello

```
USAGE
  $ spyglass hello [PERSON] -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ oex hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [dist/commands/hello/index.ts](https://github.com/spyglasshq/spyglass-cli/blob/v0.0.0/dist/commands/hello/index.ts)_

## `spyglass hello world`

Say hello world

```
USAGE
  $ spyglass hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ spyglass hello world
  hello world! (./src/commands/hello/world.ts)
```

## `spyglass help [COMMANDS]`

Display help for spyglass.

```
USAGE
  $ spyglass help [COMMANDS] [-n]

ARGUMENTS
  COMMANDS  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for spyglass.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v5.2.2/src/commands/help.ts)_

## `spyglass plugins`

List installed plugins.

```
USAGE
  $ spyglass plugins [--core]

FLAGS
  --core  Show core plugins.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ spyglass plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v2.3.0/src/commands/plugins/index.ts)_

## `spyglass plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ spyglass plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installs a plugin into the CLI.
  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.


ALIASES
  $ spyglass plugins add

EXAMPLES
  $ spyglass plugins:install myplugin 

  $ spyglass plugins:install https://github.com/someuser/someplugin

  $ spyglass plugins:install someuser/someplugin
```

## `spyglass plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ spyglass plugins:inspect PLUGIN...

ARGUMENTS
  PLUGIN  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ spyglass plugins:inspect myplugin
```

## `spyglass plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ spyglass plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installs a plugin into the CLI.
  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.


ALIASES
  $ spyglass plugins add

EXAMPLES
  $ spyglass plugins:install myplugin 

  $ spyglass plugins:install https://github.com/someuser/someplugin

  $ spyglass plugins:install someuser/someplugin
```

## `spyglass plugins:link PLUGIN`

Links a plugin into the CLI for development.

```
USAGE
  $ spyglass plugins:link PLUGIN

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Links a plugin into the CLI for development.
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ spyglass plugins:link myplugin
```

## `spyglass plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ spyglass plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ spyglass plugins unlink
  $ spyglass plugins remove
```

## `spyglass plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ spyglass plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ spyglass plugins unlink
  $ spyglass plugins remove
```

## `spyglass plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ spyglass plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ spyglass plugins unlink
  $ spyglass plugins remove
```

## `spyglass plugins update`

Update installed plugins.

```
USAGE
  $ spyglass plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```
<!-- commandsstop -->
