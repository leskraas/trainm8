# Better Auth 1.7.12 probe (npm pack better-auth@1.7.12 @better-auth/core@1.7.12 @better-auth/passkey@1.7.12, read 2026-11-07)

## Origin check: skipped in tests by default, and only runs when a cookie is present
```
		skipCSRFCheck: !!options.advanced?.disableCSRFCheck,
		skipOriginCheck: options.advanced?.disableOriginCheck !== void 0 ? options.advanced.disableOriginCheck : isTest() ? true : false,
101:	const useCookies = headers.has("cookie");
108:	if (!(forceValidate || useCookies)) return;
```
(dist/context/create-context.mjs, dist/api/middlewares/origin-check.mjs)

## Default secret: refused only in production; any secret accepted in tests
```
	const isDefaultSecret = secret === DEFAULT_SECRET;
	if (isTest()) return;
	if (isDefaultSecret && isProduction) throw new BetterAuthError("You are using the default secret. Please set `BETTER_AUTH_SECRET` in your environment variables or pass `secret` in your auth config.");
	if (!secret) throw new BetterAuthError("BETTER_AUTH_SECRET is missing. Set it in your environment or pass `secret` to betterAuth({ secret }).");
```

## additionalFields are client-writable unless input: false
```
	const action = schema.action || "create";
	const fields = schema.fields;
	const parsedData = Object.create(null);
	for (const key in fields) {
		if (key in data) {
			if (fields[key].input === false) {
				if (fields[key].defaultValue !== void 0) {
					if (action !== "update") {
						parsedData[key] = fields[key].defaultValue;
						continue;
					}
```

## AuthVerification rows have no user foreign key; how each names its user
```
4:function toOTPIdentifier(type, email) {
5-	return `${type}-otp-${email}`;
6-}
76-		value: user.user.id,
77:		identifier: `reset-password:${verificationToken}`,
plugins/two-factor/index.mjs:264:									value: data.user.id,
plugins/two-factor/index.mjs:295:					value: data.user.id,
plugins/two-factor/index.mjs:301:					identifier: `2fa-attempts-${identifier}`,
plugins/two-factor/index.mjs:315:							value: data.user.id
plugins/two-factor/otp/index.mjs:106:					identifier: `2fa-otp-${key}`,
plugins/two-factor/otp/index.mjs:242:					identifier: `2fa-otp-${key}`,
193:			identifier: verificationToken,
194-			value: JSON.stringify({
195-				type: "registration",
196-				expectedChallenge: options.challenge,
--
298:		identifier: verificationToken,
299-		value: JSON.stringify(data),
300-		expiresAt: expirationTime
301-	});
```

## The configured table list is public API
```
1:import { getAuthTables } from "./get-tables.mjs";
8:export { accountSchema, coreSchema, getAuthTables, rateLimitSchema, sessionSchema, userSchema, verificationSchema };
```
