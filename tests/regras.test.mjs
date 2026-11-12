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
  "parseNum", "calcM3", "dimsM", "grupoCompleto", "motivoComercial", "motivoExpedicao",
  "etapaComercial", "diasParado", "menuDe", "viewInicial", "validarAnexo",
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

test("motivo comercial segue os anexos", () => {
  assert.equal(app.motivoComercial(pend()), "sem_cotacao");
  assert.equal(app.motivoComercial(pend({ cotacoes: [{ id: 1 }] })), "aguardando_aprovacao");
  assert.equal(app.motivoComercial(pend({ cotacoes: [{ id: 1 }], aprovacao_path: "a.png" })), "aguardando_liberacao");
  assert.equal(app.motivoComercial(pend({ motivo_comercial: "divergencia_frete", cotacoes: [{ id: 1 }] })), "divergencia_frete");
  assert.equal(app.motivoComercial(pend({ status_comercial: "liberado" })), null);
});

test("motivo da expedição", () => {
  assert.equal(app.motivoExpedicao(pend()), null);
  assert.equal(app.motivoExpedicao(pend({ status_comercial: "liberado" })), "aguardando_expedicao");
  assert.equal(app.motivoExpedicao(pend({ houve_falta: true })), "falta_mercadoria");
  assert.equal(app.motivoExpedicao(pend({ motivo_expedicao: "divergencia_cubagem", houve_falta: true })), "divergencia_cubagem");
  assert.equal(app.motivoExpedicao(pend({ status_expedicao: "cte_anulado", motivo_expedicao: "falta_mercadoria" })), "cte_anulado");
  assert.equal(app.motivoExpedicao(pend({ status_expedicao: "expedido" })), null);
});

test("etapa comercial", () => {
  assert.equal(app.etapaComercial(pend()).step, 1);
  assert.equal(app.etapaComercial(pend({ cotacoes: [{ id: 1 }] })).step, 2);
  assert.equal(app.etapaComercial(pend({ cotacoes: [{ id: 1 }], aprovacao_path: "a" })).t, "Marque a cotação aprovada");
  assert.equal(app.etapaComercial(pend({ cotacoes: [{ id: 1 }], aprovacao_path: "a", cotacao_aprovada_id: 1 })).t, "Pronta para liberar");
  assert.equal(app.etapaComercial(pend({ status_comercial: "liberado" })).step, 4);
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
