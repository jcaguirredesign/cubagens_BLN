-- Issue #17 — Arquivo da cotação e print de aprovação opcionais para liberar.
-- Continua obrigatório: cotação aprovada marcada (número e valor vão para a nota).

alter table public.pendencias_cotacoes alter column arquivo_path drop not null;

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
      select numero, frete_valor into v_num, v_val from public.pendencias_cotacoes where id = new.cotacao_aprovada_id;
      new.cotacao_numero := v_num;
      new.frete_valor := v_val;
      new.data_liberacao := coalesce(new.data_liberacao, current_date);
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
