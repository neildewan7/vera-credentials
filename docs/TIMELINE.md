# Timeline: Fall 2026 (DSC 180A) to Winter 2027 (DSC 180B)

Last updated: 2026-11-01. Update this file whenever a date or plan changes.
Sources: dsc-capstone.org/2026-27 (syllabus, Q1 project page, Q2 proposal page, Lesson 3, Lesson 4).
Owners are TBD until roles are decided (Gate G3).

## 1. Fixed dates (from the course site)

| Date | Item | Notes |
|---|---|---|
| Sun, every week | Participation question, 11:59 PM | Individual |
| Mon Nov 2 | Methodology Assignment 3, 11:59 PM | Individual. MA 4+ not dated yet; best 5 of at least 5 count |
| **Fri Nov 6** | **Q1 checkpoint (report + code)** | Report: working title, abstract, introduction (intro paragraph, literature review / prior work, description of relevant data). Code: GitHub link with code so far. Gradescope. One submission per group. Lesson 4 says Nov 3; the project page says Nov 6. Use Nov 6, confirm on Piazza |
| Wed Nov 11 | Veterans Day | Likely no campus. Confirm |
| Thu Nov 26 | Thanksgiving | |
| Week 8/9 or 9/10 | TA check-in: code review + elevator pitch dry run | The site gives both. Confirm with TA |
| **Fri Dec 4** | **Q1 final: LaTeX report + public GitHub repo with README** | Mentor grades report, TA grades code. README must explain how to reproduce |
| **Fri Dec 4** | **Q2 proposal** | Written proposal (5%, mentor), 6-7 week schedule matrix of people x weeks (5%, mentor), elevator pitch (5%, TA; each member records an audio-only video, 2-3 min, YouTube link) |
| Late Q1 | Contributions statement | Released as a separate Gradescope assignment |
| Winter | Schedule not posted | Site says it settles by mid-January. Q2 repo must be separate from Q1 repo |
| Mar 13, 2027 | Showcase (poster) | Site says "Friday March 13"; Mar 13, 2027 is a Saturday. Confirm |

Q1 grade: methodology assignments 20%, participation questions 5%, overall participation 10%, Q1 project reports 35%, Q1 project code 15%, Q2 proposal 15%.

## 2. Decision gates

| Gate | By | Decide |
|---|---|---|
| G1 | Wed Nov 4 | Keep or rewrite Vera's contracts. Mentor questions answered (meaning of "CRM", meaning of "production", what counts as "data") |
| G2 | Fri Nov 6 | Dev tools frozen: Hardhat 2 + Solidity, Node/TypeScript backend, React/Next.js front end, new Supabase project, GitHub Actions CI, own RPC key |
| G3 | Fri Nov 13 | Roles final, contract interface (functions + events) frozen, holder representation, who is an issuer |
| G4 | Fri Nov 20 | Feature freeze. Chain choice final after the gas test |
| G5 | Wed Nov 25 | Report and proposal drafts done before Thanksgiving |

## 3. Weekly plan (Fall)

### Week 6 (Nov 2-6): checkpoint
- Repo: clean repo created (done), CI green, README, credit to Vera.
- Contracts: read RegistryFactory and DocumentRegistryTemplate; write failing test showing verify ignores revocation; start the fix.
- Accounts: new throwaway deployer key, own RPC key, explorer API key, faucet test tokens.
- Writing: checkpoint report (title, abstract, introduction, prior work, data). One person submits.
- Course: MA 3 (Mon), participation question (Sun).

### Week 7 (Nov 9-13)
- Contracts: revocation fix merged; `IssuerRegistry` (owner-controlled allowlist); factory `createRegistry` gated by it; holder field; `CredentialLinks` contract (holder-signed parent link); tests for all.
- Interface: freeze function signatures and events so backend and front end can start on mocks.
- Testnet: practice deploy of unchanged Vera contracts to Amoy (config + script + explorer verification) and record baseline gas.
- Writing: start Q2 proposal (context, problem, primary output). Roles final (G3).

### Week 8 (Nov 16-20)
- Testnet: **deploy new contracts to Amoy**, verify on explorer, run full scripted flow (create registry, register degree, attach certificate, revoke, verify), record gas per step. Repeat on Arbitrum Sepolia and Base Sepolia (add `baseSepolia` network). Choose chain.
- Backend: verification service reads the deployed contracts and returns a status per credential (Active, Revoked, Unknown, plus link status). Seed-data script with synthetic people and issuers.
- Front end: search page and person page against the API.
- Writing: proposal schedule matrix (Winter). **Feature freeze Fri Nov 20.**

### Week 9 (Nov 23-27): Thanksgiving week
- Code: bug fixes, tests, CI, README (how to reproduce), cost table.
- Writing: draft the full Q1 report; write and rehearse elevator pitches; TA dry run if scheduled.
- Drafts done by Wed Nov 25.

### Week 10 (Nov 30-Dec 4)
- Code cleanup only. Make repo public after confirming no secrets.
- Finish Q1 report (LaTeX). Record elevator pitches (each member).
- **Submit Q1 final and Q2 proposal Fri Dec 4.** One group submission.

## 4. Testnet deployment order
1. Clean repo, 44 tests pass locally and in CI (done Nov 1).
2. Finish contract changes locally with tests (by Nov 13). Deployed contracts cannot be edited.
3. Accounts: throwaway key, RPC key, explorer key, faucet tokens (start by Nov 6; faucets are rate limited).
4. Practice deploy of unchanged Vera contracts to Amoy (Nov 9-13).
5. Deploy finished contracts to Amoy; save addresses to a deployments file; verify on explorer (about Nov 16).
6. Run the scripted flow on Amoy and record gas per step.
7. Repeat on Arbitrum Sepolia and Base Sepolia.
8. Compare cost; choose chain (by Nov 20).
9. Point backend and indexer at deployed addresses.
10. Document addresses, redeploy steps and results for the report.

## 5. Winter outline (rough; dates not posted)
- Weeks 1-2: setup, new Q2 repo, contracts v1 on testnet, plan checkpoints.
- Weeks 3-4: backend, indexer, consent controls.
- Weeks 5-6: CRM views, report generator, alumni view (stretch).
- Week 7: evaluation, baseline comparison (signed files on a plain server), feature freeze.
- Weeks 8-9: ethics assignments, report, website, poster, dry run.
- Week 10: final submission. Showcase around Mar 13.

## 6. Open questions for the mentor
1. What does "CRM" mean here: a record per person plus report, a recruiter candidate tracker, an alumni CRM?
2. What does "production" mean: a pilot in HDSI, a UCSD-wide service, or a documented prototype?
3. Is the department view for individual lookups or cohort statistics?
4. What counts as "relevant data" for the checkpoint, given there is no external dataset (we plan synthetic credential data)?
5. Is reusing Vera as a starting point fine for the code grade (credited in the README)?

## 7. Risks
- The final and the proposal are both due Dec 4, so Week 9 is the real deadline for writing.
- New contracts slipping past Nov 13: deploy Vera's baseline to Amoy first, add new contracts after.
- Faucet delays: claim tokens early.
- Secrets in git: check `git ls-files | grep -i env` before every push.
- Scope creep: alumni view, consent, multisig and indexer are Winter or stretch.
