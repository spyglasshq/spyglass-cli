import * as fs from 'fs-extra'
import * as path from 'node:path'
import {randomId, sha256} from './crypto'

const configFile = 'config.json'

export interface Config {
  dev?: boolean;
  cloudMode?: boolean;
  teamId?: string;
  personalAccessToken?: string;
  analyticsId?: string;
}

async function newDefaultConfig(): Promise<Config> {
  return {
    analyticsId: (await newAnalyticsId()).slice(0, 32),
  }
}

async function newAnalyticsId(): Promise<string> {
  const snowsqlConfig = process.env.SNOWSQL_CONFIG
  if (snowsqlConfig) {
    return sha256({snowsqlConfig})
  }

  return randomId()
}

export async function getConfig(configDir: string): Promise<Config> {
  const filepath = path.join(configDir, configFile)
  try {
    const cfg = await fs.readJSON(filepath)
    return cfg
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      const config = await newDefaultConfig()
      await fs.mkdir(configDir, {recursive: true})
      await fs.writeJSON(filepath, config, {spaces: 2})
      return config
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
