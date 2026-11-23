# November 24 technical milestone material

Prepared November 22, 2026 (Pacific). Assigned report sections have not yet been
specified; this is source-backed technical material for selection, not a claim
that all assigned writing is complete.

## Implementation and evaluation

The fetched main HEAD was `f91840344a9f86b4a4d6bb312d68218c0dca2157`.
PR #17 added two Supabase migrations, SQL/RLS tests and setup documentation.
PR #18 added Ethereum Sepolia deployment/workflow evidence and matched Amoy
comparisons without changing the Solidity source used in that experiment.
`docs/d35-sepolia/README.md` records four deployments and seven successful
workflow transactions. This work reviewed those recorded results; it did not
repeat public-chain writes or independently re-query their receipts.

The local contract suite after integrating PR #16 with main contains 103 passing
tests (88 on main plus 15 track-record/simulation tests). This is the observed
runner count; the PR discussion's anticipated 104 is not the current result.
Compilation passed; the seeded default simulator produced seven fake claims:
zero VERIFIED, three SELF_REPORTED and four rejected. Both attempted fraudulent
links were blocked. Of 24 genuine claims, 22 were accepted and two rejected.
Those outcomes demonstrate the modeled scenarios, not a measured real-world
fraud detection rate. Self-reported content remains unverifiable by the chain.

`CredentialRegistry` now requires factory membership before trusting parent
owner/holder getters. The regression test in `test/AuditPoC.test.js` rejects a
fabricated parent and permits legitimate linking. It requires three constructor
addresses. Dataset/Media registration also requires a holder address. PR #16's
simulator constructor and Dataset test were brought into alignment; no contract
interface was changed by this milestone work.

## Database design and trust boundaries

The current migrations define ten tables, lowercase address/hash domains and
exact uint256 numeric constraints. Composite identities distinguish chain,
deployment and record. Credential links reference matching child and parent
holder records. Revocations are scoped by companion registry and hash, avoiding
cross-registry collisions. RLS separates authenticated catalog reads from
participant records; only a trusted backend can associate a verified wallet or
write chain projections. Consent JSON stores preferences but grants no sharing.

The database is an indexed cache; contracts remain authoritative. A link does
not establish current issuer approval, non-revocation or degree semantics.
The verification service must recheck those conditions. Dataset/Media now have
holder/verify interfaces, but their projection is deliberately not implemented.

## Integration gaps and limitations

- Hosted Supabase is pending owner login, organization/project creation, exact
  target inspection, migration approval and hosted verification. Existing SQL
  and Auth/REST results in `docs/SUPABASE.md` are historical local results.
- `indexer/schema.sql`/`store.js` are an older JSON prototype, not a compatible
  database adapter. The current listener uses a 30,000-block lookback and lacks
  atomic canonical event/checkpoint persistence and reorg reconciliation.
  Issuer removal and ownership-transfer handling must be checked in that adapter.
- A hosted database does not itself build wallet proof verification, a query
  service, private file storage, recruiter UI or consent-based sharing.
- README/CLAUDE/DECISIONS/TIMELINE contain historical plans that predate current
  contracts. Factory creation remains ungated; issuer approval governs trust.
  An end-to-end test and Dataset/Media holder/verify implementations already
  exist. Treat older proposals as history, not current requirements.
- Ethereum Sepolia is not Arbitrum Sepolia. Six matched actions in the recorded
  comparison used 2,130,072 gas on Amoy versus 11,649,596 on Ethereum Sepolia.
  Native test-token fees do not establish fiat or mainnet cost rankings; chain
  rules, times and initial states differ. Final chain selection still needs an
  explicit team decision rather than inference from a single sample.

## Open tracker snapshot

The live issue list showed #1 (roles), #9 (gas/chain choice), #10 (indexer),
#11 (verification service), #12 (hosted provisioning), #13 (tables/RLS), and
#14 (consent scaffolding) open. An open issue is not proof of missing code:
#13/#14 have implementations in #17, but shared deployment and broader consent
semantics remain incomplete. PR #16 was the sole open pull request in the
inspected page; its review requested the fixes described above.

## Before Tuesday

1. Designate team Supabase owner, organization and project; share only public
   project identity. Approve exact member roles and invitations separately.
2. Inspect and approve the two migrations for that target before applying them.
3. Record hosted metadata/API checks and outstanding adapter work honestly.
4. Review PR #16 and the milestone documentation changes; do not merge without
   the owner's confirmation.
5. Confirm assigned report sections, roles and final chain decision with the
   team. Reuse receipt evidence with the stated evaluation limitations.
