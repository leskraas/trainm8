/**
 * How trainm8 names itself to the open lookups it calls from the server (ADR
 * 0115 §1): MET Norway's terms require an identifying `User-Agent`, and
 * Kartverket gets the same. The app and where to reach whoever runs it: a
 * contact URL, not an e-mail address, until the privacy contact in
 * `labels/privacy.ts` is filled in.
 */
export const OUTBOUND_USER_AGENT =
	'trainm8/1.0 (+https://github.com/leskraas/trainm8)'
