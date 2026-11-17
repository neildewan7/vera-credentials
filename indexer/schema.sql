-- Target schema for Supabase (Postgres). The indexer currently writes this
-- same shape to a local JSON file (see store.js) since no Supabase project
-- is provisioned yet (issue #12) — swapping the writer for a Postgres client
-- later should require no change to this schema or to listener.js's output.

create table if not exists issuers (
  address text primary key,
  is_approved boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists registries (
  id bigint primary key,
  owner text not null,
  template_type smallint not null,
  verification_registry text not null unique,
  revocation_registry text not null,
  name text not null,
  config_hash text not null,
  created_at timestamptz not null
);

create table if not exists documents (
  registry_address text not null,
  doc_id text not null,
  doc_hash text not null,
  issuer text not null,
  holder text not null,
  uri text,
  registered_at timestamptz not null,
  primary key (registry_address, doc_id)
);

create table if not exists self_reported (
  doc_id text primary key,
  doc_hash text not null,
  holder text not null,
  uri text,
  registered_at timestamptz not null
);

create table if not exists credential_links (
  child_doc_id text primary key,
  parent_registry text not null,
  parent_doc_id text not null,
  holder text not null,
  linked_at timestamptz not null
);

create table if not exists revocations (
  registry_address text not null,
  hash text not null,
  revoked boolean not null default true,
  reason smallint,
  revoked_at timestamptz,
  primary key (registry_address, hash)
);

create index if not exists idx_documents_holder on documents(holder);
create index if not exists idx_self_reported_holder on self_reported(holder);
create index if not exists idx_registries_owner on registries(owner);
