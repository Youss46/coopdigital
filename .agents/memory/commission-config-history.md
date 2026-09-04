---
name: Commission configuration history
description: Business rule for editing commission and collection-fee configurations without changing recorded history.
---

Commission and collection-fee configurations remain editable at any time, including after a campaign has ended. A change applies only to future operations; generated commissions retain their original rate, amount, payment frequency, and accounting history.

**Why:** Existing payments and accounting entries must remain auditable and must not change retroactively when an administrator corrects a configuration.

**How to apply:** Store configuration snapshots on generated commissions and never recalculate or rewrite settled or pending historical commission amounts from the current configuration.