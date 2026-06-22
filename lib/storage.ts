import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'

// All persistent data lives under DATA_DIR (a named volume in prod). Atomic
// writes use tmp+rename WITHIN DATA_DIR so rename never crosses devices.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
const CANVAS_FILE = path.join(DATA_DIR, 'canvas.json')
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')
const GENERATED_DIR = path.join(DATA_DIR, 'generated')

export function newId(): string {
  return crypto.randomBytes(8).toString('hex')
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  await fs.mkdir(GENERATED_DIR, { recursive: true })
}

async function atomicWrite(file: string, data: Buffer | string): Promise<void> {
  await ensureDirs()
  const tmp = path.join(DATA_DIR, `.tmp-${newId()}`)
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, file)
}

export async function readCanvas(): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(CANVAS_FILE, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    // Corrupt/unparseable: back up, never overwrite blindly. Start empty.
    try {
      await fs.rename(CANVAS_FILE, `${CANVAS_FILE}.corrupt-${Date.now()}`)
    } catch {
      /* best effort */
    }
    return null
  }
}

export async function writeCanvas(snapshot: unknown): Promise<void> {
  await atomicWrite(CANVAS_FILE, JSON.stringify(snapshot))
}

// Move the current canvas.json aside (best effort). Used when the client can
// parse the JSON but tldraw cannot load it, so a fresh save won't lose it.
export async function backupCanvas(): Promise<void> {
  try {
    await fs.rename(CANVAS_FILE, `${CANVAS_FILE}.bad-${Date.now()}`)
  } catch {
    /* nothing to back up */
  }
}

export async function saveUpload(buf: Buffer, ext: string): Promise<string> {
  const name = `${newId()}.${ext.replace(/[^a-z0-9]/gi, '') || 'png'}`
  await atomicWrite(path.join(UPLOADS_DIR, name), buf)
  return name
}

export async function saveGenerated(buf: Buffer): Promise<string> {
  const name = `${newId()}.png`
  await atomicWrite(path.join(GENERATED_DIR, name), buf)
  return name
}

// Resolve a /files/<bucket>/<name> request to an absolute path, guarding against
// path traversal and limiting to the two allowed buckets.
export function resolveFile(parts: string[]): string | null {
  const [bucket, ...rest] = parts
  if (bucket !== 'uploads' && bucket !== 'generated') return null
  if (rest.length === 0) return null
  const base = bucket === 'uploads' ? UPLOADS_DIR : GENERATED_DIR
  const resolved = path.normalize(path.join(base, ...rest))
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null
  return resolved
}
