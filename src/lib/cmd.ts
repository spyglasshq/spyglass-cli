import {Command, Flags} from '@oclif/core'
import {getConfig} from './config'
import {getLogger, LOG_COMMAND_ERROR, LOG_COMMAND_SUCCESS} from './logging'

export interface LoggableError {
  message: string;
}

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

  async logSuccessAndExit(): Promise<void> {
    await this.logSuccess()
    this.exit()
  }

  async logError({message}: LoggableError): Promise<void> {
    const cfg = await getConfig(this.config.configDir)
    const logger = getLogger(this.config, cfg)
    return new Promise(resolve => {
      logger.on('finish', resolve)
      logger.error(LOG_COMMAND_ERROR, {
        command: this.id,
        args: this.argv,
        error: message,
      })
      logger.end()
    })
  }

  async logErrorAndExit(error: LoggableError): Promise<void> {
    await this.logError(error)
    this.exit(1)
  }
}
