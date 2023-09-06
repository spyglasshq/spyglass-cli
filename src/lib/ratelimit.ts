
export type SetInterval = (callback: (args: void) => void, ms?: number) => NodeJS.Timer

export class RateLimiter {
  private rps: number
  private interval: NodeJS.Timer
  private SECOND_MS = 1000
  private closed: boolean

  private resolvers: ((value: void | PromiseLike<void>) => void)[]

  constructor(rps: number, _setInterval: SetInterval = setInterval) {
    this.closed = false
    this.rps = rps
    this.resolvers = []

    const sliceFactor = 5 // Arbitrarily update the count every 5th of a second, slightly more smooth than every 1 second.
    this.interval = _setInterval(() => {
      if (this.resolvers.length === 0) {
        return
      }

      // NOTE: Technically, this implementation works best when all the requests are queued up in a large batch,
      // and isn't quite correct if requests stream in over time. This is because every 5th of a second, we are pulling
      // 2 requests off of the request queue. So if there aren't any requests in this time chunk, we won't try to "catch up"
      // on the next tick. This is acceptable given our usage.

      const numCalls = Math.floor(this.rps / sliceFactor)
      for (let i = 0; i < numCalls; i++) {
        const resolve = this.resolvers.pop()
        if (resolve) {
          resolve()
        }
      }
    }, this.SECOND_MS / sliceFactor)
  }

  async wait(): Promise<void> {
    if (this.closed) {
      throw new Error('rate limiter attempted to wait after it was closed')
    }

    if (this.rps === 0) {
      return
    }

    return new Promise(resolve => {
      this.resolvers.push(resolve)
    })
  }

  close(): void {
    clearInterval(this.interval)
  }
}

export class WaitGroup {
  private count: number
  private interval?: NodeJS.Timer
  private closed: boolean

  constructor() {
    this.count = 0
    this.closed = false
  }

  add(n = 1): void {
    if (this.closed) {
      throw new Error('wait group is closed')
    }

    const newCount = this.count + n

    if (newCount < 0) {
      throw new Error('negative wait group counter')
    }

    this.count = newCount
  }

  done(): void {
    this.add(-1)
  }

  async wait(): Promise<void> {
    return new Promise(resolve => {
      this.interval = setInterval(() => {
        if (this.count === 0) {
          this.close()
          resolve()
        }
      }, 100)
    })
  }

  close(): void {
    this.closed = true
    clearInterval(this.interval)
  }
}
