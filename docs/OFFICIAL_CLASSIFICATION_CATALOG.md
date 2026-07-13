# Official Patent Classification Catalog

The `analyze` Edge Function no longer accepts IPC, CPC, FI, or F-term codes generated from model memory. It now performs the following sequence:

1. Extract patent-search keywords and multilingual search terms.
2. Search `classification_records`, which contains normalized records imported from official public classification sources.
3. Ask the model to select only from those retrieved official candidates.
4. Reject any returned code that is not present verbatim in the retrieved candidate set.
5. Return source, edition, title, and match-score evidence for every accepted code.

This design prevents plausible-looking but nonexistent classification symbols from reaching the user.

## Official sources

Use the newest published edition from each authority:

- **IPC:** WIPO International Patent Classification IT support/bulk data: `https://www.wipo.int/classifications/ipc/en/ITsupport/`
- **CPC:** EPO/USPTO Cooperative Patent Classification bulk data: `https://www.cooperativepatentclassification.org/cpcSchemeAndDefinitions/bulk`
- **FI:** Japan Patent Office FI XML and IPC-FI-CPC parallel-viewer bulk data: `https://www.jpo.go.jp/e/system/patent/gaiyo/seido-bunrui/bulkdata.html`
- **F-term:** JPO/J-PlatPat FI and F-term lists linked from: `https://www.jpo.go.jp/e/system/patent/gaiyo/seido-bunrui/index.html`

Do not use unofficial copied code lists as the authoritative catalog. Preserve each record's edition and source URL so results remain auditable.

## 1. Create the catalog table and search function

From the repository root:

```bash
supabase db push
```

This applies `supabase/migrations/20260713090000_create_classification_catalog.sql` and creates:

- `classification_records`
- trigram and full-text indexes
- `search_classification_records(...)`
- service-role-only access to the catalog and search RPC

## 2. Normalize the official files

Convert each official source file to UTF-8 CSV with this header:

```text
system,code,title,description,aliases_text,edition,source_name,source_url,valid_from,valid_to,is_active,metadata
```

Required fields are:

- `system`: `ipc`, `cpc`, `fi`, or `f_term`
- `code`: the exact official symbol
- `title`: the official classification title
- `edition`: source edition, such as `2026.05`
- `source_name`: authority and dataset name
- `source_url`: absolute URL of the official source page or file

Recommended mapping:

| Catalog field | IPC | CPC | FI | F-term |
|---|---|---|---|---|
| `code` | IPC symbol | CPC symbol | FI symbol | Theme code plus viewpoint code |
| `title` | Official English title | Official CPC title | Official FI title | Official F-term title |
| `description` | Notes/scope text when available | Notes/definition text when available | Explanation text | Viewpoint or term explanation |
| `aliases_text` | Japanese/English equivalents | Synonyms and legacy wording | English/Japanese equivalents | Theme and viewpoint wording |
| `edition` | WIPO edition | CPC release | JPO FI release | JPO F-term release |

For F-term, store the complete searchable symbol used by J-PlatPat. Do not store only a theme code when a full F-term is available.

## 3. Import the normalized catalog

Set the service-role credentials only in the local shell used for import:

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

On Windows PowerShell:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

Run the importer:

```bash
deno run --allow-read --allow-net --allow-env \
  scripts/import-classification-catalog.ts \
  path/to/classification-records.csv
```

The importer validates required values and upserts on `(system, code, edition)` in batches of 500.

## 4. Activate only the current edition

A code can exist in multiple editions. Keep historical rows for auditability, but set `is_active = false` for superseded editions after the new release has been imported and checked.

Example:

```sql
update public.classification_records
set is_active = false
where system = 'cpc'
  and edition <> '2026.05';
```

Use the actual newest edition instead of copying the example unchanged.

## 5. Deploy the analysis function

```bash
supabase functions deploy analyze
```

The function deliberately returns HTTP 503 without consuming a credit when the catalog migration is missing or when no official catalog records are searchable.

## Accuracy controls

- Codes are selected only from database candidates.
- Post-processing discards altered or invented codes.
- At most three codes per classification system are returned for one keyword.
- Low-scoring matches cannot be reported as high confidence.
- FI and F-term arrays remain empty when official Japanese classification evidence is insufficient.
- `classification_evidence` records the exact source title, edition, URL, and matching score for every accepted code.

## Operational recommendation

Refresh the catalog whenever WIPO, CPC, or JPO publishes a new edition. Run a small regression set of known patent texts before deactivating the prior edition. This separates classification-data maintenance from application deployment and makes changes easier to audit or roll back.
