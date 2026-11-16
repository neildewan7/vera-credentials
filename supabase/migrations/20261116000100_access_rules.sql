-- Explicit grants complement RLS; never rely on project default privileges.
grant usage on schema public to anon, authenticated, service_role;
revoke all on table public.accounts, public.issuers, public.registries,
  public.documents, public.self_reported, public.credential_links,
  public.revocations, public.consent_settings, public.chain_events,
  public.indexer_checkpoints from public, anon, authenticated;
grant all on table public.accounts, public.issuers, public.registries,
  public.documents, public.self_reported, public.credential_links,
  public.revocations, public.consent_settings, public.chain_events,
  public.indexer_checkpoints to service_role;

grant select on public.accounts, public.issuers, public.registries,
  public.documents, public.self_reported, public.credential_links,
  public.revocations, public.consent_settings to authenticated;
-- Clients cannot set/update wallet_address, wallet_verified_at, or created_at.
grant insert (id, display_name), update (display_name) on public.accounts to authenticated;
grant insert (account_id, settings), update (settings) on public.consent_settings to authenticated;

alter table public.accounts enable row level security;
alter table public.issuers enable row level security;
alter table public.registries enable row level security;
alter table public.documents enable row level security;
alter table public.self_reported enable row level security;
alter table public.credential_links enable row level security;
alter table public.revocations enable row level security;
alter table public.consent_settings enable row level security;
alter table public.chain_events enable row level security;
alter table public.indexer_checkpoints enable row level security;

create policy accounts_read_own on public.accounts for select to authenticated
  using (id = (select auth.uid()));
create policy accounts_insert_own on public.accounts for insert to authenticated
  with check (id = (select auth.uid()));
create policy accounts_update_own on public.accounts for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Chain catalog facts only; no profiles, private metadata, or files here.
create policy issuers_read_authenticated on public.issuers for select to authenticated using (true);
create policy registries_read_authenticated on public.registries for select to authenticated using (true);

create policy documents_read_participant on public.documents for select to authenticated
  using (exists (
    select 1 from public.accounts a where a.id = (select auth.uid())
      and a.wallet_verified_at is not null
      and (a.wallet_address = documents.holder_address
        or a.wallet_address = documents.issuer_address
        or exists (select 1 from public.registries r
          where r.chain_id = documents.chain_id
            and r.verification_registry_address = documents.registry_address
            and r.owner_address = a.wallet_address))
  ));
create policy self_reported_read_holder on public.self_reported for select to authenticated
  using (exists (
    select 1 from public.accounts a where a.id = (select auth.uid())
      and a.wallet_verified_at is not null and a.wallet_address = self_reported.holder_address
  ));
create policy credential_links_read_participant on public.credential_links for select to authenticated
  using (exists (
    select 1 from public.accounts a where a.id = (select auth.uid())
      and a.wallet_verified_at is not null and a.wallet_address = credential_links.holder_address
  ) or exists (
    -- Documents RLS limits this branch to the parent holder/issuer/registry owner.
    select 1 from public.documents d where d.chain_id = credential_links.chain_id
      and d.registry_address = credential_links.parent_registry_address
      and d.doc_id = credential_links.parent_doc_id
  ));
create policy revocations_read_participant on public.revocations for select to authenticated
  using (exists (
    select 1 from public.documents d
      join public.registries r on r.chain_id = d.chain_id
        and r.verification_registry_address = d.registry_address
      where d.chain_id = revocations.chain_id and d.doc_hash = revocations.doc_hash
        and r.revocation_registry_address = revocations.revocation_registry_address
  ) or exists (
    select 1 from public.self_reported s where s.chain_id = revocations.chain_id
      and s.revocation_registry_address = revocations.revocation_registry_address
      and s.doc_hash = revocations.doc_hash
  ));

create policy consent_read_own on public.consent_settings for select to authenticated
  using (account_id = (select auth.uid()));
create policy consent_insert_own on public.consent_settings for insert to authenticated
  with check (account_id = (select auth.uid()));
create policy consent_update_own on public.consent_settings for update to authenticated
  using (account_id = (select auth.uid())) with check (account_id = (select auth.uid()));
-- No client writes/deletes on projections; no client access at all to events or
-- checkpoints. service_role is the trusted server/indexer role and bypasses RLS.
-- No consent policy grants access to another user's records (issue #14).
