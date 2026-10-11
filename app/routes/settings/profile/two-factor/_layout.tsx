import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Outlet } from 'react-router'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { type VerificationTypes } from '#app/routes/_auth/verify.tsx'
import { MEG_PAGE_TITLES } from '#app/utils/labels.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.twoFactor,
	getSitemapEntries: () => null,
}

export const twoFAVerificationType = '2fa' satisfies VerificationTypes

export default function TwoFactorRoute() {
	return <Outlet />
}
