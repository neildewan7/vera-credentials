-- Chain projections are caches, not authority. Only the indexer writes them.
-- Canonical lowercase hex prevents case-dependent duplicate identities.
create domain public.evm_address as text
  check (value ~ '^0x[0-9a-f]{40}$');
create domain public.bytes32 as text
  check (value ~ '^0x[0-9a-f]{64}$');
-- No numeric typmod: reject fractions instead of silently rounding uint256.
create domain public.uint256 as numeric
  check (value = trunc(value) and value between 0 and
    115792089237316195423570985008687907853269984665640564039457584007913129639935);

create table public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 200),
  wallet_address public.evm_address unique,
  wallet_verified_at timestamptz,
  created_at timestamptz not null default now(),
  check ((wallet_address is null) = (wallet_verified_at is null)),
  check (wallet_address <> '0x0000000000000000000000000000000000000000')
);
comment on column public.accounts.wallet_address is
  'Only a trusted backend may set this, after verifying wallet ownership. No client wallet assignment.';

create table public.issuers (
  chain_id public.uint256 not null check (chain_id > 0),
  issuer_registry_address public.evm_address not null,
  issuer_address public.evm_address not null,
  is_approved boolean not null,
  primary key (chain_id, issuer_registry_address, issuer_address)
);

create table public.registries (
  chain_id public.uint256 not null check (chain_id > 0),
  verification_registry_address public.evm_address not null,
  factory_address public.evm_address not null,
  registry_id public.uint256 not null check (registry_id > 0),
  template_type smallint not null check (template_type between 0 and 2),
  original_owner_address public.evm_address not null,
  owner_address public.evm_address not null,
  revocation_registry_address public.evm_address not null,
  config_hash public.bytes32 not null,
  name text not null check (octet_length(name) > 0),
  created_at timestamptz not null,
  primary key (chain_id, verification_registry_address),
  unique (chain_id, factory_address, registry_id),
  unique (chain_id, revocation_registry_address)
);
comment on table public.registries is
  'Factory-discovered registries, including unapproved owners. Types: 0 Document, 1 Dataset, 2 Media. Ownership events update owner_address, never original_owner_address.';
-- No issuer FK: factory creation is ungated and issuer approval is mutable.

create table public.documents (
  chain_id public.uint256 not null,
  registry_address public.evm_address not null,
  doc_id public.bytes32 not null,
  doc_hash public.bytes32 not null
    check (doc_hash <> '0x0000000000000000000000000000000000000000000000000000000000000000'),
  issuer_address public.evm_address not null,
  holder_address public.evm_address not null
    check (holder_address <> '0x0000000000000000000000000000000000000000'),
  uri text not null,
  issued_at timestamptz not null,
  primary key (chain_id, registry_address, doc_id),
  unique (chain_id, registry_address, doc_hash),
  unique (chain_id, registry_address, doc_id, holder_address),
  foreign key (chain_id, registry_address)
    references public.registries(chain_id, verification_registry_address)
);
comment on table public.documents is
  'DocumentRegistered only; issuer_address is the issuer at issuance. Dataset/Media records are deferred until the team settles their interfaces. URI is chain data, not a private storage URL.';

create table public.self_reported (
  chain_id public.uint256 not null check (chain_id > 0),
  registry_address public.evm_address not null,
  revocation_registry_address public.evm_address not null,
  doc_id public.bytes32 not null,
  doc_hash public.bytes32 not null
    check (doc_hash <> '0x0000000000000000000000000000000000000000000000000000000000000000'),
  holder_address public.evm_address not null
    check (holder_address <> '0x0000000000000000000000000000000000000000'),
  uri text not null,
  registered_at timestamptz not null,
  primary key (chain_id, registry_address, doc_id),
  unique (chain_id, registry_address, doc_hash),
  unique (chain_id, registry_address, doc_id, holder_address)
);
comment on table public.self_reported is
  'Standalone shared contract, not factory-created. Indexer reads its paired revocation registry from contract configuration. Linking does not upgrade trust.';

