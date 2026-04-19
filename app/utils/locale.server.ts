export function getLocaleFromRequest(request: Request): string {
	const acceptLanguage = request.headers.get('accept-language')
	const firstLanguage = acceptLanguage?.split(',')[0]?.split(';')[0]?.trim()
	return firstLanguage || 'en-US'
}
