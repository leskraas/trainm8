// Display-level Training Load shapes shared by the Dashboard surfaces. The
// serialized Load Snapshot (`date` as a YYYY-MM-DD day string) is what loaders
// hand to the client; the triad is the current CTL/ATL/TSB reading. Formerly
// exported from the Form & load card, which #184 dissolved into the decision
// strip — the types outlived the component.
export type LoadTriad = { ctl: number; atl: number; tsb: number }

export type LoadSnapshot = {
	date: string
	ctl: number
	atl: number
	tsb: number
}
