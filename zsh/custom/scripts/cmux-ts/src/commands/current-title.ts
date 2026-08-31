import type { Command } from 'commander'
import process from 'node:process'
import { cmux } from '../client'

export async function getCurrentSurfaceTitle(): Promise<string | undefined> {
  return await cmux.getCurrentTitle()
}

export function registerCurrentTitleCommand(program: Command): void {
  program
    .command('current-title')
    .alias('title')
    .alias('current-tab-title')
    .description('Get title of the current cmux surface')
    .action(async () => {
      try {
        const title = await getCurrentSurfaceTitle()
        if (title) {
          console.log(title)
        }
      }
      catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })
}
