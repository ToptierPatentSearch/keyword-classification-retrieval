# Official Patent Classification Catalog

The `analyze` Edge Function now uses a two-stage pipeline:

1. OpenAI extracts and normalizes technical keywords from the submitted English or Japanese patent text.
2. Supabase retrieves IPC, CPC, FI, and F-term candidates from `patent_classification_catalog`.
3. OpenAI may select only candidate IDs returned by the catalog search.
4. The Edge Function post-validates every selected ID and discards any value that was not retrieved from the catalog.

This design prevents the model from inventing classification codes. It does not guarantee that every valid search classification is retrieved; professional review remains necessary.

## 1. Apply the migration

```bash
supabase db push
```

The migration creates:

- `patent_classification_catalog`
- `search_patent_classifications_batch(text[], integer)`
- `upsert_patent_classification_entries(jsonb)`
- trigram and scheme indexes
- service-role-only permissions

## 2. Use current official source data

Load the newest in-force records and retain the source version in every row.

| Scheme | Official source | Recommended `source_name` | Example `source_version` |
|---|---|---|---|
| IPC | WIPO IPC master files | `WIPO IPC` | `2026.01` |
| CPC | EPO/USPTO CPC bulk data or CPC linked open data | `EPO-USPTO CPC` | `2026.05` |
| FI | JPO/J-PlatPat FI list | `JPO FI` | Use the published revision or retrieval date |
| F-term | JPO/J-PlatPat F-term list | `JPO F-term` | Use the published revision or retrieval date |

Official entry pages:

- WIPO IPC: `https://www.wipo.int/en/web/classification-ipc`
- CPC bulk data: `https://www.cooperativepatentclassification.org/cpcSchemeAndDefinitions/bulk`
- CPC linked open data: `https://www.cooperativepatentclassification.org/cpcSchemeAndDefinitions/CPCopenLinkedData`
- JPO classification: `https://www.jpo.go.jp/e/system/patent/gaiyo/seido-bunrui/index.html`

Do not scrape J-PlatPat during each user request. Import a versioned local mirror instead; this is faster, auditable, and less likely to break when a public website changes.

## 3. Normalized entry format

`upsert_patent_classification_entries` accepts a JSON array. Each entry uses this shape:

```json
{
  "scheme": "cpc",
  "code": "G06N20/00",
  "title_en": "Machine learning",
  "title_ja": "機械学習",
  "keywords": ["machine learning", "ML", "機械学習"],
  "source_name": "EPO-USPTO CPC",
  "source_url": "https://www.cooperativepatentclassification.org/cpcSchemeAndDefinitions/bulk",
  "source_version": "2026.05",
  "valid_from": "2026-05-01",
  "valid_to": null,
  "is_active": true
}
```

The example illustrates the import format only. Confirm titles, symbols, validity, and version against the current official data before importing.

## 4. Import through the service role

Call the RPC from a protected administrative script or an administrator-only Edge Function. Never expose the service-role key in the React app.

Pseudo-code:

```ts
const { data, error } = await adminClient.rpc(
  'upsert_patent_classification_entries',
  { p_entries: normalizedEntries }
);
```

Import in batches, such as 500 to 2,000 rows, depending on payload size. After a new revision is imported, mark superseded records inactive or set `valid_to` so searches use only current records.

## 5. Validation query

After importing, test retrieval in the Supabase SQL Editor:

```sql
select *
from public.search_patent_classifications_batch(
  array['machine learning', 'endoscope', 'semiconductor memory'],
  5
);
```

Expected behavior:

- results are separated by `query_index` and `scheme`;
- every code has an official title, source URL, and version;
- inactive or expired records are excluded;
- weak lexical matches below the relevance threshold are excluded.

## 6. Deploy the Edge Function

```bash
supabase functions deploy analyze
```

When the catalog is absent or returns no candidates, the function returns empty classification arrays and a warning. It intentionally does not fall back to model-generated codes.
