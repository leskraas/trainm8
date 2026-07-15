/**
 * PROTOTYPE — throwaway (wayfinder #330, map #326). Delete or absorb.
 *
 * Runs the segmentation pipeline over real stored Activity Streams (kody's
 * seeded Strava history — 50 real runs) plus the seed's synthetic 4×8'
 * threshold ride (known ground truth incl. a mid-rep pause), and writes a
 * self-contained HTML report visualizing detected segments against the raw
 * channels.
 *
 *   Run:    npx tsx prototypes/structure-detection/run.ts
 *   Output: prototypes/structure-detection/report.html
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
	analyze,
	DEFAULT_KNOBS,
	type Analysis,
	type Stream,
} from './pipeline.ts'

// Seed athlete thresholds (prisma/seed.ts): kody — LTHR 168, T-pace 4:00/km, FTP 250.
const THRESHOLDS = { ftp: 250, thresholdPaceSecPerKm: 240 }

type Activity = {
	name: string
	discipline: 'run' | 'bike'
	startedAt: string
	durationSec: number
	distanceM: number | null
	stream: Stream
}

// ------------------------------------------------------------- data loading

function loadKodyHistory(): Activity[] {
	const p = path.join(process.cwd(), 'prisma/seed-data/kody-strava-history.json')
	const data = JSON.parse(fs.readFileSync(p, 'utf8')) as {
		activities: Array<{
			startedAt: string
			durationSec: number
			distanceM: number | null
			discipline: string
			rawJson: string
			stream: {
				resolutionSec: number
				timeSec: string
				power: string | null
				heartrate: string | null
				pace: string | null
			} | null
		}>
	}
	return data.activities
		.filter((a) => a.stream && a.discipline === 'run')
		.map((a) => {
			let name = 'Run'
			try {
				name = (JSON.parse(a.rawJson) as { name?: string }).name ?? name
			} catch {}
			const s = a.stream!
			return {
				name,
				discipline: 'run' as const,
				startedAt: a.startedAt,
				durationSec: a.durationSec,
				distanceM: a.distanceM,
				stream: {
					resolutionSec: s.resolutionSec,
					timeSec: JSON.parse(s.timeSec) as number[],
					power: s.power ? JSON.parse(s.power) : undefined,
					heartrate: s.heartrate ? JSON.parse(s.heartrate) : undefined,
					pace: s.pace ? JSON.parse(s.pace) : undefined,
				},
			}
		})
}

/** The seed's synthetic threshold ride — copied from prisma/seed.ts
 * buildDemoRideStream() so we have a bike case with known ground truth:
 * warm-up ramp → 4 × (8' @ ~250 W + 3' recovery, rep 2 paused mid-rep) →
 * cool-down. */
