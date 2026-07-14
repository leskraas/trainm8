'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

// Base UI supplies the tablist semantics: roving tabindex with arrow-key
// activation, `role="tab"`/`role="tabpanel"` wiring, and `aria-selected` on
// the active tab. Panels unmount while hidden (no `keepMounted`), so only one
// panel's content renders at a time.

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn('flex flex-col gap-4', className)}
			{...props}
		/>
	)
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				'bg-muted text-muted-foreground inline-flex w-fit max-w-full items-center justify-center gap-0.5 overflow-x-auto rounded-lg p-1',
				className,
			)}
			{...props}
		/>
	)
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-tab"
			className={cn(
				// Touch target (ui-conventions §2.2): the segmented tab stays 32px
				// visually inside its compact pill (it can't be a real h-11 without
				// bloating the pill), so it reaches ~44px effective via the invisible
				// `after:` hit-area extension — the checkbox.tsx pattern.
				'focus-visible:outline-ring data-active:bg-background data-active:text-foreground relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition after:absolute after:inset-x-0 after:-inset-y-1.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] data-active:shadow-sm',
				className,
			)}
			{...props}
		/>
	)
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
	return (
		<TabsPrimitive.Panel
			data-slot="tabs-panel"
			className={cn('flex-1 outline-none', className)}
			{...props}
		/>
	)
}

export { Tabs, TabsList, TabsTab, TabsPanel }
