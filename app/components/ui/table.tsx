import { type ComponentProps } from 'react'
import { cn } from '#app/utils/misc.tsx'

function Table({ className, ...props }: ComponentProps<'table'>) {
	return (
		<table
			data-slot="table"
			className={cn('w-full caption-bottom text-sm', className)}
			{...props}
		/>
	)
}

function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
	return (
		<thead
			data-slot="table-header"
			className={cn('[&_tr]:border-b', className)}
			{...props}
		/>
	)
}

function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
	return (
		<tbody
			data-slot="table-body"
			className={cn('[&_tr:last-child]:border-0', className)}
			{...props}
		/>
	)
}

function TableRow({ className, ...props }: ComponentProps<'tr'>) {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				'border-border/60 hover:bg-muted/40 data-[state=selected]:bg-muted border-b transition-colors',
				className,
			)}
			{...props}
		/>
	)
}

function TableHead({ className, ...props }: ComponentProps<'th'>) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				'text-muted-foreground h-9 px-3 text-left align-middle text-xs font-medium tracking-wide whitespace-nowrap',
				className,
			)}
			{...props}
		/>
	)
}

function TableCell({ className, ...props }: ComponentProps<'td'>) {
	return (
		<td
			data-slot="table-cell"
			className={cn('px-3 align-middle whitespace-nowrap', className)}
			{...props}
		/>
	)
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
