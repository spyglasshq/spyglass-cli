import {Command, ux} from '@oclif/core'
import {apiCall} from '../lib/api'
import {createOrUpdateConfig} from '../lib/config'

export default class Login extends Command {
  static hidden = true

  static description = 'Log in to your Spyglass account.'

  async run(): Promise<void> {
    await this.init()

    const teamId = await ux.prompt('What is your team id? (e.g. "example.com")')

    this.log('First, go to https://demo.spyglass.software/connect and find your personal access token.')
    const personalAccessToken = await ux.prompt('Next, paste the token', {type: 'mask'})

    const cfg = {
      teamId,
      personalAccessToken,
      dev: Boolean(process.env.SPYGLASS_DEV),
    }
    const payload = {
      action: 'auth',
    }
    const res = await apiCall(cfg, payload)
    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    this.log('Verified personal access token is valid!')

    await createOrUpdateConfig(this.config.configDir, cfg)

    this.log('Successfully updated your access token!')
  }
}
