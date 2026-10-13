import { CrcCalculator } from '@garmin/fitsdk'

/**
 * Garmin's official FIT SDKs refuse a file that uses **compressed timestamp
 * headers** (header bit 7 set, local message type in bits 5–6, the low five
 * bits of the timestamp in bits 0–4): the JS decoder throws "compressed
 * timestamp messages are not currently supported". Devices that save space
 * this way still write valid FIT, so instead of a second decoder this rewrites
 * the file into the equivalent one with normal headers — each compressed
 * message becomes a normal data message carrying an explicit `timestamp`
 * (field 253) — and hands that to the official decoder.
 *
 * The rewrite follows the FIT protocol's own rule for the timestamp: the low
 * five bits roll over every 32 seconds, relative to the last full timestamp
 * any message carried. Definitions are re-emitted when a local type switches
 * between its original layout and the one with the timestamp appended.
 * Developer fields stay where the protocol puts them, after the regular fields.
 *
 * Returns the bytes unchanged when the file has no compressed header.
 */

const TIMESTAMP_FIELD = 253
const UINT32 = 0x86
const FIT_FILE_HEADER_MIN = 12

type Definition = {
	littleEndian: boolean
	globalNum: number
	fields: Array<{ num: number; size: number; baseType: number }>
	devFields: Array<{ num: number; size: number; devIndex: number }>
	fieldsSize: number
	devSize: number
	/** Byte offset of field 253 inside the data message, if the layout has one. */
	timestampOffset: number | null
}

const calculateCrc = (
	CrcCalculator as unknown as {
		calculateCRC: (buf: Uint8Array, start: number, end: number) => number
	}
).calculateCRC

export function expandCompressedTimestamps(bytes: Uint8Array): Uint8Array {
	const out: number[] = []
	let offset = 0
	let changed = false
	// A FIT file may be a chain of complete files; rewrite each in turn.
	while (offset + FIT_FILE_HEADER_MIN <= bytes.length) {
		const headerSize = bytes[offset]!
		const dataSize = readUint(bytes, offset + 4, 4, true)
		const bodyStart = offset + headerSize
		const bodyEnd = bodyStart + dataSize
		if (bodyEnd + 2 > bytes.length) break

		const body = rewriteBody(bytes.subarray(bodyStart, bodyEnd))
		if (body.changed) changed = true

		const header = Array.from(bytes.subarray(offset, offset + headerSize))
		writeUint(header, 4, body.bytes.length, 4)
		if (headerSize >= 14) {
			const crc = calculateCrc(Uint8Array.from(header), 0, 12)
			header[12] = crc & 0xff
			header[13] = crc >>> 8
		}
		const file = [...header, ...body.bytes]
		const crc = calculateCrc(Uint8Array.from(file), 0, file.length)
		out.push(...file, crc & 0xff, crc >>> 8)
		offset = bodyEnd + 2
	}
	return changed ? Uint8Array.from(out) : bytes
}

