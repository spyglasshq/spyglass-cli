import * as crypto from '../../src/lib/crypto'
import {expect} from 'chai'

describe('crypto', () => {
  it('sha256', async () => {
    const first = await crypto.sha256({foo: 123})
    const second = await crypto.sha256({foo: 123})
    const third = await crypto.sha256({foo: 'bar'})

    expect(first).to.equal(second)
    expect(first).to.not.equal(third)
  })

  it('randomId', async () => {
    let idPromises: Promise<string>[] = []

    for (let i = 0; i < 100; i++) {
      idPromises = [...idPromises, crypto.randomId()]
    }

    const ids = await Promise.all(idPromises)

    ids.sort()

    for (let i = 0; i < ids.length; i++) {
      if (i === 0) {
        continue
      }

      const prev = ids[i - 1]
      const current = ids[i]

      expect(prev).to.not.equal(current)
    }
  })
})
