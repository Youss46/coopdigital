---
name: WebAuthn/passkey biometric login
description: How full WebAuthn login replacement (not lock-screen) was implemented for the main frontend — key gotchas
---

Full WebAuthn (passkey) login as a *replacement* for password entry (not a device lock-screen) needs:
- `@simplewebauthn/server` (backend) and `@simplewebauthn/browser` (frontend), installed per-package via `pnpm --filter <pkg> add` (root-level installLanguagePackages fails with ERR_PNPM_ADDING_TO_ROOT in this pnpm workspace).
- Public `login/options` + `login/verify` endpoints must accept `{email}` (no auth) to look up `allowCredentials`; return a **generic** response shape whether or not the user/credential exists, to avoid account enumeration.
- `verifyAuthenticationResponse` needs a `WebAuthnCredential` reconstructed from storage: `publicKey` must be converted between stored base64url string and `Uint8Array` via `isoBase64URL.fromBuffer`/`toBuffer` from `@simplewebauthn/server/helpers`.
- Registration/management endpoints (register options/verify, list/delete credentials) must stay behind the normal `authMiddleware` and scope all queries by `req.user.id` — never trust a credential/device id from the client alone.

**Why:** WebAuthn ceremonies are asymmetric (public login discovery vs. authenticated management) and mixing up which routes are public vs. protected is an easy security mistake specific to this feature.

**How to apply:** When adding biometric/passkey login to any other frontend in this workspace (portail/terrain/m15), replicate this route split and the credential (de)serialization helpers rather than re-deriving them.
