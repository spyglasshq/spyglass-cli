import {Command, Flags} from '@oclif/core'

export abstract class BaseCommand extends Command {
  static baseFlags = {
    dir: Flags.string({
      description: 'Working directory to look for Spyglass files.',
      deafult: '.',
    }),
  }
}
