/**
 * Prat's whole stylesheet. Plain CSS, scoped under `.prat`, with the
 * concept's palette as tokens that follow the system's light or dark.
 */
export const PRAT_CSS = String.raw`
.prat {
	--bg: #ffffff;
	--partner: #f1f3f5;
	--mine: #1d4ed8;
	--mine-ink: #ffffff;
	--text: #111827;
	--muted: #6b7280;
	--hit: #15803d;
	--under: #b45309;
	--over: #b91c1c;
	--unknown: #9ca3af;
	--unknown-ink: #6b7280;
	--line: rgba(17, 24, 39, 0.1);
	--line-strong: rgba(17, 24, 39, 0.18);
	--card: #ffffff;
	--sheet: #ffffff;
	--soft: #f7f8fa;
	--seg-easy: #bfd0f7;
	--seg-mid: #6b8fe6;
	--seg-hard: #1d4ed8;
	--seg-rest: #e5e9f0;
	--danger: #b91c1c;
	--scrim: rgba(17, 24, 39, 0.32);
	--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
	--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
	--top-h: 52px;
	color-scheme: light;
	background: var(--bg);
	color: var(--text);
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	font-size: 17px;
	line-height: 1.4;
	min-height: 100dvh;
	-webkit-tap-highlight-color: transparent;
	-webkit-text-size-adjust: 100%;
	-webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
	.prat {
		--bg: #0b0d10;
		--partner: #1a1d22;
		--mine: #3b82f6;
		--mine-ink: #ffffff;
		--text: #f3f4f6;
		--muted: #9ca3af;
		--hit: #4ade80;
		--under: #fbbf24;
		--over: #f87171;
		--unknown: #6b7280;
		--unknown-ink: #9ca3af;
		--line: rgba(243, 244, 246, 0.1);
		--line-strong: rgba(243, 244, 246, 0.2);
		--card: #12151a;
		--sheet: #12151a;
		--soft: #15181d;
		--seg-easy: #284374;
		--seg-mid: #3e66c4;
		--seg-hard: #6ea0ff;
		--seg-rest: #22262d;
		--danger: #f87171;
		--scrim: rgba(0, 0, 0, 0.55);
		color-scheme: dark;
	}
}
html:has(.prat), body:has(.prat) {
	background: var(--bg, #fff);
	overscroll-behavior-y: none;
}
@media (prefers-color-scheme: dark) {
	html:has(.prat), body:has(.prat) { background: #0b0d10; }
}
.prat *, .prat *::before, .prat *::after { box-sizing: border-box; }
.prat :where(button, a, [role='button'], label) {
	touch-action: manipulation;
	-webkit-user-select: none;
	user-select: none;
	-webkit-tap-highlight-color: transparent;
}
.prat :where(button) { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.prat :where(input, textarea, select) { font: inherit; font-size: 17px; color: inherit; }
.prat :where(a) { color: inherit; text-decoration: none; }
.prat :focus-visible { outline: 2px solid var(--mine); outline-offset: 2px; }
.prat .num, .prat .tab { font-variant-numeric: tabular-nums; }
.prat b, .prat strong { font-weight: 650; }
.prat .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ── top bar: the only chrome ─────────────────────────────── */
.prat-top {
	position: sticky; top: 0; z-index: 20;
	padding: env(safe-area-inset-top) 72px 0 max(8px, env(safe-area-inset-left));
	height: calc(var(--top-h) + env(safe-area-inset-top));
	display: flex; align-items: center; gap: 4px;
	background: color-mix(in srgb, var(--bg) 88%, transparent);
	-webkit-backdrop-filter: saturate(1.6) blur(16px);
	backdrop-filter: saturate(1.6) blur(16px);
	border-bottom: 1px solid var(--line);
}
@media (prefers-reduced-transparency: reduce) {
	.prat-top { background: var(--bg); backdrop-filter: none; -webkit-backdrop-filter: none; }
}
.prat-iconbtn {
	width: 44px; height: 44px; border-radius: 12px;
	display: inline-flex; align-items: center; justify-content: center;
	color: var(--text);
	transition: transform 120ms var(--ease-out), background-color 120ms ease;
}
.prat-iconbtn:active { transform: scale(0.94); background: var(--partner); }
.prat-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.prat-avatar {
	width: 30px; height: 30px; border-radius: 50%; flex: none;
	background: var(--mine); color: var(--mine-ink);
	display: inline-flex; align-items: center; justify-content: center;
	font-size: 14px; font-weight: 700;
}
.prat-who-name { font-weight: 650; font-size: 16px; line-height: 1.1; }
.prat-who-sub { font-size: 13px; color: var(--muted); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── shell ───────────────────────────────────────────────── */
.prat-main { min-width: 0; }
.prat-thread {
	max-width: 40em; margin: 0 auto;
	padding: 8px max(16px, env(safe-area-inset-left)) calc(150px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-right));
	display: flex; flex-direction: column;
}
.prat-aside { display: none; }
@media (min-width: 1100px) {
	.prat-shell { display: grid; grid-template-columns: minmax(0, 1fr) 420px; }
	.prat-aside {
		display: block; position: sticky; top: 0; height: 100dvh; overflow: auto;
		border-left: 1px solid var(--line); background: var(--soft);
		overscroll-behavior: contain;
	}
	.prat-composer { right: 420px !important; }
}

/* ── messages ────────────────────────────────────────────── */
.prat-day {
	align-self: center; margin: 22px 0 10px;
	font-size: 13px; font-weight: 600; color: var(--muted);
	letter-spacing: 0.01em; text-align: center;
}
.prat-turn { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; scroll-margin-top: 80px; scroll-margin-bottom: 160px; }
.prat-turn.mine { align-items: flex-end; }
.prat-turn.partner { align-items: flex-start; }
.prat-bubble {
	max-width: 80%; padding: 9px 14px; border-radius: 18px;
	overflow-wrap: anywhere; white-space: pre-line;
}
.prat-turn.partner .prat-bubble { background: var(--partner); color: var(--text); }
.prat-turn.partner .prat-bubble + .prat-bubble { border-top-left-radius: 6px; }
.prat-turn.partner .prat-bubble:has(+ .prat-bubble) { border-bottom-left-radius: 6px; }
.prat-turn.mine .prat-bubble { background: var(--mine); color: var(--mine-ink); }
.prat-turn.mine button.prat-bubble { text-align: left; transition: transform 120ms var(--ease-out); }
.prat-turn.mine button.prat-bubble:active { transform: scale(0.97); }
.prat-edit-hint { font-size: 12px; color: var(--muted); margin-right: 6px; }
.prat-turn.mine:has(~ .prat-turn.mine) .prat-edit-hint { display: none; }
.prat-turn .prat-card { margin-top: 2px; }
.prat-turn.partner > .prat-chips { margin-top: 6px; }
.prat-meta { font-size: 13px; color: var(--muted); padding: 0 6px; }
.prat-pending { font-size: 13px; color: var(--muted); padding: 2px 6px; }
.prat .enter { animation: prat-in 200ms var(--ease-out) both; }
@keyframes prat-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.prat-typing {
	display: inline-flex; gap: 4px; align-items: center;
	padding: 13px 14px; border-radius: 18px; background: var(--partner);
}
.prat-typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); opacity: 0.35; animation: prat-dot 900ms ease-in-out infinite; }
.prat-typing i:nth-child(2) { animation-delay: 150ms; }
.prat-typing i:nth-child(3) { animation-delay: 300ms; }
@keyframes prat-dot { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.9; } }

/* ── reply buttons ───────────────────────────────────────── */
.prat-chips { display: flex; flex-wrap: wrap; gap: 8px; max-width: 100%; }
.prat-chip {
	min-height: 44px; padding: 0 16px; border-radius: 999px;
	display: inline-flex; align-items: center; justify-content: center; gap: 6px;
	border: 1.5px solid color-mix(in srgb, var(--mine) 55%, transparent);
	color: var(--mine); font-weight: 600; font-size: 16px; line-height: 1.15;
	background: var(--bg); text-align: center; max-width: 100%;
	transition: transform 120ms var(--ease-out), background-color 120ms ease, opacity 120ms ease;
}
.prat-chip:active { transform: scale(0.97); background: color-mix(in srgb, var(--mine) 10%, var(--bg)); }
.prat-chip.primary { background: var(--mine); color: var(--mine-ink); border-color: var(--mine); }
.prat-chip.primary:active { background: color-mix(in srgb, var(--mine) 85%, #000); }
.prat-chip.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 55%, transparent); }
.prat-chip.quiet { color: var(--text); border-color: var(--line-strong); font-weight: 500; }
.prat-chip[aria-pressed='true'] { background: var(--mine); color: var(--mine-ink); border-color: var(--mine); }
.prat-chip:disabled { opacity: 0.45; cursor: default; }
.prat-chip.busy { opacity: 0.6; }
.prat-chip.sq { min-width: 44px; padding: 0 12px; }
.prat-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── cards ───────────────────────────────────────────────── */
.prat-card {
	width: 100%; border-radius: 14px; background: var(--card);
	border: 1px solid var(--line); padding: 14px;
	display: flex; flex-direction: column; gap: 10px;
}
button.prat-card { text-align: left; transition: transform 140ms var(--ease-out); }
button.prat-card:active { transform: scale(0.985); }
.prat-card-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.prat-card-title { font-weight: 650; font-size: 17px; line-height: 1.25; overflow-wrap: anywhere; min-width: 0; }
.prat-card-sub { font-size: 14px; color: var(--muted); }
.prat-card-label { font-size: 12px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.prat-sport {
	width: 36px; height: 36px; flex: none; border-radius: 10px;
	display: inline-flex; align-items: center; justify-content: center;
	background: color-mix(in srgb, var(--mine) 12%, var(--card)); color: var(--mine);
}
.prat-kv { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 15px; align-items: baseline; }
.prat-kv dt { color: var(--muted); }
.prat-kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.prat-note { font-size: 14px; color: var(--muted); }
.prat-warn { font-size: 14px; color: var(--under); }
.prat-err { font-size: 15px; color: var(--over); }
.prat-hit { color: var(--hit); }
.prat-under { color: var(--under); }
.prat-over { color: var(--over); }
.prat-tag {
	display: inline-flex; align-items: center; gap: 4px; flex: none;
	font-size: 13px; font-weight: 600; padding: 2px 9px; border-radius: 999px;
	background: var(--partner); color: var(--muted); white-space: nowrap;
}
.prat-tag.hit { color: var(--hit); background: color-mix(in srgb, var(--hit) 12%, transparent); }
.prat-tag.under { color: var(--under); background: color-mix(in srgb, var(--under) 12%, transparent); }
.prat-tag.over { color: var(--over); background: color-mix(in srgb, var(--over) 12%, transparent); }
.prat-tag.mine { color: var(--mine); background: color-mix(in srgb, var(--mine) 12%, transparent); }
.prat-unknown {
	display: inline-flex; align-items: center; max-width: 100%;
	font-size: 14px; line-height: 1.3; padding: 2px 10px; border-radius: 999px;
	border: 1.5px dotted var(--unknown); color: var(--unknown-ink);
	font-weight: 500; vertical-align: baseline; white-space: normal;
}
.prat-turn.mine .prat-unknown { color: var(--mine-ink); border-color: rgba(255,255,255,0.6); }
.prat-empty-frame {
	border: 1.5px dashed var(--unknown); border-radius: 12px;
	min-height: 120px; display: flex; align-items: center; justify-content: center;
	text-align: center; padding: 16px; color: var(--unknown-ink); font-size: 15px;
}

/* ── session strip ───────────────────────────────────────── */
.prat-strip { display: flex; gap: 2px; height: 16px; border-radius: 5px; overflow: hidden; }
.prat-strip > i { display: block; height: 100%; min-width: 3px; }
.prat-strip .easy { background: var(--seg-easy); }
.prat-strip .mid { background: var(--seg-mid); }
.prat-strip .hard { background: var(--seg-hard); }
.prat-strip .rest { background: var(--seg-rest); }
.prat-target { font-size: 15px; }

/* ── season card ─────────────────────────────────────────── */
.prat-phases { display: flex; gap: 3px; }
.prat-phase { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.prat-phase > i { height: 10px; border-radius: 3px; display: block; }
.prat-phase > span { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prat-phase.now > span { color: var(--text); font-weight: 650; }
.prat-week7 { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.prat-day7 {
	border-radius: 8px; background: var(--soft); border: 1px solid var(--line);
	min-height: 64px; padding: 5px 4px; display: flex; flex-direction: column; gap: 3px; min-width: 0;
}
.prat-day7 > b { font-size: 11px; color: var(--muted); font-weight: 600; text-align: center; }
.prat-day7 .s { font-size: 11px; line-height: 1.15; border-radius: 4px; padding: 2px 3px; background: color-mix(in srgb, var(--mine) 14%, var(--card)); color: var(--text); overflow: hidden; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.prat-day7 .s.hard { background: var(--mine); color: var(--mine-ink); }
.prat-day7 .s.str { background: color-mix(in srgb, var(--under) 18%, var(--card)); }
.prat-day7.off { background: repeating-linear-gradient(135deg, transparent 0 5px, var(--line) 5px 6px); }
.prat-day7.changed { border-color: var(--mine); box-shadow: 0 0 0 1px var(--mine) inset; }
.prat-bars { display: flex; align-items: flex-end; gap: 2px; height: 48px; }
.prat-bars > i { flex: 1; border-radius: 2px 2px 0 0; background: var(--seg-mid); min-height: 2px; }
.prat-bars > i.recovery { background: var(--seg-easy); }
.prat-bars > i.taper { background: var(--seg-easy); }
.prat-bars > i.unknown { background: none; border: 1px dashed var(--unknown); height: 100%; }

/* ── compare ─────────────────────────────────────────────── */
.prat-cmp { display: grid; grid-template-columns: 72px 1fr auto; gap: 6px 10px; align-items: center; font-size: 14px; }
.prat-cmp-bar { position: relative; height: 10px; border-radius: 5px; background: var(--seg-rest); overflow: hidden; }
.prat-cmp-bar > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; }
.prat-cmp-bar > i.plan { background: var(--seg-easy); }
.prat-cmp-bar > i.act { top: 3px; bottom: 3px; background: var(--text); opacity: 0.8; }

/* ── controls ────────────────────────────────────────────── */
.prat-field { display: flex; flex-direction: column; gap: 6px; }
.prat-field > span { font-size: 14px; color: var(--muted); }
.prat-input {
	width: 100%; min-height: 46px; border-radius: 12px; padding: 10px 12px;
	border: 1px solid var(--line-strong); background: var(--bg); color: var(--text);
}
.prat-input:focus { outline: 2px solid var(--mine); outline-offset: -1px; }
textarea.prat-input { min-height: 84px; resize: vertical; }
.prat-range { width: 100%; accent-color: var(--mine); height: 44px; }
.prat-weekpick { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.prat-weekpick button {
	min-height: 52px; border-radius: 12px; border: 1.5px solid var(--line-strong);
	display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
	font-size: 15px; font-weight: 600; min-width: 0;
	transition: transform 120ms var(--ease-out), background-color 120ms ease;
}
.prat-weekpick button small { font-size: 11px; font-weight: 500; color: var(--muted); }
.prat-weekpick button:active { transform: scale(0.95); }
.prat-weekpick button[aria-pressed='true'] { background: var(--mine); color: var(--mine-ink); border-color: var(--mine); }
.prat-weekpick button[aria-pressed='true'] small { color: inherit; opacity: 0.85; }
.prat-weekpick button.blocked { background: repeating-linear-gradient(135deg, transparent 0 5px, var(--line) 5px 6px); color: var(--muted); }
.prat-weekpick button:disabled { opacity: 0.35; }
.prat-rpe { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; width: 100%; max-width: 360px; }
.prat-rpe button {
	min-height: 46px; border-radius: 12px; border: 1.5px solid var(--line-strong); font-weight: 650;
	transition: transform 120ms var(--ease-out);
}
.prat-rpe button:active { transform: scale(0.95); }
.prat-rpe button[aria-pressed='true'] { background: var(--mine); color: var(--mine-ink); border-color: var(--mine); }
.prat-rpe-scale { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); max-width: 360px; }
.prat-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; }
.prat-switch {
	width: 51px; height: 31px; border-radius: 999px; background: var(--line-strong); position: relative; flex: none;
	transition: background-color 160ms ease;
}
.prat-switch::after {
	content: ''; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%;
	background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.25);
	transition: transform 200ms var(--ease-out);
}
.prat-switch[aria-checked='true'] { background: var(--hit); }
.prat-switch[aria-checked='true']::after { transform: translateX(20px); }

/* hold to confirm */
.prat-hold {
	position: relative; overflow: hidden; width: 100%; min-height: 52px; border-radius: 999px;
	background: color-mix(in srgb, var(--danger) 12%, var(--bg)); color: var(--danger);
	font-weight: 700; border: 1.5px solid var(--danger);
	transition: transform 160ms var(--ease-out);
}
.prat-hold:active { transform: scale(0.97); }
.prat-hold .fill {
	position: absolute; inset: 0; background: var(--danger); color: #fff;
	display: flex; align-items: center; justify-content: center;
	clip-path: inset(0 100% 0 0);
	transition: clip-path 200ms var(--ease-out);
}
.prat-hold.holding .fill { clip-path: inset(0 0 0 0); transition: clip-path 1500ms linear; }
.prat-hold:disabled { opacity: 0.45; }

/* ── composer ────────────────────────────────────────────── */
.prat-composer {
	position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
	background: color-mix(in srgb, var(--bg) 92%, transparent);
	-webkit-backdrop-filter: saturate(1.6) blur(16px);
	backdrop-filter: saturate(1.6) blur(16px);
	border-top: 1px solid var(--line);
	padding: 8px max(12px, env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
}
@media (prefers-reduced-transparency: reduce) {
	.prat-composer { background: var(--bg); backdrop-filter: none; -webkit-backdrop-filter: none; }
}
.prat-composer-in { max-width: 40em; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; }
.prat-suggest {
	display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
	margin: 0 -12px; padding: 0 12px; touch-action: pan-x;
	overscroll-behavior-x: contain;
}
.prat-suggest::-webkit-scrollbar { display: none; }
.prat-suggest .prat-chip { flex: none; min-height: 38px; font-size: 15px; padding: 0 14px; }
.prat-cmdrow { display: flex; gap: 8px; align-items: center; }
.prat-cmd {
	flex: 1; min-width: 0; height: 44px; border-radius: 22px; padding: 0 16px;
	border: 1px solid var(--line-strong); background: var(--bg); color: var(--text);
}
.prat-cmd:focus { outline: 2px solid var(--mine); outline-offset: -1px; }
.prat-send {
	width: 44px; height: 44px; border-radius: 50%; flex: none;
	background: var(--mine); color: var(--mine-ink);
	display: inline-flex; align-items: center; justify-content: center;
	transition: transform 120ms var(--ease-out), opacity 120ms ease;
}
.prat-send:active { transform: scale(0.92); }
.prat-send:disabled { opacity: 0.35; }
.prat-offline { font-size: 13px; color: var(--under); text-align: center; }
.prat-autolist { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 14px; background: var(--card); overflow: hidden; }
.prat-autolist button { min-height: 44px; padding: 0 14px; text-align: left; display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--line); }
.prat-autolist button:first-child { border-top: 0; }
.prat-autolist button[data-active='true'] { background: var(--partner); }
.prat-autolist b { white-space: nowrap; flex: none; }
.prat-autolist small { color: var(--muted); font-size: 13px; margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

/* ── overlays ────────────────────────────────────────────── */
.prat-scrim { position: fixed; inset: 0; z-index: 40; background: var(--scrim); }
.prat-focus {
	position: fixed; inset: 0; z-index: 50; background: var(--bg);
	overflow: auto; overscroll-behavior: contain;
	padding-bottom: calc(24px + env(safe-area-inset-bottom));
}
.prat-focus-head {
	position: sticky; top: 0; z-index: 2;
	display: flex; align-items: center; gap: 6px;
	padding: env(safe-area-inset-top) 72px 0 max(8px, env(safe-area-inset-left));
	height: calc(var(--top-h) + env(safe-area-inset-top));
	background: color-mix(in srgb, var(--bg) 90%, transparent);
	-webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
	border-bottom: 1px solid var(--line);
}
.prat-focus-title { font-weight: 650; font-size: 16px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prat-focus-body { max-width: 40em; margin: 0 auto; padding: 16px max(16px, env(safe-area-inset-left)) 24px max(16px, env(safe-area-inset-right)); display: flex; flex-direction: column; gap: 14px; }
@media (min-width: 900px) {
	.prat-focus { inset: 40px auto 40px 50%; width: 620px; transform: translateX(-50%); border-radius: 18px; box-shadow: 0 30px 80px rgba(0,0,0,0.25); border: 1px solid var(--line); }
	.prat-focus-head { padding-right: 16px; border-radius: 18px 18px 0 0; }
}
.prat-sheet {
	position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
	height: calc(100dvh - 56px - env(safe-area-inset-top));
	background: var(--sheet); border-radius: 18px 18px 0 0;
	box-shadow: 0 -10px 40px rgba(0,0,0,0.18);
	display: flex; flex-direction: column;
}
.prat-sheet-head { padding: 6px 12px 0; display: flex; flex-direction: column; gap: 6px; flex: none; border-bottom: 1px solid var(--line); }
.prat-grab { width: 36px; height: 5px; border-radius: 3px; background: var(--line-strong); align-self: center; margin-top: 2px; }
.prat-sheet-row { display: flex; align-items: center; gap: 6px; }
.prat-tabs { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--partner); flex: 1; min-width: 0; }
.prat-tabs a {
	flex: 1; min-height: 38px; display: flex; align-items: center; justify-content: center;
	border-radius: 9px; font-size: 15px; font-weight: 600; color: var(--muted);
	transition: background-color 160ms ease, color 160ms ease;
}
.prat-tabs a[aria-current='page'] { background: var(--bg); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.prat-sheet-body { flex: 1; overflow: auto; overscroll-behavior: contain; padding: 14px 16px calc(24px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 12px; }
@media (min-width: 1100px) {
	.prat-sheet { top: 0; left: auto; width: 420px; height: 100dvh; border-radius: 0; box-shadow: none; background: var(--soft); border-left: 1px solid var(--line); z-index: 35; }
	.prat-sheet-head { padding-top: calc(10px + env(safe-area-inset-top)); padding-right: 104px; }
	.prat-aside { padding-right: 0; }
	.prat-sheet .prat-grab, .prat-sheet .prat-sheet-close { display: none; }
	.prat-scrim.for-sheet { display: none; }
}
.prat-list { display: flex; flex-direction: column; border-radius: 14px; border: 1px solid var(--line); background: var(--card); overflow: hidden; }
.prat-list > * { border-top: 1px solid var(--line); }
.prat-list > *:first-child { border-top: 0; }
.prat-row {
	display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 10px 14px; width: 100%; text-align: left;
	transition: background-color 120ms ease;
}
a.prat-row:active, button.prat-row:active { background: var(--partner); }
.prat-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.prat-row-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prat-row-sub { font-size: 14px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prat-h2 { font-size: 20px; font-weight: 700; margin: 6px 0 0; letter-spacing: -0.01em; }
.prat-h3 { font-size: 15px; font-weight: 650; margin: 8px 0 0; color: var(--muted); }
.prat-menu {
	position: fixed; z-index: 60; top: calc(var(--top-h) + env(safe-area-inset-top) - 4px); left: max(8px, env(safe-area-inset-left));
	width: min(300px, calc(100vw - 16px)); border-radius: 16px; background: var(--card);
	border: 1px solid var(--line); box-shadow: 0 16px 50px rgba(0,0,0,0.2);
	padding: 6px; transform-origin: 20px 0;
	animation: prat-pop 180ms var(--ease-out) both;
}
@keyframes prat-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
.prat-menu a, .prat-menu button { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 10px; border-radius: 10px; width: 100%; font-size: 16px; }
.prat-menu a:active, .prat-menu button:active { background: var(--partner); }
.prat-menu hr { border: 0; border-top: 1px solid var(--line); margin: 4px 6px; }
.prat-menu small { color: var(--muted); font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 10px 2px; display: block; }
.prat-banner { font-size: 13px; text-align: center; color: var(--muted); padding: 6px 12px; }
.prat-banner.demo { color: var(--under); }

/* columns never squash their cards */
.prat-sheet-body > *, .prat-focus-body > *, .prat-thread > * { flex-shrink: 0; }

/* curve */
.prat-curve { width: 100%; height: auto; display: block; overflow: visible; }
.prat-legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--muted); }
.prat-legend i { display: inline-block; width: 14px; height: 3px; border-radius: 2px; vertical-align: middle; margin-right: 5px; }
.prat-vol { display: grid; grid-template-columns: minmax(64px, auto) 1fr auto; gap: 8px 10px; align-items: center; font-size: 14px; }
.prat-vol-bar { position: relative; height: 12px; border-radius: 6px; background: var(--seg-rest); }
.prat-vol-bar > i { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 6px; }
.prat-vol-bar > i.act { background: var(--mine); }
.prat-vol-bar > b { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text); border-radius: 1px; }

/* strength logger */
.prat-ex { display: flex; flex-direction: column; gap: 8px; }
.prat-set { display: grid; grid-template-columns: 34px minmax(0, 1fr) minmax(0, 1fr) 52px; gap: 8px; align-items: center; }
.prat-set .idx { font-size: 14px; color: var(--muted); text-align: center; }
.prat-set input { min-height: 46px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--bg); padding: 0 10px; width: 100%; text-align: center; }
.prat-set .unit { font-size: 12px; color: var(--muted); }
.prat-check {
	width: 52px; height: 46px; border-radius: 12px; border: 1.5px solid var(--line-strong);
	display: inline-flex; align-items: center; justify-content: center; color: var(--muted);
	transition: transform 120ms var(--ease-out), background-color 160ms ease;
}
.prat-check:active { transform: scale(0.93); }
.prat-check[aria-pressed='true'] { background: var(--hit); border-color: var(--hit); color: #fff; }
.prat-set.warm .idx { font-style: italic; }
.prat-set.done input { color: var(--muted); }

@media (prefers-reduced-motion: reduce) {
	.prat .enter { animation: prat-fade 160ms ease both; }
	.prat-menu { animation: prat-fade 120ms ease both; }
	.prat-typing { display: none; }
	.prat-hold.holding .fill { transition: clip-path 1500ms linear; }
}
@keyframes prat-fade { from { opacity: 0; } to { opacity: 1; } }
`
