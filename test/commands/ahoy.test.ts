import {expect, test} from '@oclif/test'

describe('ahoy', () => {
  test
  .stdout()
  .command(['ahoy'])
  .it('runs ahoy', ctx => {
    expect(ctx.stdout).to.contain('The Story of Spyglass')
    expect(ctx.stdout).to.contain('Getting Started')
  })
})
