-- Mural (substituto do Miro). Reconstruído a partir do banco em produção
-- (projeto gxgsuvsckoeyeeygyhck); não inclui dados nem tokens de nenhum mural.
--
-- Acesso: RLS ligado e SEM policies. Tudo passa por 3 funções SECURITY DEFINER
-- que validam o token (view_token = só leitura, edit_token = edita).

create table public.murais (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete set null,
  name        text not null,
  view_token  text not null unique default replace(gen_random_uuid()::text, '-', ''),
  edit_token  text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index murais_project_id_idx on public.murais (project_id);

create table public.mural_itens (
  id          uuid primary key default gen_random_uuid(),
  mural_id    uuid not null references public.murais(id) on delete cascade,
  tipo        text not null check (tipo in ('imagem','texto','traco','frame','nota')),
  x           double precision not null default 0,
  y           double precision not null default 0,
  w           double precision,
  h           double precision,
  rotacao     double precision not null default 0,
  z           integer not null default 0,
  dados       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index mural_itens_mural_id_idx on public.mural_itens (mural_id);

alter table public.murais enable row level security;
alter table public.mural_itens enable row level security;

create or replace function public.mural_ler(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m public.murais;
  v_edit boolean;
begin
  select * into m from public.murais
   where view_token = p_token or edit_token = p_token;
  if not found then
    return null;
  end if;
  v_edit := (m.edit_token = p_token);
  return jsonb_build_object(
    'mural', jsonb_build_object('id', m.id, 'name', m.name, 'can_edit', v_edit),
    'itens', coalesce(
      (select jsonb_agg(to_jsonb(i) order by i.z, i.created_at)
         from public.mural_itens i where i.mural_id = m.id),
      '[]'::jsonb)
  );
end;
$function$;

create or replace function public.mural_salvar_item(p_edit_token text, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m public.murais;
  v_id uuid;
  r public.mural_itens;
begin
  select * into m from public.murais where edit_token = p_edit_token;
  if not found then
    raise exception 'token inválido' using errcode = '28000';
  end if;

  v_id := coalesce(nullif(p_item->>'id', '')::uuid, gen_random_uuid());

  insert into public.mural_itens (id, mural_id, tipo, x, y, w, h, rotacao, z, dados)
  values (
    v_id, m.id,
    p_item->>'tipo',
    coalesce((p_item->>'x')::double precision, 0),
    coalesce((p_item->>'y')::double precision, 0),
    (p_item->>'w')::double precision,
    (p_item->>'h')::double precision,
    coalesce((p_item->>'rotacao')::double precision, 0),
    coalesce((p_item->>'z')::integer, 0),
    coalesce(p_item->'dados', '{}'::jsonb)
  )
  on conflict (id) do update set
    tipo    = case when jsonb_exists(p_item, 'tipo')    then excluded.tipo    else mural_itens.tipo end,
    x       = case when jsonb_exists(p_item, 'x')       then excluded.x       else mural_itens.x end,
    y       = case when jsonb_exists(p_item, 'y')       then excluded.y       else mural_itens.y end,
    w       = case when jsonb_exists(p_item, 'w')       then excluded.w       else mural_itens.w end,
    h       = case when jsonb_exists(p_item, 'h')       then excluded.h       else mural_itens.h end,
    rotacao = case when jsonb_exists(p_item, 'rotacao') then excluded.rotacao else mural_itens.rotacao end,
    z       = case when jsonb_exists(p_item, 'z')       then excluded.z       else mural_itens.z end,
    dados   = case when jsonb_exists(p_item, 'dados')   then excluded.dados   else mural_itens.dados end,
    updated_at = now()
  where mural_itens.mural_id = m.id
  returning * into r;

  if r.id is null then
    raise exception 'item pertence a outro mural' using errcode = '42501';
  end if;

  update public.murais set updated_at = now() where id = m.id;
  return to_jsonb(r);
end;
$function$;

create or replace function public.mural_remover_item(p_edit_token text, p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m public.murais;
begin
  select * into m from public.murais where edit_token = p_edit_token;
  if not found then
    raise exception 'token inválido' using errcode = '28000';
  end if;
  delete from public.mural_itens where id = p_item_id and mural_id = m.id;
  update public.murais set updated_at = now() where id = m.id;
  return found;
end;
$function$;

grant execute on function public.mural_ler(text) to anon, authenticated;
grant execute on function public.mural_salvar_item(text, jsonb) to anon, authenticated;
grant execute on function public.mural_remover_item(text, uuid) to anon, authenticated;