create table public.credential_links (
  chain_id public.uint256 not null,
  link_contract_address public.evm_address not null,
  child_registry_address public.evm_address not null,
  child_doc_id public.bytes32 not null,
  parent_registry_address public.evm_address not null,
  parent_doc_id public.bytes32 not null,
  holder_address public.evm_address not null,
  linked_at timestamptz not null,
  primary key (chain_id, link_contract_address, child_doc_id),
  foreign key (chain_id, child_registry_address, child_doc_id, holder_address)
    references public.self_reported(chain_id, registry_address, doc_id, holder_address),
  foreign key (chain_id, parent_registry_address, parent_doc_id, holder_address)
    references public.documents(chain_id, registry_address, doc_id, holder_address)
);
comment on table public.credential_links is
  'Child registry comes from CredentialRegistry.selfReportedRegistry(). Link does not prove degree type, current approval, or non-revocation. No unlink operation exists in the current contract.';

create table public.revocations (
  chain_id public.uint256 not null check (chain_id > 0),
  revocation_registry_address public.evm_address not null,
  doc_hash public.bytes32 not null,
  registered_at timestamptz not null,
  revoked_at timestamptz,
  reason smallint,
  primary key (chain_id, revocation_registry_address, doc_hash),
  check ((revoked_at is null and reason is null) or
    (revoked_at is not null and reason is not null and reason between 1 and 10)),
  check (revoked_at >= registered_at)
);
comment on table public.revocations is
  'One current state per companion registry/hash, for both documents and self-reported entries. No row means unknown. Reasons 1..10 match RevocationRegistry; NONE (0) cannot revoke.';
-- No factory-only FK: SelfReportedRegistry deploys its own companion registry.

create table public.consent_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  schema_version integer not null default 1 check (schema_version = 1)
);
comment on table public.consent_settings is
  'Issue #14 scaffold only. Stored preferences confer no access. CRM/department sharing semantics await mentor answers.';

create table public.chain_events (
  chain_id public.uint256 not null check (chain_id > 0),
  transaction_hash public.bytes32 not null,
  log_index public.uint256 not null,
  block_number public.uint256 not null,
  block_hash public.bytes32 not null,
  contract_address public.evm_address not null,
  event_name text not null check (length(event_name) > 0),
  args jsonb not null check (jsonb_typeof(args) = 'object'),
  primary key (chain_id, transaction_hash, log_index)
);
comment on table public.chain_events is
  'Canonical decoded logs only. PK makes retries idempotent. Indexer must reconcile block hashes, remove orphaned logs, and rebuild affected projections on reorg.';

create table public.indexer_checkpoints (
  chain_id public.uint256 not null check (chain_id > 0),
  contract_address public.evm_address not null,
  last_block_number public.uint256 not null,
  last_block_hash public.bytes32 not null,
  primary key (chain_id, contract_address)
);
comment on table public.indexer_checkpoints is
  'Last fully processed canonical block per contract, inclusive. No row means not started. Advance atomically with log/projection writes; rewind on reorg. Start discovery at deployment block.';

create index documents_holder_idx on public.documents(holder_address);
create index documents_issuer_idx on public.documents(issuer_address);
create index self_reported_holder_idx on public.self_reported(holder_address);
create index self_reported_revocation_idx on public.self_reported(chain_id, revocation_registry_address, doc_hash);
create index credential_links_parent_idx on public.credential_links(chain_id, parent_registry_address, parent_doc_id, holder_address);
create index credential_links_child_idx on public.credential_links(chain_id, child_registry_address, child_doc_id, holder_address);
create index credential_links_holder_idx on public.credential_links(holder_address);
create index chain_events_replay_idx on public.chain_events(chain_id, block_number, log_index);
create index chain_events_contract_idx on public.chain_events(chain_id, contract_address, block_number);
