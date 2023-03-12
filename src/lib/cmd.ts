import winston = require('winston')
import {Command, Config, Flags} from '@oclif/core'
import {getConfig} from './config'
import {getLogger, getNoopLogger, LOG_COMMAND_ERROR, LOG_COMMAND_SUCCESS} from './logging'

export interface LoggableError {
  message: string;
  stack: string;
}

export abstract class BaseCommand extends Command {
  logger: winston.Logger

  // exiting tracks when we have started to shutdown the command
  // if we're exiting, we skip things like logging so we don't get 'write after end' errors
  exiting = false

  static baseFlags = {
    dir: Flags.string({
      description: 'Working directory to look for Spyglass files.',
      deafult: '.',
    }),
  }

  constructor(argv: string[], config: Config) {
    super(argv, config)

    // until we can figure out how to call init() async in the constructor, just create a noop logger for now
    this.logger = getNoopLogger()
  }

  async init(): Promise<void> {
    const cfg = await getConfig(this.config.configDir)
    this.logger = getLogger(this.config, cfg)
  }

  async logSuccess(): Promise<void> {
    return new Promise(resolve => {
      this.logger.on('finish', resolve)

      this.logger.on('error', (error) => {
        if (!this.exiting) {
          this.log(error.stack)
          this.log('Logging error encountered, exiting cleanly.')
        }
        resolve()
      })

      this.logger.info(LOG_COMMAND_SUCCESS, {command: this.id, args: this.argv})

      this.logger.end()
    })
  }

  async logSuccessAndExit(): Promise<void> {
    await this.logSuccess()
    this.exiting = true
    this.exit()
  }

  async logError({message, stack}: LoggableError): Promise<void> {
    return new Promise(resolve => {
      this.logger.on('finish', resolve)

      this.logger.on('error', (error) => {
        if (!this.exiting) {
          this.log(error.stack)
          this.log('Logging error encountered, exiting cleanly.')
        }
        resolve()
      })

      this.logger.error(LOG_COMMAND_ERROR, {
        command: this.id,
        args: this.argv,
        error: message,
        stack,
      })

      this.logger.end()
    })
  }

  async logErrorAndExit(error: LoggableError): Promise<void> {
    await this.logError(error)
    this.exiting = true
    this.exit(1)
  }

  async catch(error: unknown): Promise<void> {
    await this.logError(error as LoggableError)
    throw error
  }
}
