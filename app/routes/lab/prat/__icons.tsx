type P = { size?: number }

function Svg({
	size = 22,
	children,
}: {
	size?: number
	children: React.ReactNode
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	)
}

export function IconMenu({ size }: P) {
	return (
		<Svg size={size}>
			<path d="M4 7h16M4 12h16M4 17h10" />
		</Svg>
	)
}
export function IconClose({ size }: P) {
	return (
		<Svg size={size}>
			<path d="M6 6l12 12M18 6L6 18" />
		</Svg>
	)
}
export function IconDown({ size }: P) {
	return (
		<Svg size={size}>
			<path d="M6 9l6 6 6-6" />
		</Svg>
	)
}
export function IconBack({ size }: P) {
	return (
		<Svg size={size}>
			<path d="M15 6l-6 6 6 6" />
		</Svg>
	)
}
export function IconSend({ size }: P) {
	return (
		<Svg size={size}>
			<path d="M12 19V5M6 11l6-6 6 6" />
		</Svg>
	)
}
export function IconUndo({ size = 16 }: P) {
	return (
		<Svg size={size}>
			<path d="M9 14L4 9l5-5" />
			<path d="M4 9h10a6 6 0 010 12h-3" />
		</Svg>
	)
}
export function IconCheck({ size = 20 }: P) {
	return (
		<Svg size={size}>
			<path d="M5 12.5l4.5 4.5L19 7.5" />
		</Svg>
	)
}
export function IconBook({ size }: P) {
	return (
		<Svg size={size}>
			<path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5z" />
			<path d="M20 5.5A1.5 1.5 0 0018.5 4H13v16h5.5a1.5 1.5 0 001.5-1.5z" />
		</Svg>
	)
}
export function IconGear({ size }: P) {
	return (
		<Svg size={size}>
			<circle cx="12" cy="12" r="3" />
			<path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
		</Svg>
	)
}

export function SportIcon({
	sport,
	size = 20,
}: {
	sport: string | null
	size?: number
}) {
	if (sport === 'run')
		return (
			<Svg size={size}>
				<circle cx="14.5" cy="4.5" r="1.8" />
				<path d="M8 21l3-6 3 2v5M6.5 12.5l3-4 4 .5 2.5 3.5 3 1M11 8.5l-1 6" />
			</Svg>
		)
	if (sport === 'bike')
		return (
			<Svg size={size}>
				<circle cx="6" cy="16" r="3.5" />
				<circle cx="18" cy="16" r="3.5" />
				<path d="M6 16l4-7h5l3 7M10 9l3 7h-3M14 5h2.5" />
			</Svg>
		)
	if (sport === 'swim')
		return (
			<Svg size={size}>
				<circle cx="16" cy="7" r="1.8" />
				<path d="M3 17c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M6 13l4-4 3 2.5 2-1.5" />
			</Svg>
		)
	if (sport === 'strength')
		return (
			<Svg size={size}>
				<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
			</Svg>
		)
	return (
		<Svg size={size}>
			<circle cx="12" cy="12" r="7.5" />
			<path d="M12 8v4l2.5 2" />
		</Svg>
	)
}
