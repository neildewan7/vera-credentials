# Deployments

Record every deploy here: network, address, date, deployer, what commit it was built from. Never delete rows, append new ones (a redeploy gets a new row, the old one stays for history).

| Network | Contract | Address | Date | Commit | Notes |
|---|---|---|---|---|---|
| Polygon Amoy | RegistryFactory | `0x7acBD69Cdb8B1B206747c4163454231D3Ccd2F2F` | 2026-11-04 | `e0c8541` | Practice deploy (issue #8) — confirms the deploy pipeline works. Only the factory; `IssuerRegistry`, `SelfReportedRegistry`, `CredentialRegistry` are not deployed yet (standalone, need their own deploy script — see issue #9). |
