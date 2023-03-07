import {Command} from '@oclif/core'
import color from '@oclif/color';

export default class Ahoy extends Command {
  static description = 'Getting started with Spyglass.'

  async run(): Promise<void> {
    this.log('')
    this.log(color.cyan.bold('███████╗██████╗ ██╗   ██╗ ██████╗ ██╗      █████╗ ███████╗███████╗'))
    this.log(color.cyan('██╔════╝██╔══██╗╚██╗ ██╔╝██╔════╝ ██║     ██╔══██╗██╔════╝██╔════╝'))
    this.log(color.blue.bold('███████╗██████╔╝ ╚████╔╝ ██║  ███╗██║     ███████║███████╗███████╗'))
    this.log(color.blue('╚════██║██╔═══╝   ╚██╔╝  ██║   ██║██║     ██╔══██║╚════██║╚════██║'))
    this.log(color.magenta('███████║██║        ██║   ╚██████╔╝███████╗██║  ██║███████║███████║'))
    this.log(color.magenta.bold('╚══════╝╚═╝        ╚═╝    ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝'))

    this.log('')
    this.log(color.bold('The Story of Spyglass'))
    this.log('')
    this.log('Invented in the early 1600s, the spyglass was the precursor to the modern day')
    this.log('telescope. The spyglass opened our eyes to see distant lands we couldn’t see')
    this.log('before. And maritime explorers used spyglasses to better understand their')
    this.log('surroundings as they boldly sailed into parts unknown.')
    this.log('')
    this.log('At Spyglass Software, we want to give people a clearer picture of how their')
    this.log('data moves. We believe that large data deployments are as complex as charting')
    this.log('a path across the Pacific. Our platform gives data teams insights,')
    this.log('recommendations, and the ability to quickly course-correct as they venture')
    this.log('forth to new and exciting frontiers.')
    this.log('')
    this.log('Set sail,')
    this.log('Spyglass')
    this.log('')
    this.log(color.bold('Getting Started'))
    this.log('')
    this.log('  Run "spyglass accounts:auth" to get started!')
    this.log('')
  }
}
