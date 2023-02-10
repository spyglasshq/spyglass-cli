import axios, {AxiosResponse} from 'axios'

const devUrl = 'http://127.0.0.1:5001/deft-falcon-367614/us-central1/cli'
// const prodUrl = ''

export async function apiCall(payload: unknown): Promise<AxiosResponse<any, any>>  {
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
