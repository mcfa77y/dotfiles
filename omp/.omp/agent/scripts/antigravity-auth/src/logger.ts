import pino from 'pino'

// Log to stderr so stdout remains the machine-readable token response.
export const logger = pino({
  level: process.env.OMP_ANTIGRAVITY_LOG_LEVEL ?? 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      destination: 2,
    },
  },
})