function buildDemoRide(): Activity {
	const segments: Array<{
		sec: number
		watts: (frac: number) => number
		pauseAt?: number
		pauseLen?: number
	}> = [
		{ sec: 600, watts: (f) => 130 + 60 * f },
		{ sec: 480, watts: () => 252 },
		{ sec: 180, watts: () => 135 },
		{ sec: 480, watts: () => 248, pauseAt: 220, pauseLen: 75 },
		{ sec: 180, watts: () => 135 },
		{ sec: 480, watts: () => 240 },
		{ sec: 180, watts: () => 135 },
		{ sec: 480, watts: () => 232 },
		{ sec: 300, watts: (f) => 145 - 25 * f },
	]
	const raw: { time: number[]; power: Array<number | null>; hr: number[] } = {
		time: [],
		power: [],
		hr: [],
	}
	let t = 0
	let hr = 108
	for (const seg of segments) {
		for (let s = 0; s < seg.sec; s++) {
			const paused =
				seg.pauseAt != null &&
				s >= seg.pauseAt &&
				s < seg.pauseAt + (seg.pauseLen ?? 0)
			raw.time.push(t)
			if (paused) {
				raw.power.push(null)
				hr = Math.max(96, hr - 0.45)
			} else {
				const base = seg.watts(s / seg.sec)
				raw.power.push(Math.max(0, Math.round(base + Math.sin(t / 13) * 5)))
				const targetHr = 108 + (base - 130) * 0.3
				hr += (targetHr - hr) * 0.04
			}
			raw.hr.push(Math.round(hr))
			t++
		}
	}
	// 5 s bucket-mean downsample (mirrors app/utils/activity-stream.ts policy)
	const res = 5
	const n = Math.floor(raw.time.length / res)
	const timeSec: number[] = []
	const power: Array<number | null> = []
	const heartrate: Array<number | null> = []
	for (let i = 0; i < n; i++) {
		timeSec.push(i * res)
		const pw = raw.power.slice(i * res, (i + 1) * res).filter(
			(v): v is number => v != null,
		)
		power.push(pw.length ? pw.reduce((a, b) => a + b, 0) / pw.length : null)
		const hh = raw.hr.slice(i * res, (i + 1) * res)
		heartrate.push(hh.reduce((a, b) => a + b, 0) / hh.length)
	}
	return {
		name: 'SYNTHETIC ground truth: 4 × 8 min @ threshold (rep 2 paused)',
		discipline: 'bike',
		startedAt: '2026-01-01T10:00:00Z',
		durationSec: raw.time.length,
		distanceM: null,
		stream: { resolutionSec: res, timeSec, power, heartrate },
	}
}

// ----------------------------------------------------------------- SVG viz

const BAND_COLORS = [
	'#dbeafe', // easiest
	'#bbf7d0',
	'#fef08a',
	'#fdba74',
	'#fca5a5',
	'#f0abfc',
	'#e9d5ff',
]

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const fmtClock = (sec: number) => {
	const h = Math.floor(sec / 3600)
	const m = Math.floor((sec % 3600) / 60)
	const s = Math.round(sec % 60)
	return h
		? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
		: `${m}:${String(s).padStart(2, '0')}`
}

