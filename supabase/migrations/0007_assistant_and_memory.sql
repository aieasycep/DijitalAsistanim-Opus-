-- 0007 — the conversational assistant and its retrieval memory.

create table if not exists public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  last_message_at timestamptz,
  message_count integer not null default 0 check (message_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null references public.assistant_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]',
  proposed_approval_id uuid references public.approval_actions (id) on delete set null,
  tokens_in integer check (tokens_in >= 0),
  tokens_out integer check (tokens_out >= 0),
  model text,
  was_voice boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_messages_citations_is_array check (jsonb_typeof(citations) = 'array')
);

comment on column public.assistant_messages.citations is
  'SourceRef list backing the answer. An assistant claim with no citation is stripped before the row is written.';
comment on column public.assistant_messages.proposed_approval_id is
  'Set when the answer proposed an action. The action still waits in approval_actions until the user approves it.';

-- Retrieval memory. Rows are derived from the user's own mail, events and captures;
-- they are chunks of stored content, never model-invented summaries of it.
create table if not exists public.memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  source_type source_type not null,
  source_id text not null,
  source_label text,
  person_ids uuid[] not null default '{}',
  topic text,
  occurred_at timestamptz not null,
  token_count integer check (token_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_chunks_unique_source unique (user_id, source_type, source_id),
  constraint memory_chunks_content_not_blank check (length(btrim(content)) > 0)
);

-- The embedding column only exists where pgvector is installed; without it retrieval
-- degrades to the lexical index below rather than failing the migration.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'alter table public.memory_chunks add column if not exists embedding vector(1536)';
  end if;
exception
  when others then
    raise notice 'skipping memory_chunks.embedding: %', sqlerrm;
end
$$;

-- Lexical fallback / hybrid half of retrieval. unaccent lives in whichever schema the
-- extension was installed into, and only its two-argument form is immutable enough for a
-- generated column, so resolve the dictionary before building the expression.
do $$
declare
  dictionary_name text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memory_chunks'
      and column_name = 'content_tsv'
  ) then
    return;
  end if;

  select n.nspname || '.' || d.dictname
  into dictionary_name
  from pg_ts_dict d
  join pg_namespace n on n.oid = d.dictnamespace
  where d.dictname = 'unaccent'
  limit 1;

  if dictionary_name is not null then
    begin
      execute format(
        'alter table public.memory_chunks add column content_tsv tsvector '
        || 'generated always as (to_tsvector(''simple'', unaccent(%L::regdictionary, content))) stored',
        dictionary_name
      );
      return;
    exception
      when others then
        raise notice 'unaccent-backed content_tsv unavailable: %', sqlerrm;
    end;
  end if;

  execute 'alter table public.memory_chunks add column content_tsv tsvector '
    || 'generated always as (to_tsvector(''simple'', content)) stored';
end
$$;

comment on column public.memory_chunks.occurred_at is
  'When the underlying source happened, not when the chunk was indexed. Recency ranking reads this.';
