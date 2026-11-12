-- Issue #13 — Motivos de pendência, cotações por nota e aprovação do fornecedor
-- Aditiva: não altera nem remove dados existentes.

-- 1) Novos campos na pendência
alter table public.pendencias_emissao
  add column if not exists motivo_expedicao text,
  add column if not exists motivo_comercial text,
  add column if not exists aprovacao_path text,
  add column if not exists aprovacao_nome text,
  add column if not exists aprovacao_em timestamptz,
  add column if not exists aprovacao_por uuid,
  add column if not exists aprovacao_por_nome text,
  add column if not exists cotacao_aprovada_id uuid;

alter table public.pendencias_emissao
  add constraint pendencias_motivo_expedicao_chk
    check (motivo_expedicao is null or motivo_expedicao in ('divergencia_cubagem','falta_mercadoria','aguardando_carregamento')),
  add constraint pendencias_motivo_comercial_chk
    check (motivo_comercial is null or motivo_comercial in ('divergencia_frete'));

-- 2) Cotações por nota
create table public.pendencias_cotacoes (
  id uuid primary key default gen_random_uuid(),
  pendencia_id uuid not null references public.pendencias_emissao(id) on delete cascade,
  numero text not null check (length(trim(numero)) > 0),
  frete_valor numeric(12,2) not null check (frete_valor >= 0),
  arquivo_path text not null,
  arquivo_nome text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  criado_por_nome text
);
create index pendencias_cotacoes_pendencia_idx on public.pendencias_cotacoes(pendencia_id);

alter table public.pendencias_emissao
  add constraint pendencias_cotacao_aprovada_fk
    foreign key (cotacao_aprovada_id) references public.pendencias_cotacoes(id) on delete set null;
create index pendencias_cotacao_aprovada_idx on public.pendencias_emissao(cotacao_aprovada_id);

alter table public.pendencias_cotacoes enable row level security;
revoke all on public.pendencias_cotacoes from anon;

create policy cotacoes_select on public.pendencias_cotacoes for select to authenticated
  using (private.has_role(auth.uid(), array['admin','owner','comercial','expedicao']));

create policy cotacoes_insert on public.pendencias_cotacoes for insert to authenticated
  with check (
    private.has_role(auth.uid(), array['admin','owner','comercial'])
    and exists (select 1 from public.pendencias_emissao p where p.id = pendencia_id and p.status_comercial is distinct from 'liberado')
  );

create policy cotacoes_delete on public.pendencias_cotacoes for delete to authenticated
  using (
    private.has_role(auth.uid(), array['admin','owner','comercial'])
    and exists (select 1 from public.pendencias_emissao p where p.id = pendencia_id and p.status_comercial is distinct from 'liberado')
  );

-- Autor da cotação sempre definido no servidor
create or replace function public.enforce_cotacao_criado_por()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.criado_por := auth.uid();
  new.criado_em := now();
  select nome into new.criado_por_nome from public.perfis where id = auth.uid();
  return new;
end;
$$;
create trigger trg_cotacao_criado_por before insert on public.pendencias_cotacoes
  for each row execute function public.enforce_cotacao_criado_por();
revoke execute on function public.enforce_cotacao_criado_por() from anon, authenticated, public;

-- 3) Regra de liberação comercial: cotação aprovada + print do fornecedor
create or replace function public.enforce_pendencia_comercial()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_num text;
  v_val numeric;
  v_old_path text := case when tg_op = 'UPDATE' then old.aprovacao_path end;
begin
  if new.aprovacao_path is distinct from v_old_path then
    if new.aprovacao_path is null then
      new.aprovacao_nome := null; new.aprovacao_em := null; new.aprovacao_por := null; new.aprovacao_por_nome := null;
    else
      new.aprovacao_em := now();
      new.aprovacao_por := auth.uid();
      select nome into new.aprovacao_por_nome from public.perfis where id = auth.uid();
    end if;
  end if;

  if new.cotacao_aprovada_id is not null
     and not exists (select 1 from public.pendencias_cotacoes c where c.id = new.cotacao_aprovada_id and c.pendencia_id = new.id) then
    raise exception 'A cotação aprovada não pertence a esta nota.';
  end if;

  if new.status_comercial = 'liberado' then
    if tg_op = 'INSERT' or old.status_comercial is distinct from 'liberado' then
      if new.cotacao_aprovada_id is null then
        raise exception 'Para liberar, marque qual cotação foi aprovada.';
      end if;
      if new.aprovacao_path is null then
        raise exception 'Para liberar, anexe o print da aprovação do fornecedor.';
      end if;
      select numero, frete_valor into v_num, v_val from public.pendencias_cotacoes where id = new.cotacao_aprovada_id;
      new.cotacao_numero := v_num;
      new.frete_valor := v_val;
      new.data_liberacao := coalesce(new.data_liberacao, current_date);
    elsif old.aprovacao_path is not null and new.aprovacao_path is null then
      raise exception 'Nota já liberada: o print de aprovação não pode ser removido.';
    end if;
  else
    new.status_comercial := 'em_analise';
    new.data_liberacao := null;
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;
revoke execute on function public.enforce_pendencia_comercial() from anon, authenticated, public;

-- 4) Permissão por campo (inclui os novos campos)
create or replace function public.enforce_pendencia_field_permissions()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.cotacao_numero is distinct from old.cotacao_numero
        or new.frete_valor is distinct from old.frete_valor
        or new.status_comercial is distinct from old.status_comercial
        or new.observacao_comercial is distinct from old.observacao_comercial
        or new.motivo_comercial is distinct from old.motivo_comercial
        or new.aprovacao_path is distinct from old.aprovacao_path
        or new.aprovacao_nome is distinct from old.aprovacao_nome
        or new.cotacao_aprovada_id is distinct from old.cotacao_aprovada_id)
       and not private.has_role(auth.uid(), array['admin','owner','comercial']) then
      raise exception 'Apenas comercial/admin/owner podem alterar campos comerciais.';
    end if;

    if (new.status_expedicao is distinct from old.status_expedicao
        or new.observacao_expedicao is distinct from old.observacao_expedicao
        or new.motivo_expedicao is distinct from old.motivo_expedicao
        or new.houve_falta is distinct from old.houve_falta
        or new.qtd_falta is distinct from old.qtd_falta
        or new.cte_anulado_numero is distinct from old.cte_anulado_numero
        or new.frota_id is distinct from old.frota_id
        or new.frota_placa is distinct from old.frota_placa
        or new.cliente is distinct from old.cliente
        or new.nf_numero is distinct from old.nf_numero
        or new.chave_nf is distinct from old.chave_nf
        or new.uf_destino is distinct from old.uf_destino
        or new.municipio_destino is distinct from old.municipio_destino
        or new.qtd_volumes is distinct from old.qtd_volumes
        or new.m3_total is distinct from old.m3_total
        or new.nf_imagem_path is distinct from old.nf_imagem_path
        or new.registro_vinculado_id is distinct from old.registro_vinculado_id)
       and not private.has_role(auth.uid(), array['admin','owner','expedicao']) then
      raise exception 'Apenas expedição/admin/owner podem alterar os dados gerais/expedição desta pendência.';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_pendencia_field_permissions() from anon, authenticated, public;