function chartSvg(a: Activity, an: Analysis): string {
	const W = 960
	const H = 240
	const padL = 44
	const padR = 8
	const padT = 8
	const padB = 22
	const iw = W - padL - padR
	const ih = H - padT - padB
	const t = a.stream.timeSec
	const tMax = t[t.length - 1]! + a.stream.resolutionSec
	const x = (sec: number) => padL + (sec / tMax) * iw

	const edge = an.edgeChannel === 'power' ? a.stream.power! : a.stream.pace!
	const vals = edge.filter((v): v is number => v != null)
	// clamp pace outliers for display (GPS spikes)
	const sorted = [...vals].sort((a, b) => a - b)
	const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))]!
	const lo = an.edgeChannel === 'pace' ? Math.max(q(0.02) * 0.9, 120) : 0
	const hi = an.edgeChannel === 'pace' ? Math.min(q(0.98) * 1.15, 900) : q(1) * 1.05
	// pace axis inverted: faster (smaller sec/km) = higher
	const y = (v: number) => {
		const c = Math.max(lo, Math.min(hi, v))
		const f = (c - lo) / (hi - lo)
		return an.edgeChannel === 'pace' ? padT + f * ih : padT + (1 - f) * ih
	}

	let out = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">`

	// segment bands
	for (const [i, s] of an.segments.entries()) {
		const isWork = an.candidates[0]?.workSegs.includes(i)
		out += `<rect x="${x(s.startSec).toFixed(1)}" y="${padT}" width="${(x(s.endSec) - x(s.startSec)).toFixed(1)}" height="${ih}" fill="${BAND_COLORS[Math.min(s.band, BAND_COLORS.length - 1)]}" opacity="0.55"/>`
		if (isWork)
			out += `<rect x="${x(s.startSec).toFixed(1)}" y="${padT}" width="${(x(s.endSec) - x(s.startSec)).toFixed(1)}" height="3" fill="#7c3aed"/>`
	}
	// pauses
	for (const p of an.pauses) {
		out += `<rect x="${x(p.startSec).toFixed(1)}" y="${padT}" width="${Math.max(2, x(p.endSec) - x(p.startSec)).toFixed(1)}" height="${ih}" fill="#94a3b8" opacity="0.5"/>`
	}
	// changepoint lines + band labels
	for (const s of an.segments) {
		out += `<line x1="${x(s.startSec).toFixed(1)}" y1="${padT}" x2="${x(s.startSec).toFixed(1)}" y2="${padT + ih}" stroke="#0f172a" stroke-width="0.6" opacity="0.5"/>`
		if (x(s.endSec) - x(s.startSec) > 26)
			out += `<text x="${((x(s.startSec) + x(s.endSec)) / 2).toFixed(1)}" y="${padT + 14}" font-size="10" text-anchor="middle" fill="#334155">${esc(s.bandLabel)}</text>`
	}

	// HR (faint, own scale)
	const hrCh = a.stream.heartrate
	if (hrCh) {
		const hrVals = hrCh.filter((v): v is number => v != null)
		const hLo = Math.min(...hrVals) - 5
		const hHi = Math.max(...hrVals) + 5
		const hy = (v: number) => padT + (1 - (v - hLo) / (hHi - hLo)) * ih
		let d = ''
		let pen = false
		for (let i = 0; i < t.length; i++) {
			const v = hrCh[i]
			if (v == null) {
				pen = false
				continue
			}
			d += `${pen ? 'L' : 'M'}${x(t[i]!).toFixed(1)},${hy(v).toFixed(1)}`
			pen = true
		}
		out += `<path d="${d}" fill="none" stroke="#dc2626" stroke-width="0.8" opacity="0.45"/>`
	}

	// edge channel line
	{
		let d = ''
		let pen = false
		for (let i = 0; i < t.length; i++) {
			const v = edge[i]
			if (v == null) {
				pen = false
				continue
			}
			d += `${pen ? 'L' : 'M'}${x(t[i]!).toFixed(1)},${y(v).toFixed(1)}`
			pen = true
		}
		out += `<path d="${d}" fill="none" stroke="#0f172a" stroke-width="1.3"/>`
	}

	// segment mean steps
	for (const s of an.segments) {
		out += `<line x1="${x(s.startSec).toFixed(1)}" y1="${y(s.value).toFixed(1)}" x2="${x(s.endSec).toFixed(1)}" y2="${y(s.value).toFixed(1)}" stroke="#2563eb" stroke-width="2.2"/>`
	}

	// x axis ticks every 10 min
	for (let sec = 0; sec <= tMax; sec += 600) {
		out += `<text x="${x(sec).toFixed(1)}" y="${H - 6}" font-size="10" text-anchor="middle" fill="#64748b">${Math.round(sec / 60)}'</text>`
	}
	// y axis: threshold line
	out += `<line x1="${padL}" y1="${y(an.anchor).toFixed(1)}" x2="${W - padR}" y2="${y(an.anchor).toFixed(1)}" stroke="#0f172a" stroke-width="0.7" stroke-dasharray="4 3" opacity="0.6"/>`
	out += `<text x="4" y="${(y(an.anchor) + 3).toFixed(1)}" font-size="10" fill="#0f172a">${an.edgeChannel === 'pace' ? 'T-pace' : 'FTP'}</text>`

	out += `</svg>`
	return out
}

const fmtVal = (an: Analysis, v: number) =>
	an.edgeChannel === 'power'
		? `${Math.round(v)} W`
		: `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}/km`

