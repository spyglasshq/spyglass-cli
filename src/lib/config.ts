/* eslint-disable unicorn/import-style */
import * as fs from 'fs-extra'
import * as path from 'node:path'

const configFile = 'config.json'

export interface Config {
  dev?: boolean;
  cloudMode?: boolean;
  teamId?: string;
  personalAccessToken?: string;
}

export async function getConfig(configDir: string): Promise<Config> {
  const filepath = path.join(configDir, configFile)
  try {
    const cfg = await fs.readJSON(filepath)
    return cfg
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {}
    }

    throw error
  }
}

export async function createOrUpdateConfig(configDir: string, config: Config): Promise<void> {
  const filepath = path.join(configDir, configFile)
  try {
    const userConfig = await fs.readJSON(filepath)

    if (config.personalAccessToken) {
      userConfig.personalAccessToken = config.personalAccessToken
    }

    if (config.teamId) {
      userConfig.teamId = config.teamId
    }

    await fs.writeJSON(filepath, config, {spaces: 2})
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(configDir, {recursive: true})
      await fs.writeJSON(filepath, config, {spaces: 2})
    } else {
      throw error
    }
  }
}
