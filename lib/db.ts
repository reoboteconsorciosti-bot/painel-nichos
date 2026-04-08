import { Pool, type PoolClient } from "pg"

let _pool: Pool | null = null

export function getPool(): Pool {
  if (_pool) return _pool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL_not_configured")
  }

  _pool = new Pool({ connectionString })
  return _pool
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export type DbLead = {
  name: string | null
  phone: string
  city: string | null
  state: string | null
  company: string | null
  fantasy: string | null
}

export async function insertLeadsBatch(
  client: PoolClient,
  leads: DbLead[],
): Promise<{ inserted: number; conflicts: number }> {
  if (leads.length === 0) return { inserted: 0, conflicts: 0 }

  const values: unknown[] = []
  const rowsSql: string[] = []

  for (let i = 0; i < leads.length; i += 1) {
    const base = i * 6
    rowsSql.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
    )

    const l = leads[i]!
    values.push(l.name, l.phone, l.city, l.state, l.company, l.fantasy)
  }

  const sql = `
    INSERT INTO leads (name, phone, city, state, company, fantasy)
    VALUES ${rowsSql.join(",\n")}
    ON CONFLICT (phone) DO NOTHING
    RETURNING id
  `

  const res = await client.query(sql, values)
  const inserted = res.rowCount ?? 0
  return { inserted, conflicts: Math.max(0, leads.length - inserted) }
}

export async function upsertLeadsBatch(
  client: PoolClient,
  leads: DbLead[],
): Promise<{ insertedOrUpdated: number }> {
  if (leads.length === 0) return { insertedOrUpdated: 0 }

  const values: unknown[] = []
  const rowsSql: string[] = []

  for (let i = 0; i < leads.length; i += 1) {
    const base = i * 6
    rowsSql.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
    )

    const l = leads[i]!
    values.push(l.name, l.phone, l.city, l.state, l.company, l.fantasy)
  }

  const sql = `
    INSERT INTO leads (name, phone, city, state, company, fantasy)
    VALUES ${rowsSql.join(",\n")}
    ON CONFLICT (phone)
    DO UPDATE SET
      name = COALESCE(EXCLUDED.name, leads.name),
      city = COALESCE(EXCLUDED.city, leads.city),
      state = COALESCE(EXCLUDED.state, leads.state),
      company = COALESCE(EXCLUDED.company, leads.company),
      fantasy = COALESCE(EXCLUDED.fantasy, leads.fantasy)
  `

  const res = await client.query(sql, values)
  return { insertedOrUpdated: res.rowCount ?? 0 }
}

export async function createImportLog(
  client: PoolClient,
  input: {
    fileName: string
    totalRows: number
    validRows: number
    invalidRows: number
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO import_logs (file_name, total_rows, valid_rows, invalid_rows)
      VALUES ($1, $2, $3, $4)
    `,
    [input.fileName, input.totalRows, input.validRows, input.invalidRows],
  )
}
