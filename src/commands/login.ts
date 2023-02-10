/* eslint-disable unicorn/import-style */
import {Command, ux} from '@oclif/core'
import {apiCall} from '../lib/api'
import {createOrUpdateConfig} from '../lib/config'

export default class Login extends Command {
  static description = 'Log in to your Spyglass account.'

  async run(): Promise<void> {
    const teamId = await ux.prompt('What is your team id? (e.g. "example.com")')

    this.log('First, go to https://demo.spyglass.software/connect and find your personal access token.')
    const personalAccessToken = await ux.prompt('Next, paste the token', {type: 'mask'})

    const payload = {
      action: 'auth',
      teamId,
      personalAccessToken,
    }
    const res = await apiCall(payload)
    if (res.data.error) {
      this.log(`Encountered an error: ${res.data.error}, code: ${res.data.code}`)
      return
    }

    this.log('Verified personal access token is valid!')

    await createOrUpdateConfig(this.config.configDir, {personalAccessToken, teamId})

    this.log('Successfully updated your access token!')
  }
}
