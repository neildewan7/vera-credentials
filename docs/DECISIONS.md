# Decisions log

Last updated: 2026-11-01. Add a row whenever the team decides something. Never delete rows; change the status instead.
Status: **Decided** (team agreed), **Proposed** (suggested, not agreed), **Open** (needs an answer).

| Date | Decision | Why | Status |
|---|---|---|---|
| 2026-11-01 | Start from last year's Vera contracts in a fresh repo (`vera-credentials`), credit Vera in the README | 44 tests already pass; saves time. Keep-or-rewrite is still formally Gate G1 (Nov 4) | Decided (start), Open (keep vs rewrite) |
| 2026-11-01 | Scope: a basic, extensible system, not a full CRM | Mentor bar and the project runs only until March 2027 | Decided |
| 2026-11-01 | The HDSI degree is the root of identity; other credentials attach to it | Nothing currently ties a degree to a real person in a verifiable way; a degree is a good first thing to verify | Decided |
| 2026-11-01 | Nothing personal on-chain: only hashes of whole files, issuer addresses, holder wallet | Chain is public and permanent; wallet address is a lasting pseudonym (state this as a limitation) | Decided |
| 2026-11-01 | Hash raw file bytes, not base64 text | Last year's app hashed base64 text (from the audit, not re-verified here) | Decided |
| 2026-11-01 | Synthetic data only | Student records are protected by FERPA | Decided |
| 2026-11-01 | Test chain: Polygon Amoy by default; also measure Arbitrum Sepolia and Base Sepolia; choose after the gas test (Gate G4, Nov 20) | A sidechain like Polygon is needed in the end; rollups are the comparison | Decided (default), Open (final) |
| 2026-11-01 | Supabase only for files, metadata, search and consent (prototype choice) | Production would need UCSD-approved hosting/SSO | Decided |
| 2026-11-01 | Indexer is an optional cache of chain events. Files and metadata do not go through it | Chain stays the source of truth | Proposed |
| 2026-11-01 | Multisig ownership of the issuer registry is Winter or stretch | Adds complexity; not needed to show the idea | Proposed |
| 2026-11-01 | Add `verify()` returning Unknown / Active / Revoked, additively; keep `verifyDocument` with a deprecation note; Document template first | Today `verifyDocument` ignores revocation (the repo's own test asserts it). Use the revocation registry's `getStatus`, since `isValid == false` can mean revoked or never mirrored | Proposed (not implemented) |
| 2026-11-01 | Contract interface freeze Nov 13 (Gate G3) | Backend and front end need a stable target | Decided |
| - | Roles for the four team members | Needed by Gate G3 (Nov 13) | Open |
| - | Meaning of "CRM" and "production"; department view scope; what counts as "data" | Questions for Prof. Gupta (see `report/notes.md`) | Open |
