# Problem statement (draft v1, 2026-11-01)

Edit freely. Mark guesses as guesses.

## The problem
A degree certificate says something about a person, but nothing verifiable ties it to that person or to anything else they have done. A recruiter can check that a document is genuine only by contacting the issuer, and there is no shared way to attach other credentials (certificates, course completions) to the degree and check those too.

## Our starting point
The degree is the best first thing to make verifiable: one trusted issuer (HDSI), a clear holder, and a meaningful claim. Other credentials attach to it and are shown at a trust level:
- **Verified**: issued by an approved issuer, recorded on-chain.
- **Externally checkable**: a link to something the issuer hosts.
- **Self-reported**: no check.

## Why a blockchain (honest version)
- Forgery alone does not need a blockchain; digital signatures solve it.
- What a shared chain adds: a neutral registry of approved issuers and a tamper-evident record of issuance and revocation that no single party controls, across issuers that do not fully trust each other.
- With a single issuer, the advantage is weak. A plain server with signed files is a fair baseline, and we plan to compare against it.
- Confidence: high that this is the correct framing; medium that the comparison will favor the chain on every axis (it will not, for cost and speed).

## Privacy
- The chain is public and permanent, so nothing personal goes on it: only hashes of whole files, issuer addresses and the holder's wallet.
- A wallet address is a lasting pseudonym. Anyone who links it to a person can see everything attached to it. This is a limitation to state in the report.
- Files and metadata stay off-chain, with the holder's consent controlling who sees them.

## Open questions
- Does the mentor want individual lookups, cohort statistics, or both for the department view?
- How much consent control is enough for a first version?
