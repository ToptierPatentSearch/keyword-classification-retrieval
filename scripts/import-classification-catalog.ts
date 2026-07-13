type ClassificationSystem = 'ipc' | 'cpc' | 'fi' | 'f_term';

interface ClassificationRecord {
  system: ClassificationSystem;
  code: string;
  title: string;
  description: string | null;
  aliases_text: string;
  edition: string;
  source_name: string;
  source_url: string;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

const REQUIRED_COLUMNS = [
  'system',
  'code',
  'title',
  'edition',
  'source_name',
  'source_url',
] as const;
const VALID_SYSTEMS = new Set<ClassificationSystem>(['ipc', 'cpc', 'fi', 'f_term']);
const BATCH_SIZE = 500;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error('CSV has an unterminated quoted field.');
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows.filter((values) => values.some((value) => value.trim() !== ''));
}

function parseBoolean(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();

  if (!normalized) return fallback;
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseMetadata(value: string): Record<string, unknown> {
  if (!value.trim()) return {};

  const parsed = JSON.parse(value) as unknown;

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('metadata must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function buildRecords(rows: string[][]): ClassificationRecord[] {
  if (rows.length < 2) {
    throw new Error('The CSV must contain a header and at least one data row.');
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const indexes = new Map(headers.map((header, index) => [header, index]));

  for (const required of REQUIRED_COLUMNS) {
    if (!indexes.has(required)) {
      throw new Error(`Missing required CSV column: ${required}`);
    }
  }

  const valueOf = (row: string[], column: string) => {
    const index = indexes.get(column);
    return index === undefined ? '' : (row[index] ?? '');
  };

  return rows.slice(1).map((row, offset) => {
    const line = offset + 2;
    const system = valueOf(row, 'system').trim().toLowerCase() as ClassificationSystem;
    const code = valueOf(row, 'code').trim();
    const title = valueOf(row, 'title').trim();
    const edition = valueOf(row, 'edition').trim();
    const sourceName = valueOf(row, 'source_name').trim();
    const sourceUrl = valueOf(row, 'source_url').trim();

    if (!VALID_SYSTEMS.has(system)) {
      throw new Error(`Line ${line}: system must be ipc, cpc, fi, or f_term.`);
    }

    if (!code || !title || !edition || !sourceName || !sourceUrl) {
      throw new Error(`Line ${line}: code, title, edition, source_name, and source_url are required.`);
    }

    try {
      new URL(sourceUrl);
    } catch {
      throw new Error(`Line ${line}: source_url must be an absolute URL.`);
    }

    return {
      system,
      code,
      title,
      description: nullable(valueOf(row, 'description')),
      aliases_text: valueOf(row, 'aliases_text').trim(),
      edition,
      source_name: sourceName,
      source_url: sourceUrl,
      valid_from: nullable(valueOf(row, 'valid_from')),
      valid_to: nullable(valueOf(row, 'valid_to')),
      is_active: parseBoolean(valueOf(row, 'is_active'), true),
      metadata: parseMetadata(valueOf(row, 'metadata')),
    };
  });
}

async function upsertBatch(
  supabaseUrl: string,
  serviceRoleKey: string,
  records: ClassificationRecord[],
): Promise<void> {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/classification_records?on_conflict=system,code,edition`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(records),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Supabase import failed (${response.status}): ${await response.text()}`
    );
  }
}

async function main(): Promise<void> {
  const [csvPath] = Deno.args;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!csvPath) {
    throw new Error(
      'Usage: deno run --allow-read --allow-net --allow-env scripts/import-classification-catalog.ts <normalized.csv>'
    );
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.');
  }

  const records = buildRecords(parseCsv(await Deno.readTextFile(csvPath)));

  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    const batch = records.slice(index, index + BATCH_SIZE);
    await upsertBatch(supabaseUrl, serviceRoleKey, batch);
    console.log(`Imported ${Math.min(index + batch.length, records.length)} / ${records.length}`);
  }

  console.log(`Classification catalog import complete: ${records.length} records.`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    Deno.exit(1);
  });
}
