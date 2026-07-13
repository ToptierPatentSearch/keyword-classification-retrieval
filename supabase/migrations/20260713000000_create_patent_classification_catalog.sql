-- Official patent-classification catalog used by the analyze Edge Function.
-- Populate this table from current WIPO IPC, EPO/USPTO CPC, and JPO/J-PlatPat
-- FI/F-term data before enabling database-verified classification in production.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.patent_classification_catalog (
  id bigint generated always as identity primary key,
  scheme text not null check (scheme in ('ipc', 'cpc', 'fi', 'f_term')),
  code text not null check (length(btrim(code)) > 0),
  title_en text not null default '',
  title_ja text,
  keywords text[] not null default '{}'::text[],
  source_name text not null check (length(btrim(source_name)) > 0),
  source_url text not null check (length(btrim(source_url)) > 0),
  source_version text not null check (length(btrim(source_version)) > 0),
  valid_from date,
  valid_to date,
  is_active boolean not null default true,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patent_classification_catalog_validity_check
    check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint patent_classification_catalog_unique_record
    unique (scheme, code, source_name, source_version)
);

comment on table public.patent_classification_catalog is
  'Versioned local mirror of official IPC, CPC, FI, and F-term classification records.';
comment on column public.patent_classification_catalog.keywords is
  'Curated official index terms or import-generated synonyms; do not add model-invented codes.';

create index if not exists patent_classification_catalog_scheme_active_idx
  on public.patent_classification_catalog (scheme, is_active);

create index if not exists patent_classification_catalog_code_trgm_idx
  on public.patent_classification_catalog
  using gin (lower(code) extensions.gin_trgm_ops);

create index if not exists patent_classification_catalog_title_en_trgm_idx
  on public.patent_classification_catalog
  using gin (lower(title_en) extensions.gin_trgm_ops);

create index if not exists patent_classification_catalog_title_ja_trgm_idx
  on public.patent_classification_catalog
  using gin (lower(coalesce(title_ja, '')) extensions.gin_trgm_ops);

create or replace function public.set_patent_classification_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_patent_classification_updated_at
  on public.patent_classification_catalog;

create trigger set_patent_classification_updated_at
before update on public.patent_classification_catalog
for each row execute function public.set_patent_classification_updated_at();

alter table public.patent_classification_catalog enable row level security;

revoke all on table public.patent_classification_catalog from anon, authenticated;
grant select, insert, update, delete on table public.patent_classification_catalog to service_role;
grant usage, select on sequence public.patent_classification_catalog_id_seq to service_role;

