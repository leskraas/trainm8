import { expect, test } from 'vitest'
import { expandCompressedTimestamps } from './fit-compressed-timestamps.server.ts'

/**
 * Hand-built FIT files: the rewrite only reads the file header, definitions
 * and data-message lengths, so a body of raw messages is enough to drive it.
 */
function fitFile(body: number[]): Uint8Array {
	const header = [14, 0x20, 0, 0, 0, 0, 0, 0, 0x2e, 0x46, 0x49, 0x54, 0, 0]
	const size = body.length
	header[4] = size & 0xff
	header[5] = (size >>> 8) & 0xff
	header[6] = (size >>> 16) & 0xff
	header[7] = (size >>> 24) & 0xff
	const file = new Uint8Array(header.length + size + 2)
	file.set(header, 0)
	file.set(body, header.length)
	return file
}

/** A definition for local type 0, little-endian, of one-byte fields. */
function definition(fields: Array<{ num: number; size: number }>): number[] {
	return [
		0x40,
		0,
		0,
		20,
		0, // global message 20 (record)
		fields.length,
		...fields.flatMap((f) => [f.num, f.size, 0x02]),
	]
}

const TIMESTAMP_RECORD = [0x40, 0, 0, 20, 0, 2, 253, 4, 0x86, 3, 1, 0x02]

test('a definition with a zero-size field is refused', () => {
	const body = [
		...definition([{ num: 3, size: 0 }]),
		0x80, // compressed message, local 0
	]
	expect(() => expandCompressedTimestamps(fitFile(body))).toThrow(
		/zero-size field/,
	)
})

test('a file that would grow past twice its size is refused, not expanded', () => {
	// Alternating compressed and normal messages of a 255-field layout force the
	// rewrite to re-emit the definition before every message: each 256-byte
	// message would come out as roughly 1 KB.
	const wide = definition(
		Array.from({ length: 255 }, (_, i) => ({ num: i % 250, size: 1 })),
	)
	const message = (header: number) => [header, ...new Array(255).fill(1)]
	const body = [
		...TIMESTAMP_RECORD,
		0x00,
		0x00,
		0x00,
		0x00,
		0x00,
		0x00, // full timestamp 0, heart rate 0
		...wide,
	]
	for (let i = 0; i < 4000; i++) {
		body.push(...message(i % 2 === 0 ? 0x80 : 0x00))
	}
	expect(() => expandCompressedTimestamps(fitFile(body))).toThrow(/larger than/)
})

test('a large ordinary file with one compressed message is rewritten', () => {
	// Several megabytes of normal messages: the rewrite must not build the
	// output with argument spreads, which overflow on big files.
	const body = [...TIMESTAMP_RECORD]
	const count = 600_000
	for (let i = 0; i < count; i++) {
		body.push(0x00, i & 0xff, (i >>> 8) & 0xff, (i >>> 16) & 0xff, 0, 120)
	}
	body.push(0x80 | 5, 130) // compressed: 5 s past the last full timestamp's low bits
	const input = fitFile(body)

	const out = expandCompressedTimestamps(input)

	// The compressed message became a normal one with its timestamp appended,
	// after a definition that adds field 253.
	expect(out.length).toBeGreaterThan(input.length)
	expect(out.length).toBeLessThan(input.length + 64)
	const dataSize =
		out[4]! + out[5]! * 2 ** 8 + out[6]! * 2 ** 16 + out[7]! * 2 ** 24
	expect(dataSize).toBe(out.length - 14 - 2)
})
