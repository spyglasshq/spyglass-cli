import * as ratelimit from '../../src/lib/ratelimit'
import {expect} from 'chai'

describe('ratelimit', () => {
  describe('WaitGroup', () => {
    it('waits until all work is done', async () => {
      const wg = new ratelimit.WaitGroup()

      for (let i = 0; i < 100_000; i++) {
        wg.add()

        setTimeout(() => {
          wg.done()
        }, 10)
      }

      await wg.wait()
    })

    it('wait hangs if not all work is completed', done => {
      const wg = new ratelimit.WaitGroup()

      wg.add()
      wg.add()
      wg.add()

      setTimeout(() => {
        wg.done()
      }, 10)

      setTimeout(() => {
        wg.done()
      }, 10)

      setTimeout(() => {
        // if after 1 second, wait() hasn't resolved, we're good
        wg.close()
        done()
      }, 1000)

      wg.wait().then(() => {
        expect.fail('wait() should not resolve')
      })
    })

    it('throws error if used after close', async () => {
      const wg = new ratelimit.WaitGroup()
      wg.add()
      wg.done()
      await wg.wait()

      expect(() => wg.add()).to.throw('wait group is closed')
      expect(() => wg.done()).to.throw('wait group is closed')
    })

    it('throws error if count is negative', async () => {
      const wg = new ratelimit.WaitGroup()
      wg.add()
      wg.done()
      expect(() => wg.done()).to.throw('negative wait group counter')
    })
  })

  describe('RateLimiter', () => {
    it('success', done => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function, unicorn/consistent-function-scoping
      let mockCallback = (_args: void): void => {}

      const mockSetInterval = (callback: (args: void) => void, _ms?: number): NodeJS.Timer => {
        mockCallback = callback
        return setInterval(() => null, 1000) // no-op to satisfy the function signature
      }

      const wg = new ratelimit.WaitGroup()

      const limit = 10
      const rl = new ratelimit.RateLimiter(limit, mockSetInterval)

      for (let i = 0; i < limit; i++) {
        rl.wait()
      }

      let unblocked = false
      wg.add()

      setTimeout(async () => {
        // this should block until the second setTimeout gets called that invokes the mockCallback
        await rl.wait()
        expect(unblocked).to.be.true
        wg.done()
      }, 1)

      setTimeout(() => {
        unblocked = true
        mockCallback()
      }, 100)

      wg.wait().then(() => {
        rl.close()
        done()
      })
    })

    it('disabled rate limiter', async () => {
      const rl = new ratelimit.RateLimiter(0)
      for (let i = 0; i < 100_000; i++) {
        // eslint-disable-next-line no-await-in-loop
        await rl.wait()
      }

      rl.close()
    })
  })
})
