# Shared workspace moved

The shared login portal, Nginx routing, tests and operations documentation now
belong to [VCCL Workspace](../../workspace/README.md).

Use [the current deployment guide](../../workspace/docs/DEPLOYMENT.md) for
independent workspace installation, cutover, verification and rollback.
Journal updates no longer run portal tests or restart trading-workspace.

The previous guide, including its existing local edits, is preserved at
[the historical EC2 operations record](../../workspace/docs/history/EC2-OPERATIONS-20261023.md).
It describes the pre-extraction layout. Complete portal cutover before deploying
this journal revision to a server still using deploy/portal.mjs.
