import axios, {AxiosResponse} from 'axios'
import {Config} from './config'

const devUrl = 'http://127.0.0.1:5001/deft-falcon-367614/us-central1/cli'
// const prodUrl = ''

interface Payload extends Config {
  action: string;
}

export async function apiCall(cfg: Config, payload: Payload): Promise<AxiosResponse<any, any>>  {
  payload.teamId = cfg.teamId
  payload.personalAccessToken = cfg.personalAccessToken

  const url = devUrl
  return axios.post(
    url,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
}
