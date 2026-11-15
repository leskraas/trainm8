/**
 * Tommel's whole look, as one stylesheet. Dark by default (the card is the
 * light in the room), light when the system asks. Every hover sits behind
 * `(hover: hover) and (pointer: fine)`; every movement has a reduced-motion
 * twin that only fades.
 */
export const STYLES = String.raw`
.tm {
	--bg: #0e0e0e;
	--fg: #f2f2ee;
	--muted: #8a8a8a;
	--line: rgba(255, 255, 255, 0.12);
	--card: #fafaf7;
	--ink: #111111;
	--ink2: #5d5d58;
	--inkline: rgba(17, 17, 17, 0.1);
	--yes: #1f9d55;
	--no: #3a3a3a;
	--over: #d9480f;
	--under: #1971c2;
	--hit: #1f9d55;
	--unknown: #8a8a8a;
	--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
	--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
	--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
	--safe-t: env(safe-area-inset-top, 0px);
	--safe-b: env(safe-area-inset-bottom, 0px);
	color-scheme: dark;
	background: var(--bg);
	color: var(--fg);
	font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
	font-size: 16px;
	line-height: 1.45;
	min-height: 100dvh;
	-webkit-tap-highlight-color: transparent;
	-webkit-text-size-adjust: 100%;
	-webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: light) {
	.tm {
		--bg: #e9e9e4;
		--fg: #111111;
		--muted: #6b6b66;
		--line: rgba(17, 17, 17, 0.1);
		--card: #ffffff;
		color-scheme: light;
	}
}
html:has(.tm), body:has(.tm) {
	background: #0e0e0e;
	overscroll-behavior: none;
}
@media (prefers-color-scheme: light) {
	html:has(.tm), body:has(.tm) { background: #e9e9e4; }
}
:where(.tm) *, :where(.tm) *::before, :where(.tm) *::after { box-sizing: border-box; }
.tm button, .tm a, .tm [role='button'], .tm label {
	touch-action: manipulation;
	-webkit-user-select: none;
	user-select: none;
	-webkit-touch-callout: none;
}
:where(.tm) button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
:where(.tm) a { color: inherit; text-decoration: none; }
:where(.tm) :is(input, textarea, select) { font: inherit; font-size: 16px; }
.tm .num { font-variant-numeric: tabular-nums; }
.tm :focus-visible { outline: 2px solid var(--yes); outline-offset: 3px; }

/* ── the deck screen ───────────────────────────────────────────────── */
.tm-deck {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr) auto;
	min-height: 100dvh;
	height: 100dvh;
	padding: calc(var(--safe-t) + 8px) 16px calc(var(--safe-b) + 14px);
	max-width: 452px;
	margin: 0 auto;
}
.tm-top {
	height: 48px;
	display: flex;
	align-items: center;
	gap: 4px;
	padding-right: 120px; /* the app switcher lives top-right */
}
.tm-iconbtn {
	min-width: 44px;
	height: 44px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	border-radius: 22px;
	color: var(--fg);
	font-size: 15px;
	padding: 0 10px;
	transition: transform 120ms var(--ease-out), background-color 120ms ease;
}
.tm-iconbtn:active { transform: scale(0.96); background: var(--line); }
.tm-iconbtn[hidden] { display: none; }
.tm-cardzone {
	position: relative;
	display: flex;
	align-items: stretch;
	justify-content: center;
	min-height: 0;
}
.tm-rise {
	position: relative;
	width: 100%;
	min-width: 0;
	display: flex;
	animation: tm-rise 200ms var(--ease-out);
}
.tm-rise.is-instant { animation: none; }
@keyframes tm-rise {
	from { transform: translateY(14px) scale(0.965); opacity: 0.4; }
}
@keyframes tm-fade { from { opacity: 0; } }
.tm-drag {
	position: relative;
	width: 100%;
	min-width: 0;
	display: flex;
	touch-action: pan-y;
	will-change: transform;
}
.tm-drag.is-vertical { touch-action: pan-x; }

/* the card itself */
.tm-flip { position: relative; width: 100%; min-width: 0; perspective: 1400px; display: flex; }
.tm-flip-inner {
	position: relative;
	width: 100%;
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	transform-style: preserve-3d;
	transition: transform 300ms var(--ease-in-out);
}
.tm-flip.is-flipped .tm-flip-inner { transform: rotateY(180deg); }
.tm-face {
	grid-area: 1 / 1;
	min-width: 0;
	-webkit-backface-visibility: hidden;
	backface-visibility: hidden;
	min-height: 0;
}
.tm-face.back { transform: rotateY(180deg); }
.tm-card {
	position: relative;
	background: var(--card);
	color: var(--ink);
	border-radius: 24px;
	padding: 22px 22px 18px;
	display: flex;
	flex-direction: column;
	min-height: 100%;
	box-shadow: 0 1px 0 rgba(255,255,255,0.4) inset, 0 18px 40px -18px rgba(0,0,0,0.55);
	overflow: hidden;
}
@media (prefers-color-scheme: light) {
	.tm-card { box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 16px 36px -20px rgba(0,0,0,0.3); }
}
.tm-card-scroll {
	flex: 1 1 auto;
	min-height: 0;
	overflow-y: auto;
	overscroll-behavior: contain;
	margin: 0 -22px;
	padding: 0 22px;
}
.tm-topic {
	font-size: 13px;
	font-weight: 600;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--ink2);
	display: flex;
	justify-content: space-between;
	gap: 12px;
}
.tm-q {
	margin: 18px 0 0;
	font-size: clamp(26px, 7.6vw, 32px);
	line-height: 1.12;
	font-weight: 600;
	letter-spacing: -0.022em;
	overflow-wrap: anywhere;
	text-wrap: balance;
}
.tm-topic > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tm-topic > span:last-child:not(:first-child) { flex-shrink: 0; white-space: nowrap; }
.tm-reason { margin: 12px 0 0; font-size: 16px; color: var(--ink2); overflow-wrap: anywhere; text-wrap: pretty; }
.tm-extra { margin-top: 18px; }
.tm-spacer { flex: 1 1 auto; min-height: 16px; }
.tm-answers {
	display: grid;
	grid-template-columns: 72px 1fr 72px;
	align-items: center;
	gap: 8px;
	padding-top: 8px;
}
.tm-target {
	width: 72px;
	height: 72px;
	border-radius: 50%;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	color: #fff;
	transition: transform 120ms var(--ease-out), filter 120ms ease;
}
.tm-target.yes { background: var(--yes); }
.tm-target.no { background: var(--no); }
.tm-target:active { transform: scale(0.94); filter: brightness(0.92); }
.tm-target:disabled { opacity: 0.45; }
.tm-target-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.tm-why {
	justify-self: center;
	min-height: 44px;
	padding: 0 12px;
	font-size: 14px;
	color: var(--ink2);
	text-decoration: underline;
	text-decoration-color: var(--inkline);
	text-underline-offset: 4px;
}
.tm-wide {
	min-height: 56px;
	width: 100%;
	border-radius: 28px;
	font-weight: 600;
	font-size: 17px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	padding: 0 20px;
	transition: transform 120ms var(--ease-out), filter 120ms ease;
}
.tm-wide.yes { background: var(--yes); color: #fff; }
.tm-wide.ink { background: var(--ink); color: var(--card); }
.tm-wide.ghost { background: transparent; color: var(--ink2); min-height: 44px; font-weight: 500; font-size: 15px; }
.tm-wide.danger { background: var(--over); color: #fff; }
.tm-wide:active { transform: scale(0.98); filter: brightness(0.94); }
.tm-wide:disabled { opacity: 0.5; }
.tm-stamp {
	position: absolute;
	top: 22px;
	padding: 4px 12px;
	border-radius: 10px;
	font-weight: 700;
	font-size: 15px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	opacity: 0;
	pointer-events: none;
	z-index: 2;
}
.tm-stamp.yes { right: 22px; color: var(--yes); border: 2px solid var(--yes); }
.tm-stamp.no { left: 22px; color: var(--no); border: 2px solid var(--no); }
.tm-stamp.up { left: 50%; top: 22px; transform: translateX(-50%); color: var(--over); border: 2px solid var(--over); }

/* back of the card */
.tm-back-title { font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink2); }
.tm-back-body { margin-top: 14px; font-size: 17px; line-height: 1.5; overflow-wrap: anywhere; }
.tm-back-body p { margin: 0 0 12px; }
.tm-back-body b { font-weight: 600; }

/* the stack under the card */
.tm-stack {
	height: 60px;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	color: var(--muted);
	font-size: 14px;
}
.tm-stack-bars { display: grid; gap: 3px; width: 64px; }
.tm-stack-bars i { display: block; height: 3px; border-radius: 2px; background: var(--line); }
.tm-stack-bars i:nth-child(2) { margin: 0 5px; }
.tm-stack-bars i:nth-child(3) { margin: 0 10px; }

/* pending and quiet text */
.tm-wait { color: var(--ink2); font-size: 15px; }
.tm-dots::after { content: '…'; }

/* ── pieces inside cards ──────────────────────────────────────────── */
.tm-unknown {
	display: inline-block;
	color: var(--unknown);
	border: 1px dashed currentColor;
	border-radius: 6px;
	padding: 0 0.28em;
	line-height: 1.15;
	font-weight: inherit;
}
.tm-rows { display: grid; gap: 0; border-top: 1px solid var(--inkline); }
.tm-row {
	display: grid;
	grid-template-columns: minmax(0, 7.5em) minmax(0, 1fr);
	gap: 12px;
	padding: 11px 0;
	border-bottom: 1px solid var(--inkline);
	font-size: 15px;
}
.tm-row > :first-child { color: var(--ink2); overflow-wrap: anywhere; }
.tm-row > :last-child { overflow-wrap: anywhere; }
.tm-ba { display: grid; gap: 8px; }
.tm-ba-row {
	display: grid;
	grid-template-columns: 3.6em minmax(0, 1fr);
	gap: 10px;
	align-items: baseline;
	padding: 10px 12px;
	border-radius: 12px;
	background: rgba(17,17,17,0.045);
	font-size: 15px;
}
.tm-ba-row.after { background: rgba(31,157,85,0.12); }
.tm-ba-row > b { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink2); font-weight: 600; }
.tm-ba-row s { color: var(--ink2); }
.tm-ba-row div { overflow-wrap: anywhere; }
.tm-big { font-size: 64px; line-height: 1; font-weight: 700; letter-spacing: -0.035em; }
.tm-big.over { color: var(--over); }
.tm-big.under { color: var(--under); }
.tm-big.on-target { color: var(--hit); }
.tm-big.none { color: var(--unknown); }
.tm-pairs { display: grid; gap: 10px; margin-top: 18px; }
.tm-pair { display: grid; grid-template-columns: minmax(0, 1fr) auto 18px auto; gap: 8px; align-items: baseline; font-size: 16px; }
.tm-pair > span:first-child { color: var(--ink2); }
.tm-pair .arrow { color: var(--ink2); text-align: center; }
.tm-scale { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); border-radius: 14px; overflow: hidden; border: 1px solid var(--inkline); }
.tm-scale button {
	height: 60px;
	font-size: 18px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	border-left: 1px solid var(--inkline);
	color: var(--ink);
	transition: background-color 120ms ease, transform 120ms var(--ease-out);
}
.tm-scale button:first-child { border-left: 0; }
.tm-scale button:active { background: rgba(31,157,85,0.18); }
.tm-scale button[aria-pressed='true'] { background: var(--yes); color: #fff; }
.tm-scale-legend { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink2); margin-top: 8px; }
.tm-field { display: grid; gap: 6px; margin-top: 14px; }
.tm-field > span { font-size: 13px; color: var(--ink2); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.tm-input {
	width: 100%;
	min-height: 52px;
	border-radius: 14px;
	border: 1px solid var(--inkline);
	background: rgba(17,17,17,0.03);
	color: var(--ink);
	padding: 12px 14px;
}
textarea.tm-input { min-height: 120px; resize: vertical; line-height: 1.45; }
.tm-input:focus { outline: 2px solid var(--yes); outline-offset: 0; border-color: transparent; }
.tm-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.tm-chip {
	min-height: 44px;
	padding: 0 16px;
	border-radius: 22px;
	border: 1px solid rgba(17, 17, 17, 0.18);
	font-size: 15px;
	font-weight: 500;
	color: var(--ink);
	background: transparent;
	transition: transform 120ms var(--ease-out), background-color 120ms ease;
}
.tm-chip:active { transform: scale(0.96); }
.tm-chip[aria-pressed='true'] { background: var(--ink); color: var(--card); border-color: var(--ink); }
.tm-err { color: var(--over); font-size: 15px; margin-top: 10px; }
.tm-note { font-size: 14px; color: var(--ink2); margin-top: 10px; }

/* wheels: native scroll physics, snapped */
.tm-wheels { display: flex; gap: 6px; justify-content: center; position: relative; }
.tm-wheels::before {
	content: '';
	position: absolute;
	left: 0; right: 0; top: 50%;
	height: 44px;
	transform: translateY(-50%);
	border-radius: 12px;
	background: rgba(17,17,17,0.06);
	pointer-events: none;
}
.tm-wheel {
	position: relative;
	height: 220px;
	min-width: 64px;
	overflow-y: auto;
	scroll-snap-type: y mandatory;
	overscroll-behavior: contain;
	scrollbar-width: none;
	-webkit-mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
	mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
	padding: 88px 0;
	touch-action: pan-y;
	outline: none;
}
.tm-wheel::-webkit-scrollbar { display: none; }
.tm-wheel:focus-visible { outline: 2px solid var(--yes); outline-offset: -2px; border-radius: 12px; }
.tm-wheel div {
	height: 44px;
	display: flex;
	align-items: center;
	justify-content: center;
	scroll-snap-align: center;
	font-size: 22px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	padding: 0 10px;
	color: var(--ink);
	user-select: none;
	-webkit-user-select: none;
	white-space: nowrap;
}
.tm-wheel-sep { align-self: center; font-size: 22px; font-weight: 600; color: var(--ink2); }
.tm-wheel-unit { align-self: center; font-size: 15px; color: var(--ink2); }

/* hold to confirm (the accessible twin of swipe-up-to-delete) */
.tm-hold { position: relative; overflow: hidden; }
.tm-hold::before {
	content: '';
	position: absolute;
	inset: 0;
	background: rgba(0,0,0,0.28);
	clip-path: inset(0 100% 0 0);
	transition: clip-path 200ms var(--ease-out);
}
.tm-hold.is-holding::before { clip-path: inset(0 0 0 0); transition: clip-path 2s linear; }
.tm-hold > span { position: relative; }
.tm-swipeup-hint { display: grid; justify-items: center; gap: 6px; color: var(--over); font-weight: 600; font-size: 15px; margin-top: 8px; }

/* ── Ro-skjermen ───────────────────────────────────────────────────── */
.tm-ro {
	position: relative;
	display: grid;
	grid-template-rows: auto minmax(0, 1fr) auto;
	height: 100dvh;
	padding: calc(var(--safe-t) + 8px) 20px calc(var(--safe-b) + 10px);
	max-width: 452px;
	margin: 0 auto;
	-webkit-user-select: none;
	user-select: none;
	-webkit-touch-callout: none;
}
.tm-ro-scroll { overflow-y: auto; overscroll-behavior: contain; min-height: 0; padding-bottom: 28px; -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent); margin: 0 -20px; padding-left: 20px; padding-right: 20px; }
.tm-ro-press { transform-origin: 50% 20%; transition: transform 200ms var(--ease-out); }
.tm-ro-press.is-pressing { transform: scale(0.985); transition: transform 600ms linear; }
.tm-ro-date { color: var(--muted); font-size: 15px; margin-top: 16px; }
.tm-ro-title {
	margin: 10px 0 0;
	font-size: clamp(40px, 12vw, 56px);
	line-height: 1.02;
	font-weight: 700;
	letter-spacing: -0.035em;
	overflow-wrap: anywhere;
	text-wrap: balance;
}
.tm-ro-sub { margin-top: 10px; font-size: 18px; color: var(--muted); overflow-wrap: anywhere; }
.tm-ro-rows { margin-top: 26px; display: grid; border-top: 1px solid var(--line); }
.tm-ro-row {
	display: grid;
	grid-template-columns: minmax(0, 7em) minmax(0, 1fr);
	gap: 14px;
	padding: 13px 0;
	border-bottom: 1px solid var(--line);
	font-size: 16px;
	line-height: 1.4;
}
.tm-ro-row > :first-child { color: var(--muted); overflow-wrap: anywhere; }
.tm-ro-row > :last-child { overflow-wrap: anywhere; }
.tm-ro-also { margin-top: 18px; color: var(--muted); font-size: 15px; overflow-wrap: anywhere; }
.tm-ro .tm-unknown { color: var(--muted); }
.tm-ro-bottom { display: grid; gap: 6px; justify-items: center; padding-top: 6px; }
.tm-passer {
	min-height: 52px;
	padding: 0 26px;
	border-radius: 26px;
	border: 1px solid var(--line);
	color: var(--fg);
	font-size: 16px;
	font-weight: 600;
	transition: transform 120ms var(--ease-out), background-color 120ms ease;
}
.tm-passer:active { transform: scale(0.97); background: var(--line); }
.tm-handle {
	min-height: 44px;
	display: inline-flex;
	align-items: center;
	gap: 10px;
	color: var(--muted);
	font-size: 13px;
	padding: 0 14px;
}
.tm-handle i { display: block; width: 36px; height: 4px; border-radius: 2px; background: var(--line); }
.tm-ro-stack {
	display: inline-flex;
	align-items: center;
	gap: 12px;
	min-height: 52px;
	padding: 0 18px 0 14px;
	border-radius: 26px;
	background: var(--card);
	color: var(--ink);
	font-weight: 600;
	font-size: 15px;
	box-shadow: 0 10px 24px -14px rgba(0,0,0,0.6);
	transition: transform 120ms var(--ease-out);
}
.tm-ro-stack:active { transform: scale(0.97); }
.tm-ro-stack b {
	min-width: 28px;
	height: 28px;
	border-radius: 14px;
	background: var(--yes);
	color: #fff;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-variant-numeric: tabular-nums;
}
.tm-hint { color: var(--muted); font-size: 12px; text-align: center; }

/* ── long pages: Status, Planarket, Endringer ─────────────────────── */
.tm-page {
	max-width: 560px;
	margin: 0 auto;
	padding: calc(var(--safe-t) + 8px) 20px calc(var(--safe-b) + 40px);
	min-height: 100dvh;
}
.tm-page h1 { font-size: 34px; line-height: 1.1; letter-spacing: -0.025em; margin: 14px 0 4px; font-weight: 700; }
.tm-page h2 { font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: 34px 0 12px; }
.tm-page p { margin: 0; }
.tm-lead { color: var(--muted); font-size: 16px; overflow-wrap: anywhere; }
.tm-big-line { font-size: 26px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.2; overflow-wrap: anywhere; }
.tm-bands { display: flex; gap: 3px; height: 30px; margin-top: 12px; }
.tm-band { border-radius: 6px; background: var(--line); position: relative; min-width: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--muted); overflow: hidden; white-space: nowrap; }
.tm-band.current { background: var(--fg); color: var(--bg); font-weight: 600; }
.tm-band-legend { display: flex; justify-content: space-between; color: var(--muted); font-size: 13px; margin-top: 8px; gap: 12px; }
.tm-list { display: grid; border-top: 1px solid var(--line); }
.tm-li {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 12px;
	align-items: center;
	padding: 12px 0;
	border-bottom: 1px solid var(--line);
	min-height: 56px;
	transition: background-color 120ms ease;
}
a.tm-li:active { background: var(--line); }
.tm-li-main { min-width: 0; }
.tm-li-title { font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tm-li-sub { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
.tm-word { font-weight: 700; font-size: 15px; }
.tm-word.over { color: var(--over); }
.tm-word.under { color: var(--under); }
.tm-word.on-target { color: var(--hit); }
.tm-word.none { color: var(--unknown); font-weight: 500; }
.tm-vol { display: grid; gap: 14px; }
.tm-vol-row { display: grid; gap: 6px; }
.tm-vol-head { display: flex; justify-content: space-between; gap: 12px; font-size: 15px; }
.tm-vol-head > span:first-child { color: var(--muted); }
.tm-track { height: 8px; border-radius: 4px; background: var(--line); position: relative; overflow: hidden; }
.tm-track i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: var(--fg); }
.tm-track u { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--yes); }
.tm-chart { width: 100%; height: auto; display: block; overflow: visible; }
.tm-legend { display: flex; gap: 18px; color: var(--muted); font-size: 13px; margin-top: 8px; flex-wrap: wrap; }
.tm-legend span { display: inline-flex; align-items: center; gap: 6px; }
.tm-legend i { display: inline-block; width: 16px; height: 2px; background: var(--fg); }
.tm-legend i.dash { background: repeating-linear-gradient(90deg, var(--muted) 0 4px, transparent 4px 7px); }
.tm-weekbars { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; align-items: end; height: 120px; }
.tm-weekbar { display: grid; align-items: end; height: 100%; position: relative; }
.tm-weekbar span { display: block; border-radius: 3px 3px 0 0; background: var(--fg); }
.tm-weekbar.phase-recovery span { background: var(--muted); }
.tm-weekbar.phase-taper span { background: var(--muted); }
.tm-weekbar.now span { background: var(--yes); }
.tm-weekbar.unknown { border: 1px dashed var(--muted); border-radius: 3px; height: 30%; align-self: end; }
.tm-pill {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 44px;
	padding: 0 18px;
	border-radius: 22px;
	border: 1px solid var(--line);
	font-size: 15px;
	font-weight: 600;
	transition: transform 120ms var(--ease-out), background-color 120ms ease;
}
.tm-pill:active { transform: scale(0.97); background: var(--line); }
.tm-pill:disabled { opacity: 0.5; }
.tm-sheet-day { display: grid; grid-template-columns: 4.2em minmax(0, 1fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 15px; }
.tm-sheet-day > :first-child { color: var(--muted); }
.tm-sheet-day div div { overflow-wrap: anywhere; }
.tm-effort { color: var(--muted); }
.tm-effort.hard { color: var(--over); }

/* Planarket over the deck: a temporary layer that rises from the stack */
.tm-sheet {
	position: fixed;
	inset: 0;
	z-index: 40;
	overflow-y: auto;
	overscroll-behavior: contain;
	animation: tm-rise 240ms var(--ease-drawer);
}

/* ── the undo stripe ──────────────────────────────────────────────── */
.tm-undo {
	position: fixed;
	left: 50%;
	bottom: calc(var(--safe-b) + 14px);
	width: min(420px, calc(100vw - 32px));
	transform: translateX(-50%);
	z-index: 50;
	background: var(--card);
	color: var(--ink);
	border-radius: 18px;
	padding: 6px 6px 6px 16px;
	display: flex;
	align-items: center;
	gap: 10px;
	box-shadow: 0 16px 40px -14px rgba(0,0,0,0.6);
	transition: transform 150ms var(--ease-out), opacity 150ms var(--ease-out);
}
@starting-style {
	.tm-undo { transform: translate(-50%, calc(100% + 24px)); opacity: 0; }
}
.tm-undo.is-leaving { transform: translate(-50%, calc(100% + 24px)); opacity: 0; }
.tm-undo p { flex: 1; min-width: 0; font-size: 15px; overflow-wrap: anywhere; margin: 0; }
.tm-undo button {
	flex-shrink: 0;
	min-height: 44px;
	padding: 0 14px;
	border-radius: 14px;
	font-weight: 600;
	color: var(--ink);
	display: inline-flex;
	align-items: center;
	gap: 6px;
	transition: transform 120ms var(--ease-out), background-color 120ms ease;
}
.tm-undo button:active { transform: scale(0.96); background: rgba(17,17,17,0.06); }

/* ── wide screens: card + Status side by side ─────────────────────── */
.tm-split-side { display: none; }
@media (min-width: 1024px) {
	.tm-split { display: grid; grid-template-columns: 452px minmax(0, 560px); gap: 40px; justify-content: center; }
	.tm-split > .tm-ro, .tm-split > .tm-deck { margin: 0; }
	.tm-split-side { display: block; height: 100dvh; overflow-y: auto; border-left: 1px solid var(--line); }
	.tm-split-side .tm-page { padding-top: 64px; }
	.tm-only-narrow { display: none !important; }
}

/* ── hover lives only where hover is real ─────────────────────────── */
@media (hover: hover) and (pointer: fine) {
	.tm-iconbtn:hover { background: var(--line); }
	.tm-passer:hover, .tm-pill:hover { background: var(--line); }
	.tm-target:hover { filter: brightness(1.06); }
	.tm-why:hover { color: var(--ink); }
	a.tm-li:hover { background: var(--line); }
	.tm-chip:hover { border-color: var(--ink2); }
}

/* ── reduced motion: no flight, no rotation, only fades ───────────── */
@media (prefers-reduced-motion: reduce) {
	.tm-rise, .tm-sheet { animation: tm-fade 180ms ease; }
	.tm-flip-inner { transition: none; transform: none !important; }
	.tm-face { -webkit-backface-visibility: visible; backface-visibility: visible; transition: opacity 200ms ease; }
	.tm-face.back { transform: none; opacity: 0; pointer-events: none; }
	.tm-flip.is-flipped .tm-face.front { opacity: 0; pointer-events: none; }
	.tm-flip.is-flipped .tm-face.back { opacity: 1; pointer-events: auto; }
	.tm-undo { transition: opacity 150ms ease; }
	.tm-ro-press, .tm-ro-press.is-pressing { transform: none; transition: opacity 600ms linear; }
	.tm-ro-press.is-pressing { opacity: 0.7; }
	@starting-style { .tm-undo { transform: translateX(-50%); } }
	.tm-undo.is-leaving { transform: translateX(-50%); }
	.tm-hold.is-holding::before { transition: clip-path 2s linear; }
}
`
