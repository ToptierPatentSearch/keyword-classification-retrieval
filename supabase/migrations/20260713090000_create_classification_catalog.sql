create extension if not exists pg_trgm;

create table if not exists public.classification_records (
  id bigint generated always as identity primary key,
  system text not null check (system in ('ipc', 'cpc', 'fi', 'f_term')),
  code text not null,
  title text not null,
  description text,
  aliases_text text not null default '',
  edition text not null,
  source_name text not null,
  source_url text not null,
  valid_from date,
  valid_to date,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  search_text text generated always as (
    lower(
      coalesce(code, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(aliases_text, '')
    )
  ) stored,
  search_document tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(code, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(aliases_text, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (system, code, edition)
);

create index if not exists classification_records_system_active_idx
  on public.classification_records (system, is_active);

create index if not exists classification_records_code_idx
  on public.classification_records (system, code);

create index if not exists classification_records_search_text_trgm_idx
  on public.classification_records using gin (search_text gin_trgm_ops);

create index if not exists classification_records_search_document_idx
  on public.classification_records using gin (search_document);

alter table public.classification_records enable row level security;

revoke all on table public.classification_records from anon, authenticated;
grant all on table public.classification_records to service_role;
grant usage, select on sequence public.classification_records_id_seq to service_role;

create or replace function public.set_classification_record_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists classification_records_set_updated_at
  on public.classification_records;

create trigger classification_records_set_updated_at
before update on public.classification_records
for each row execute function public.set_classification_record_updated_at();

create or replace function public.search_classification_records(
  p_query text,
  p_system text default null,
  p_limit integer default 12
)
returns table (
  system text,
  code text,
  title text,
  description text,
  edition text,
  source_name text,
  source_url text,
  score real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with request as (
    select
      lower(trim(coalesce(p_query, ''))) as normalized_query,
      websearch_to_tsquery('simple', trim(coalesce(p_query, ''))) as parsed_query,
      least(greatest(coalesce(p_limit, 12), 1), 50) as result_limit
  ),
  ranked as (
    select
      record.system,
      record.code,
      record.title,
      record.description,
      record.edition,
      record.source_name,
      record.source_url,
      (
        case
          when lower(record.code) = request.normalized_query then 1.0
          when lower(record.code) like request.normalized_query || '%' then 0.72
          else 0.0
        end
        + greatest(
            similarity(record.search_text, request.normalized_query),
            word_similarity(request.normalized_query, record.search_text)
          ) * 0.62
        + ts_rank_cd(record.search_document, request.parsed_query) * 0.38
      )::real as score
    from public.classification_records as record
    cross join request
    where
      record.is_active
      and request.normalized_query <> ''
      and (p_system is null or record.system = p_system)
      and (
        record.search_text % request.normalized_query
        or record.search_document @@ request.parsed_query
        or lower(record.code) like request.normalized_query || '%'
      )
  )
  select
    ranked.system,
    ranked.code,
    ranked.title,
    ranked.description,
    ranked.edition,
    ranked.source_name,
    ranked.source_url,
    ranked.score
  from ranked
  where ranked.score >= 0.08
  order by ranked.score desc, ranked.system, ranked.code
  limit (select result_limit from request);
$$;

revoke all on function public.search_classification_records(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_classification_records(text, text, integer)
  to service_role;

comment on table public.classification_records is
  'Normalized official IPC, CPC, FI, and F-term scheme records used to verify AI classification suggestions.';

comment on function public.search_classification_records(text, text, integer) is
  'Searches only imported active official classification records using full-text and trigram ranking.';
