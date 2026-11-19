---
name: PWA update deferral
description: User-approved behavior for deferring a service-worker update prompt
---

When a user defers a PWA update, do not automatically reload the open app on a service-worker `controlling` event. Reload only after the user explicitly accepts the update, and preserve the reminder while the update is deferred.

**Why:** the user observed the app update without the promised 10-minute reminder after selecting “Me le rappeler dans 10 min”.

**How to apply:** gate reload behavior on an explicit update request and test that a service-worker control event during the deferral period does not clear the reminder or hide its later reappearance. If every app window is fully closed, the browser may activate the waiting worker before the next launch; preventing that requires a different update-delivery architecture.
