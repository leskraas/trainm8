import { getUserImgSrc } from '#app/utils/misc.tsx'
import { useUser } from '#app/utils/user.ts'
import { Img } from 'openimg/react'
import { useRef } from 'react'
import { Form, Link } from 'react-router'
import { Button } from './ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Icon } from './ui/icon'

export function UserDropdown() {
	const user = useUser()
	const formRef = useRef<HTMLFormElement>(null)
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						render={
							<Link
								to={`/users/${user.username}`}
								// this is for progressive enhancement
								onClick={(e) => e.preventDefault()}
								className="flex items-center gap-2"
								aria-label="User menu"
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
							</Link>
						}
						variant="secondary"
					/>
				}
			/>
			<DropdownMenuPortal>
				<DropdownMenuContent sideOffset={8} align="end">
					<DropdownMenuItem
						render={<Link prefetch="intent" to={`/users/${user.username}`} />}
					>
						<Icon className="text-body-md" name="avatar">
							Profile
						</Icon>
					</DropdownMenuItem>
					<DropdownMenuItem
						render={
							<Link prefetch="intent" to={`/users/${user.username}/notes`} />
						}
					>
						<Icon className="text-body-md" name="pencil-2">
							Notes
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
