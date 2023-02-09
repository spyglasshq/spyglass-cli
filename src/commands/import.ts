import {Args, Command, Flags} from '@oclif/core'

export default class Login extends Command {
  static description = 'Translate a database\'s current configuration into Spyglass format.'

  static examples = [
    `$ oex Login friend --from oclif
Login friend from oclif! (./src/commands/Login/index.ts)
`,
  ]

  static flags = {
    from: Flags.string({char: 'f', description: 'Who is saying Login', required: true}),
  }

  static args = {
    person: Args.string({description: 'Person to say Login to', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Login)

    this.log(`hello ${args.person} from ${flags.from}! (./src/commands/hello/index.ts)`)
  }
}
