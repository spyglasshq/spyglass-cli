import {Command, Flags} from '@oclif/core'
import {getConfig} from './config'
import {getLogger, LOG_COMMAND_SUCCESS} from './logging'

export abstract class BaseCommand extends Command {
  static baseFlags = {
    dir: Flags.string({
      description: 'Working directory to look for Spyglass files.',
      deafult: '.',
    }),
  }

  async logSuccess(): Promise<void> {
    const cfg = await getConfig(this.config.configDir)
    const logger = getLogger(this.config, cfg)
    return new Promise(resolve => {
      logger.on('finish', resolve)
      logger.info(LOG_COMMAND_SUCCESS, {command: this.id, args: this.argv})
      logger.end()
    })
  }
}
