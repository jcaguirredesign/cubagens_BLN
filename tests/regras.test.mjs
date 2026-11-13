// Testes das regras de negócio do index.html (cubagem, motivos de pendência, acesso por perfil).
// Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Babel from "@babel/standalone";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const src = html.match(/<script type="text\/babel">([\s\S]*)<\/script>/)[1];
const code = Babel.transform(src, { presets: ["react"] }).code;

const stubs = {
  React: { useState: () => [], useEffect: () => {}, useCallback: (f) => f, useRef: () => ({}), createElement: () => null, Fragment: "f" },
  ReactDOM: { createRoot: () => ({ render: () => {} }) },
  supabase: { createClient: () => ({}) },
  document: { getElementById: () => null },
};
const exportar = [
  "parseNum", "calcM3", "dimsM", "grupoCompleto", "etapaDe", "problemasDe", "precisaAtencao",
  "diasParado", "menuDe", "viewInicial", "validarAnexo", "chaveInfo", "avisosMedida",
];
const app = new Function(...Object.keys(stubs), `${code}\nreturn { ${exportar.join(", ")} };`)(...Object.values(stubs));

const g = (o) => ({ id: "x", qtd: "", altura: "", largura: "", comprimento: "", unidade: "m", ...o });

test("parseNum aceita vírgula e ponto", () => {
  assert.equal(app.parseNum("1,20"), 1.2);
  assert.equal(app.parseNum("0.8"), 0.8);
  assert.equal(app.parseNum(""), 0);
  assert.equal(app.parseNum("abc"), 0);
});

test("calcM3 em metros e milímetros", () => {
  assert.equal(Number(app.calcM3([g({ qtd: "15", altura: "1,20", largura: "0,80", comprimento: "1" })]).toFixed(4)), 14.4);
  assert.equal(Number(app.calcM3([g({ qtd: "2", altura: "500", largura: "400", comprimento: "300", unidade: "mm" })]).toFixed(4)), 0.12);
  const soma = app.calcM3([g({ qtd: "1", altura: "1", largura: "1", comprimento: "1" }), g({ qtd: "2", altura: "1", largura: "1", comprimento: "1" })]);
  assert.equal(soma, 3);
});

test("dimsM converte mm para metros", () => {
  assert.deepEqual(app.dimsM(g({ altura: "1500", largura: "250", comprimento: "1000", unidade: "mm" })), {
    alturaM: 1.5, larguraM: 0.25, comprimentoM: 1,
  });
});

test("grupoCompleto exige todos os campos maiores que zero", () => {
  assert.equal(app.grupoCompleto(g({ qtd: "3", altura: "1", largura: "1", comprimento: "1" })), true);
  assert.equal(app.grupoCompleto(g({ qtd: "0", altura: "1", largura: "1", comprimento: "1" })), false);
  assert.equal(app.grupoCompleto(g({ qtd: "3", altura: "1", largura: "", comprimento: "1" })), false);
});

const pend = (o) => ({ status_comercial: "em_analise", status_expedicao: "pendente", cotacoes: [], aprovacao_path: null, ...o });

test("etapa da nota segue o processo", () => {
  assert.equal(app.etapaDe(pend()), 1);
  assert.equal(app.etapaDe(pend({ cotacoes: [{ id: 1 }] })), 2);
  // print do fornecedor é opcional: não avança nem trava a etapa
  assert.equal(app.etapaDe(pend({ cotacoes: [{ id: 1 }], aprovacao_path: "a.png" })), 2);
  assert.equal(app.etapaDe(pend({ cotacoes: [{ id: 1 }], cotacao_aprovada_id: 1 })), 3);
  assert.equal(app.etapaDe(pend({ cotacoes: [{ id: 1 }], cotacao_aprovada_id: 1, aprovacao_path: null })), 3);
  assert.equal(app.etapaDe(pend({ status_comercial: "liberado" })), 4);
  assert.equal(app.etapaDe(pend({ status_expedicao: "expedido" })), 5);
  assert.equal(app.etapaDe(pend({ status_expedicao: "expedido", status_comercial: "em_analise" })), 5);
});

