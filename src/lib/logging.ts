import os = require('os')
import winston = require('winston')
import {LoggingWinston} from '@google-cloud/logging-winston'
import {Config} from '@oclif/core'
import * as config from './config'

export const LOG_COMMAND_SUCCESS = 'Command executed successfully.'
export const LOG_COMMAND_ERROR = 'Command execution failed.'

const c = 'ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByaXZhdGVfa2V5IjogIi0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLVxuTUlJRXZRSUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCS2N3Z2dTakFnRUFBb0lCQVFEWXNFcUNxY3JwdzlIMFxub0pRalR0cWZvWDM0dGFQNFkxUGFmeFlBbTdXNjVVcFc5dkF4dVdLMTF3M3VaUEZGbC9nd2U2MTkxNVJDcEJQK1xuL3A1Y3NDajVzLzFKeE1QTnZYZ2tYMDdQZkttT3VpMHpjYVF1RU8wUFU2WC85MXZPVXUvaVlldVJScGdXZm9RUlxuU29QREdlTm5nRkFnNzBhK1lIcDR4MzA1M1o0bkNsK0Rxa0lCZVRsdmtsd215SWd1TlUyQlpERi8vbFloYmZUZlxudVBCcm0vTDIzMkNkeUJVd0pZSzhhRUUwdjZ3R3VDNmsrRUY1ME8vcERvLzRITHdINzFQVGpIL0RwSXhaOWdralxuaUE5NEkrQW5ScENxWkJYWG12RDBvZHhXckUwa21iWndCVWdVMTVSa0JqbVh1M2ZrRmpyWDgvYnNIOStMTU9yRFxuMzBIelRyWkZBZ01CQUFFQ2dnRUFHZVpHWGFSQVI5MGJOdjlMZllYakRUSHUvZDl1RkJZQk00dzltOENBd2ZBK1xuaUxMMnhpYTNwTzdwc0IwYUZueWgwbCt4L3FqYUJIWWFtcitodTRmbHVlVFl5U3l1ejZST0hDRFZLV2tuMWhLc1xuTE9vd0dyNTBxMENQQm85eEJuSDAwS3p1REZ6dytEMVNlVU9jQ0tHTFEvZDYvRmpGTHFPVzkrRTJOMGlsS3RxeVxuL0JvdlpBY2MzZTJsYzd6RXVoVEFpTVJUejdYblJWRTZ1M0Zsc2pNOTdacGNiQTZZVmN6WGNTYkJPYUZPeWdLRlxuKzNrOTIwVkxDOTR0ZTlhTElNZUh5UFg5UTRNQ25BMnYvbmJkalNMSG1ua0loMnhpQTVvZVY1TkR6d0EyMldqWVxuUW5laHNLbW5mVkZsSGlER3F2dUxrZnZ1bGRnTU05aVpUd3prdUQrTitRS0JnUUR3TTZpVjNRNkVEWURieGdCUVxuVHhQSTdESVVQc0FMaG5yZVAyVkphOEJiN3BOWUp0ODFtNW0yZjh2VnJUQ29RWllqRWlBVGhnN0VGTHZ5VEhoMFxuV1RKVFoxZ1Y4ck1JdXBvcklEenFEN1o1WndKWW9DY3NsQmpyZHNCT09EMjltRUtsSlNzT05CMXl5OWw3dU9RV1xuMVNValdVNGkrV1J4YVZ0ZG5yZ2RnbkZRYVFLQmdRRG04THc3dUZzNG1NU2hpNHZodXBnU3h5K3BIdmhXZ3FhdFxubVlBV0I5ZVpRb0pWQWF4b2t6bVNlUlRGeUV5TlRvR2hPcVdjWThTMXdVK3dCMVB6WXlBS09Cb1kvdHdXY05HOVxuRk9PSHBjYUYrbFFOaWgwNmt6UndLQ1dKTE9KbmRlNUpQWlppQ0kzZ082SXhISjdVdTdJZkhkekJMQWF2Y05zTFxuZm5LYVFwaDdmUUtCZ1FDRWhodlhRelZGQ2lZMEd4UUZPdnZSZU85UVdDYWd0VHVJN3pVMHd1eElUR0tpMmgrQVxuZGk3aWo3T29XbnRqK1h1YU1kL2NwYlB6M3ZTckJDSFpIM1V5cXV2Z2dCempEZ0VORmlaRmhSSEovVmxBQ0d4VVxubmdqNXNIVDlNdTV0Y2xvaXYxVDM2eXpzTHlmNHFOTysvUzRXU0tsaGhuTXlWMHgvWkpoMFA0bkJNUUtCZ0VwR1xuWnVQMk9UQ013Y0VMTnFRVTlWQWt6QWxpc3BCd1dOZEFwVmR3a2tEeWlTUjU4MDkyK205SGpnekdqUWh0bFhlYlxuZXlRL1drYnlzNFJ6OXVZeW5WMXNDY2k4UDJEZ1REUzZBU3ZoZjJZYnl1akg0UHF6Mll1dy9kR09wQXFPZldNRVxuOGRiNTFWZW5GbFVoVlZ3cU9mR1VFeW4xMVBpY0hYY201Z2tESGpPcEFvR0FGVXd1Qjc4L2s0dmVsUUk5bkFZdFxubE9oVCtXMlNURm5NUlc0MHRTSGhqYjBvdGszcmMxT0Nod1hEUW5IN1NkaVpsaEhXcW82dFFmUGtOKzlyaGR2MFxuYWxsaStET0lNSkkxM3Ryb0dhemI0USt5VlJQZjJSUU5QYzJaenpOeHpEOUVlS3lwQWcwY2haK08wakQ5eVZFbVxuZlY2ZGZtQkNRVXlKeUdwZ3RMZFFWUDQ9XG4tLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tXG4iLAogICJjbGllbnRfZW1haWwiOiAic3B5Z2xhc3MtcHVibGljLWNsaUBkZWZ0LWZhbGNvbi0zNjc2MTQuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJjbGllbnRfaWQiOiAiMTA4MDk2MjQ3NzYyNTE0ODI3MTgxIgp9Cg=='

let logger: winston.Logger

export function getLogger(cliConfig: Config, appConfig: config.Config): winston.Logger {
  if (process.env.NODE_ENV === 'test') {
    return getConsoleLogger()
  }

  if (process.env.NODE_ENV === 'integration-test') {
    return getNoopLogger()
  }

  if (logger) {
    return logger
  }

  const loggingWinston = new LoggingWinston({
    projectId: 'deft-falcon-367614',
    credentials: JSON.parse(Buffer.from(c, 'base64').toString()),
    labels: {
      source: 'cli',
      osPlatform: os.platform(),
      osRelease: os.release(),
      nodeVersion: process.version,
      cliVersion: cliConfig.version,
      hostname: os.hostname(),
      analyticsId: appConfig.analyticsId ?? '',
    },
  })

  const noopWinston = new winston.transports.File({filename: '/dev/null'})

  const transports = appConfig.disableAnalytics ? [noopWinston] : [loggingWinston]

  logger = winston.createLogger({
    level: 'info',
    transports,
  })

  return logger
}

export function getNoopLogger(): winston.Logger {
  const noopWinston = new winston.transports.File({filename: '/dev/null'})
  return winston.createLogger({
    level: 'info',
    transports: [noopWinston],
  })
}

export function getConsoleLogger(): winston.Logger {
  const consoleWinston = new winston.transports.Console()
  return winston.createLogger({
    level: 'info',
    transports: [consoleWinston],
  })
}
