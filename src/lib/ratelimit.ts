export class RateLimiter {
  private rps: number
  private interval: NodeJS.Timer
  private SECOND_MS = 1000
  private closed: boolean

  private resolvers: ((value: void | PromiseLike<void>) => void)[]

  constructor(rps: number) {
    this.closed = false
    this.rps = rps
    this.resolvers = []

    const sliceFactor = 5 // Arbitrarily update the count every 5th of a second, slightly more smooth than every 1 second.
    this.interval = setInterval(() => {
      if (this.resolvers.length === 0) {
        return
      }

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

  async close(): Promise<void> {
    clearInterval(this.interval)
  }
}

export class WaitGroup {
  private count: number

  constructor() {
    this.count = 0
  }

  add(): void {
    this.count += 1
  }

  done(): void {
    this.count -= 1
  }

  async wait(): Promise<void> {
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (this.count === 0) {
          clearInterval(interval)
          resolve()
        }
      }, 1000)
    })
  }
}