test("problemas da nota", () => {
  assert.deepEqual(app.problemasDe(pend()), []);
  assert.equal(app.problemasDe(pend({ houve_falta: true, qtd_falta: 4 }))[0].t, "Falta 4 vol");
  assert.equal(app.problemasDe(pend({ motivo_expedicao: "falta_mercadoria", qtd_falta: 2 })).length, 1);
  assert.equal(app.problemasDe(pend({ status_expedicao: "cte_anulado", cte_anulado_numero: "X1" }))[0].k, "crit");
  assert.equal(app.problemasDe(pend({ motivo_comercial: "divergencia_frete" }))[0].t, "Divergência de frete");
  assert.equal(app.problemasDe(pend({ motivo_expedicao: "aguardando_carregamento" }))[0].k, "mute");
});

test("precisa de atenção: 3+ dias ou problema grave, nunca se já expedida", () => {
  const velho = new Date(Date.now() - 4 * 86400000).toISOString();
  const hoje = new Date().toISOString();
  assert.equal(app.precisaAtencao(pend({ criado_em: velho })), true);
  assert.equal(app.precisaAtencao(pend({ criado_em: hoje })), false);
  assert.equal(app.precisaAtencao(pend({ criado_em: hoje, houve_falta: true })), true);
  assert.equal(app.precisaAtencao(pend({ criado_em: hoje, motivo_expedicao: "divergencia_cubagem" })), false);
  assert.equal(app.precisaAtencao(pend({ criado_em: velho, status_expedicao: "expedido" })), false);
});

test("chave de acesso: 44 dígitos e número da NF", () => {
  const ch = app.chaveInfo("4226 1102 3556 7300 0190 5500 1000 0047 5414 4209 3930");
  assert.equal(ch.ok, true);
  assert.equal(ch.nf, "4754");
  assert.equal(ch.serie, "1");
  assert.equal(app.chaveInfo("123").ok, false);
});

test("aviso de medida suspeita", () => {
  assert.match(app.avisosMedida(g({ altura: "15", largura: "0,15", comprimento: "0,35" }))[0], /0,15/);
  assert.deepEqual(app.avisosMedida(g({ altura: "1,2", largura: "0,8", comprimento: "2,9" })), []);
  assert.equal(app.avisosMedida(g({ altura: "4500", largura: "100", comprimento: "100", unidade: "mm" })).length, 1);
});

test("dias parado", () => {
  const ontem = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
  assert.equal(app.diasParado({ criado_em: ontem }), 1);
  assert.equal(app.diasParado({ criado_em: new Date().toISOString() }), 0);
});

test("menu por perfil: cada setor só vê as próprias páginas", () => {
  const menu = (role) => app.menuDe({ role }).map(([v]) => v);
  assert.deepEqual(menu("user"), ["dashboard"]);
  assert.deepEqual(menu("comercial"), ["mapa", "comercial"]);
  assert.deepEqual(menu("expedicao"), ["mapa", "expedicao", "dashboard", "historico"]);
  assert.deepEqual(menu("admin"), ["mapa", "expedicao", "comercial", "dashboard", "historico", "admin"]);
  assert.deepEqual(menu("owner"), menu("admin"));
  assert.equal(app.viewInicial({ role: "user" }), "dashboard");
  assert.equal(app.viewInicial({ role: "comercial" }), "mapa");
});

test("validação de anexos", () => {
  assert.equal(app.validarAnexo({ type: "application/pdf", size: 1000 }, false), null);
  assert.match(app.validarAnexo({ type: "application/pdf", size: 1000 }, true), /imagem/);
  assert.match(app.validarAnexo({ type: "image/png", size: 11 * 1024 * 1024 }, true), /10 MB/);
  assert.match(app.validarAnexo({ type: "text/plain", size: 10 }, false), /PDF/);
});
