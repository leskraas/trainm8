import { faker } from '@faker-js/faker/locale/en'
import bcrypt from 'bcryptjs'
import { UniqueEnforcer } from 'enforce-unique'

const uniqueUsernameEnforcer = new UniqueEnforcer()

export function createUser() {
	const firstName = faker.person.firstName()
	const lastName = faker.person.lastName()

	// Enforced on the final form: two candidates that differ only past the
	// 20th character, or in case, would otherwise collide once shortened.
	const username = uniqueUsernameEnforcer.enforce(() =>
		(
			faker.string.alphanumeric({ length: 2 }) +
			'_' +
			faker.internet.username({
				firstName: firstName.toLowerCase(),
				lastName: lastName.toLowerCase(),
			})
		)
			.slice(0, 20)
			.toLowerCase()
			.replace(/[^a-z0-9_]/g, '_'),
	)
	return {
		username,
		name: `${firstName} ${lastName}`,
		email: `${username}@example.com`,
	}
}

export function createPassword(password: string = faker.internet.password()) {
	return {
		hash: bcrypt.hashSync(password, 10),
	}
}

let userImages: Array<{ objectKey: string }> | undefined
export async function getUserImages() {
	if (userImages) return userImages

	userImages = await Promise.all(
		Array.from({ length: 10 }, (_, index) => ({
			objectKey: `user/${index}.jpg`,
		})),
	)

	return userImages
}
