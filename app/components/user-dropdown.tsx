import { Img } from 'openimg/react'
import { useRef } from 'react'
import { Link, Form } from 'react-router'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { useUser } from '#app/utils/user.ts'
import { Button } from './ui/button'
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuPortal,
	DropdownMenuContent,
	DropdownMenuItem,
} from './ui/dropdown-menu'
import { Icon } from './ui/icon'

export function UserDropdown() {
	const user = useUser()
	const formRef = useRef<HTMLFormElement>(null)
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="secondary" aria-label="User menu" />}
			>
				<Img
					className="size-8 rounded-full object-cover"
					alt={user.name ?? user.username}
					src={getUserImgSrc(user.image?.objectKey)}
					width={256}
					height={256}
					aria-hidden="true"
				/>
				<span className="text-body-sm font-bold">
					{user.name ?? user.username}
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuPortal>
				<DropdownMenuContent sideOffset={8} align="end">
					<DropdownMenuItem
						render={<Link prefetch="intent" to="/settings/profile" />}
					>
						<Icon className="text-body-md" name="avatar">
							Settings
						</Icon>
					</DropdownMenuItem>
					<DropdownMenuItem
						render={<Link prefetch="intent" to="/training/upcoming" />}
					>
						<Icon className="text-body-md" name="clock">
							Training
						</Icon>
					</DropdownMenuItem>
					<Form action="/logout" method="POST" ref={formRef}>
						<DropdownMenuItem
							render={<button type="submit" className="w-full" />}
						>
							<Icon className="text-body-md" name="exit">
								Logout
							</Icon>
						</DropdownMenuItem>
					</Form>
				</DropdownMenuContent>
			</DropdownMenuPortal>
		</DropdownMenu>
	)
}