function activitySection(a: Activity, an: Analysis, id: string): string {
	const date = a.startedAt.slice(0, 10)
	const segRows = an.segments
		.map(
			(s) =>
				`<tr><td>${fmtClock(s.startSec)}–${fmtClock(s.endSec)}</td><td>${fmtClock(s.durationSec)}</td><td>${esc(s.bandLabel)}</td><td>${fmtVal(an, s.value)}</td><td>${s.hr ?? '—'}</td></tr>`,
		)
		.join('')
	const candList = an.candidates
		.map(
			(c, i) =>
				`<li><strong>${esc(c.notation)}</strong> — score ${c.score.toFixed(2)} <span class="parts">(${Object.entries(
					c.scoreParts,
				)
					.map(([k, v]) => `${k} ${v}`)
					.join(', ')})</span>${i === 0 ? ' ← top' : ''}</li>`,
		)
		.join('')
	return `
<section id="${id}">
	<h2>${esc(a.name)} <span class="meta">${date} · ${fmtClock(a.durationSec)} · ${a.discipline}${a.distanceM ? ` · ${(a.distanceM / 1000).toFixed(1)} km` : ''}</span></h2>
	${chartSvg(a, an)}
	<p class="legend">black = ${an.edgeChannel}${an.edgeChannel === 'pace' ? ' (up = faster, display clamped at p2/p98)' : ''}, blue steps = segment means, red = HR, grey = pause, purple top bar = top candidate's work reps, dashed = threshold</p>
	<details><summary>${an.segments.length} segments</summary>
		<table><tr><th>span</th><th>dur</th><th>band</th><th>mean</th><th>HR*</th></tr>${segRows}</table>
		<p class="parts">*HR mean skips the segment's first 30 s (lag dodge)</p>
	</details>
	<ol class="cands">${candList || '<li>no candidates</li>'}</ol>
</section>`
}

// ---------------------------------------------------------------------- run

function main() {
	const activities = [buildDemoRide(), ...loadKodyHistory()]
	const knobs = DEFAULT_KNOBS
	const sections: string[] = []
	const index: string[] = []

	for (const [i, a] of activities.entries()) {
		const an = analyze(a.stream, a.discipline, THRESHOLDS, knobs)
		if (!an) continue
		const id = `a${i}`
		sections.push(activitySection(a, an, id))
		const top = an.candidates[0]
		index.push(
			`<tr><td><a href="#${id}">${esc(a.name)}</a></td><td>${a.startedAt.slice(0, 10)}</td><td>${fmtClock(a.durationSec)}</td><td>${an.segments.length}</td><td>${top ? esc(top.notation) : '—'}</td><td>${top ? top.score.toFixed(2) : '—'}</td></tr>`,
		)
	}

	const html = `<!doctype html>
<meta charset="utf-8">
<title>PROTOTYPE — structure detection on real streams (#330)</title>
<style>
	body { font: 14px/1.45 system-ui, sans-serif; margin: 24px auto; max-width: 1000px; color: #0f172a; padding: 0 12px; }
	h1 { font-size: 20px; } h2 { font-size: 15px; margin: 28px 0 6px; }
	.meta, .legend, .parts { color: #64748b; font-weight: normal; font-size: 12px; }
	table { border-collapse: collapse; font-size: 12px; margin: 6px 0; }
	td, th { border: 1px solid #e2e8f0; padding: 2px 8px; text-align: left; }
	.cands { margin: 6px 0 0; padding-left: 20px; }
	.banner { background: #fef9c3; border: 1px solid #facc15; padding: 8px 12px; border-radius: 6px; }
	section { border-top: 1px solid #e2e8f0; }
</style>
<h1>PROTOTYPE — structure detection on real streams (wayfinder #330)</h1>
<p class="banner">Throwaway prototype. Pipeline per #327: split at pauses → rolling median (${knobs.medianWindow}) → PELT L2 (penalty ${knobs.penaltyFactor}·log n, min dwell ${knobs.minSegSec}s) → zone bands (run: Daniels vs T-pace 4:00/km; bike: Coggan vs FTP 250 W) → same-band merge → repeat mining (top 3 candidates). Thresholds are kody's seed profile.</p>
<p>${index.length} activities: 1 synthetic ground-truth ride + real runs from <code>prisma/seed-data/kody-strava-history.json</code>.</p>
<table><tr><th>activity</th><th>date</th><th>dur</th><th>segs</th><th>top candidate</th><th>score</th></tr>${index.join('')}</table>
${sections.join('\n')}
`
	const out = path.join(process.cwd(), 'prototypes/structure-detection/report.html')
	fs.writeFileSync(out, html)
	console.log(`wrote ${out} (${activities.length} activities)`)
}

main()