create or replace function public.search_patent_classifications_batch(
  p_queries text[],
  p_limit_per_scheme integer default 8
)
returns table (
  query_index integer,
  id bigint,
  scheme text,
  code text,
  title_en text,
  title_ja text,
  source_name text,
  source_url text,
  source_version text,
  score double precision
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with input_queries as (
    select
      (ordinality - 1)::integer as query_index,
      btrim(value) as query_text,
      lower(btrim(value)) as normalized_query
    from unnest(coalesce(p_queries, '{}'::text[])) with ordinality as q(value, ordinality)
    where length(btrim(value)) >= 2
  ),
  scored as (
    select
      q.query_index,
      c.id,
      c.scheme,
      c.code,
      c.title_en,
      c.title_ja,
      c.source_name,
      c.source_url,
      c.source_version,
      greatest(
        case when lower(c.code) = q.normalized_query then 100.0 else 0.0 end,
        case when lower(c.title_en) = q.normalized_query then 96.0 else 0.0 end,
        case when lower(coalesce(c.title_ja, '')) = q.normalized_query then 96.0 else 0.0 end,
        case when exists (
          select 1
          from unnest(c.keywords) as keyword
          where lower(btrim(keyword)) = q.normalized_query
        ) then 94.0 else 0.0 end,
        case when lower(c.title_en) like '%' || q.normalized_query || '%' then 82.0 else 0.0 end,
        case when lower(coalesce(c.title_ja, '')) like '%' || q.normalized_query || '%' then 82.0 else 0.0 end,
        100.0 * extensions.similarity(lower(c.title_en), q.normalized_query),
        100.0 * extensions.similarity(lower(coalesce(c.title_ja, '')), q.normalized_query),
        100.0 * extensions.similarity(lower(array_to_string(c.keywords, ' ')), q.normalized_query),
        35.0 * ts_rank(
          to_tsvector(
            'simple',
            concat_ws(' ', c.code, c.title_en, c.title_ja, array_to_string(c.keywords, ' '))
          ),
          plainto_tsquery('simple', q.query_text)
        )
      )::double precision as score
    from input_queries q
    cross join public.patent_classification_catalog c
    where c.is_active
      and (c.valid_from is null or c.valid_from <= current_date)
      and (c.valid_to is null or c.valid_to >= current_date)
      and (
        lower(c.code) = q.normalized_query
        or lower(c.title_en) like '%' || q.normalized_query || '%'
        or lower(coalesce(c.title_ja, '')) like '%' || q.normalized_query || '%'
        or exists (
          select 1
          from unnest(c.keywords) as keyword
          where lower(keyword) like '%' || q.normalized_query || '%'
             or q.normalized_query like '%' || lower(keyword) || '%'
        )
        or extensions.similarity(lower(c.title_en), q.normalized_query) >= 0.15
        or extensions.similarity(lower(coalesce(c.title_ja, '')), q.normalized_query) >= 0.15
        or to_tsvector(
          'simple',
          concat_ws(' ', c.code, c.title_en, c.title_ja, array_to_string(c.keywords, ' '))
        ) @@ plainto_tsquery('simple', q.query_text)
      )
  ),
  ranked as (
    select
      scored.*,
      row_number() over (
        partition by scored.query_index, scored.scheme
        order by scored.score desc, length(scored.code), scored.code
      ) as scheme_rank
    from scored
    where scored.score >= 15.0
  )
  select
    ranked.query_index,
    ranked.id,
    ranked.scheme,
    ranked.code,
    ranked.title_en,
    ranked.title_ja,
    ranked.source_name,
    ranked.source_url,
    ranked.source_version,
    ranked.score
  from ranked
  where ranked.scheme_rank <= greatest(1, least(coalesce(p_limit_per_scheme, 8), 20))
  order by ranked.query_index, ranked.scheme, ranked.scheme_rank;
$$;

revoke all on function public.search_patent_classifications_batch(text[], integer)
  from public, anon, authenticated;
grant execute on function public.search_patent_classifications_batch(text[], integer)
  to service_role;

create or replace function public.upsert_patent_classification_entries(p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected_rows integer := 0;
begin
  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'p_entries must be a JSON array';
  end if;

  insert into public.patent_classification_catalog (
    scheme,
    code,
    title_en,
    title_ja,
    keywords,
    source_name,
    source_url,
    source_version,
    valid_from,
    valid_to,
    is_active,
    imported_at
  )
  select
    lower(btrim(entry.scheme)),
    btrim(entry.code),
    coalesce(btrim(entry.title_en), ''),
    nullif(btrim(entry.title_ja), ''),
    coalesce(entry.keywords, '{}'::text[]),
    btrim(entry.source_name),
    btrim(entry.source_url),
    btrim(entry.source_version),
    entry.valid_from,
    entry.valid_to,
    coalesce(entry.is_active, true),
    now()
  from jsonb_to_recordset(p_entries) as entry (
    scheme text,
    code text,
    title_en text,
    title_ja text,
    keywords text[],
    source_name text,
    source_url text,
    source_version text,
    valid_from date,
    valid_to date,
    is_active boolean
  )
  where lower(btrim(entry.scheme)) in ('ipc', 'cpc', 'fi', 'f_term')
    and length(btrim(entry.code)) > 0
    and length(btrim(entry.source_name)) > 0
    and length(btrim(entry.source_url)) > 0
    and length(btrim(entry.source_version)) > 0
  on conflict (scheme, code, source_name, source_version)
  do update set
    title_en = excluded.title_en,
    title_ja = excluded.title_ja,
    keywords = excluded.keywords,
    source_url = excluded.source_url,
    valid_from = excluded.valid_from,
    valid_to = excluded.valid_to,
    is_active = excluded.is_active,
    imported_at = excluded.imported_at,
    updated_at = now();

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.upsert_patent_classification_entries(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_patent_classification_entries(jsonb)
  to service_role;
