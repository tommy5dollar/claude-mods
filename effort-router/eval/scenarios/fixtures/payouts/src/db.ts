// A stand-in for the database client. Every call is async and takes a few milliseconds, like a network round trip.
// Single calls are atomic; nothing spans calls (there are no transactions).

const roundTrip = () => new Promise(resolve => setTimeout(resolve, 2 + Math.random() * 6))

export class Table<T extends { id: string }> {
  private rows = new Map<string, T>()

  async get(id: string): Promise<T | undefined> {
    await roundTrip()
    const row = this.rows.get(id)
    return row && { ...row }
  }

  async list(where: (row: T) => boolean = () => true): Promise<T[]> {
    await roundTrip()
    return [...this.rows.values()].filter(where).map(row => ({ ...row }))
  }

  async insert(row: T): Promise<void> {
    await roundTrip()
    if (this.rows.has(row.id)) throw new Error(`Duplicate key ${row.id}`)
    this.rows.set(row.id, { ...row })
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    await roundTrip()
    const row = this.rows.get(id)
    if (!row) throw new Error(`No row ${id}`)
    this.rows.set(id, { ...row, ...changes })
  }

  /** Sets `changes` only if `field` still holds `expected`, in one atomic step. True if it did. */
  async compareAndSet<K extends keyof T>(id: string, field: K, expected: T[K], changes: Partial<T>): Promise<boolean> {
    await roundTrip()
    const row = this.rows.get(id)
    if (!row || row[field] !== expected) return false
    this.rows.set(id, { ...row, ...changes })
    return true
  }
}
