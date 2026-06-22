import sharp from 'sharp'

// Downscale to the target grid with nearest-neighbour (no smoothing) and
// optionally quantize the palette, so the output reads as clean pixel art.
export async function postprocessPixelArt(
  input: Buffer,
  opts: { width: number; height: number; colours?: number },
): Promise<Buffer> {
  const img = sharp(input).resize(opts.width, opts.height, { kernel: 'nearest', fit: 'fill' })
  return (opts.colours ? img.png({ palette: true, colours: opts.colours }) : img.png()).toBuffer()
}

// Deterministic placeholder pixel-art used until a Replicate token is configured
// (step 5 end-to-end flow without spending money).
export async function makeDummyPng(width: number, height: number, seedText: string): Promise<Buffer> {
  const grid = 16
  const cell = Math.max(1, Math.floor(Math.min(width, height) / grid)) || 1
  let h = 2166136261
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const rects: string[] = []
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      h = Math.imul(h ^ (x * 73856093) ^ (y * 19349663), 2654435761)
      if ((h >>> 28) % 3 === 0) {
        const r = (h >>> 16) & 0xff
        const g = (h >>> 8) & 0xff
        const b = h & 0xff
        rects.push(
          `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="rgb(${r},${g},${b})"/>`,
        )
      }
    }
  }
  const side = grid * cell
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><rect width="100%" height="100%" fill="#1a1a2e"/>${rects.join('')}</svg>`
  return sharp(Buffer.from(svg)).resize(width, height, { kernel: 'nearest', fit: 'fill' }).png().toBuffer()
}