function rewriteBody(body: Uint8Array): { bytes: number[]; changed: boolean } {
	const out: number[] = []
	const definitions = new Map<number, Definition>()
	/** Which layout of each local type the output last defined. */
	const emitted = new Map<number, 'original' | 'with-timestamp'>()
	let lastTimestamp: number | null = null
	let changed = false
	let pos = 0

	const emitDefinition = (
		local: number,
		def: Definition,
		layout: 'original' | 'with-timestamp',
	) => {
		if (emitted.get(local) === layout) return
		emitted.set(local, layout)
		const fields =
			layout === 'with-timestamp'
				? [...def.fields, { num: TIMESTAMP_FIELD, size: 4, baseType: UINT32 }]
				: def.fields
		const hasDev = def.devFields.length > 0
		out.push(0x40 | (hasDev ? 0x20 : 0) | local, 0, def.littleEndian ? 0 : 1)
		const global: number[] = [0, 0]
		writeUint(global, 0, def.globalNum, 2, def.littleEndian)
		out.push(...global, fields.length)
		for (const f of fields) out.push(f.num, f.size, f.baseType)
		if (hasDev) {
			out.push(def.devFields.length)
			for (const f of def.devFields) out.push(f.num, f.size, f.devIndex)
		}
	}

	while (pos < body.length) {
		const header = body[pos]!
		if (header & 0x80) {
			// Compressed timestamp header.
			const local = (header >> 5) & 0x03
			const def = definitions.get(local)
			if (!def) throw new Error('FIT message uses an undefined local type')
			if (lastTimestamp == null) {
				throw new Error('FIT compressed timestamp before any full timestamp')
			}
			const offset5 = header & 0x1f
			lastTimestamp =
				lastTimestamp + ((offset5 - (lastTimestamp & 0x1f)) & 0x1f)
			const fields = body.subarray(pos + 1, pos + 1 + def.fieldsSize)
			const dev = body.subarray(
				pos + 1 + def.fieldsSize,
				pos + 1 + def.fieldsSize + def.devSize,
			)
			emitDefinition(local, def, 'with-timestamp')
			const ts: number[] = [0, 0, 0, 0]
			writeUint(ts, 0, lastTimestamp, 4, def.littleEndian)
			out.push(local, ...fields, ...ts, ...dev)
			pos += 1 + def.fieldsSize + def.devSize
			changed = true
		} else if (header & 0x40) {
			// Definition message: remembered, written out lazily.
			const local = header & 0x0f
			const hasDev = (header & 0x20) !== 0
			const littleEndian = body[pos + 2] === 0
			const globalNum = readUint(body, pos + 3, 2, littleEndian)
			const count = body[pos + 5]!
			let cursor = pos + 6
			const fields: Definition['fields'] = []
			for (let i = 0; i < count; i++, cursor += 3) {
				fields.push({
					num: body[cursor]!,
					size: body[cursor + 1]!,
					baseType: body[cursor + 2]!,
				})
			}
			const devFields: Definition['devFields'] = []
			if (hasDev) {
				const devCount = body[cursor]!
				cursor += 1
				for (let i = 0; i < devCount; i++, cursor += 3) {
					devFields.push({
						num: body[cursor]!,
						size: body[cursor + 1]!,
						devIndex: body[cursor + 2]!,
					})
				}
			}
			let timestampOffset: number | null = null
			let fieldsSize = 0
			for (const f of fields) {
				if (f.num === TIMESTAMP_FIELD && f.size === 4) {
					timestampOffset = fieldsSize
				}
				fieldsSize += f.size
			}
			definitions.set(local, {
				littleEndian,
				globalNum,
				fields,
				devFields,
				fieldsSize,
				devSize: devFields.reduce((sum, f) => sum + f.size, 0),
				timestampOffset,
			})
			emitted.delete(local)
			pos = cursor
		} else {
			// Normal data message.
			const local = header & 0x0f
			const def = definitions.get(local)
			if (!def) throw new Error('FIT message uses an undefined local type')
			const size = def.fieldsSize + def.devSize
			if (def.timestampOffset != null) {
				lastTimestamp = readUint(
					body,
					pos + 1 + def.timestampOffset,
					4,
					def.littleEndian,
				)
			}
			emitDefinition(local, def, 'original')
			out.push(...body.subarray(pos, pos + 1 + size))
			pos += 1 + size
		}
	}
	return { bytes: out, changed }
}

function readUint(
	buf: Uint8Array,
	at: number,
	size: number,
	littleEndian: boolean,
): number {
	let value = 0
	for (let i = 0; i < size; i++) {
		const byte = buf[littleEndian ? at + i : at + size - 1 - i]!
		value += byte * 2 ** (8 * i)
	}
	return value
}

function writeUint(
	out: number[],
	at: number,
	value: number,
	size: number,
	littleEndian = true,
) {
	for (let i = 0; i < size; i++) {
		const byte = Math.floor(value / 2 ** (8 * i)) & 0xff
		out[littleEndian ? at + i : at + size - 1 - i] = byte
	}
}
