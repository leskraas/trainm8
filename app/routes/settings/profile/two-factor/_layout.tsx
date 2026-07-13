import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Outlet } from 'react-router'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { type VerificationTypes } from '#app/routes/_auth/verify.tsx'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: 'Two-Factor Authentication',
	getSitemapEntries: () => null,
}

export const twoFAVerificationType = '2fa' satisfies VerificationTypes

export default function TwoFactorRoute() {
	return <Outlet />
}
