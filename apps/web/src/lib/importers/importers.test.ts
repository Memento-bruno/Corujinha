import { describe, expect, it } from "vitest";
import { parseMoneyToCents } from "../domain/money";
import { parseCsv } from "./csv";
import { guessCategory, merchantKeyOf, parseInstallment } from "./normalize";
import { parseOfx } from "./ofx";
import { parsePdfText } from "./pdf-text";

describe("parseMoneyToCents", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234.56", 123456],
    ["R$ 12,30", 1230],
    ["-R$ 12,30", -1230],
    ["12,30-", -1230],
    ["(5,00)", -500],
    ["1.234", 123400],
    ["abc", null],
  ])("%s", (raw, expected) => expect(parseMoneyToCents(raw)).toBe(expected));
});

describe("normalize", () => {
  it("normaliza estabelecimentos", () => {
    expect(merchantKeyOf("IFD*IFOOD SAO PAULO BR")).toBe("ifood");
    expect(merchantKeyOf("NETFLIX.COM 0800")).toBe("netflix");
    expect(merchantKeyOf("UBER *TRIP HELP.UBER.COM")).toBe("uber");
  });
  it("categoriza", () => {
    expect(guessCategory("IFD*IFOOD")).toBe("delivery");
    expect(guessCategory("Uber *Trip")).toBe("transporte_app");
    expect(guessCategory("Netflix.com")).toBe("assinaturas");
    expect(guessCategory("Pão de Açúcar")).toBe("mercado");
    expect(guessCategory("ESTAPAR ESTACIONAMENTOS")).toBe("estacionamento");
    expect(guessCategory("SEM PARAR")).toBe("carro");
    expect(guessCategory("AUTO POSTO SHELL")).toBe("combustivel");
    expect(guessCategory("Loja Aleatória XPTO")).toBe("outros");
  });
  it("lê parcelas", () => {
    expect(parseInstallment("MAGALU 03/10")).toEqual({ current: 3, total: 10 });
    expect(parseInstallment("PARC 1/12 APPLE")).toEqual({ current: 1, total: 12 });
    expect(parseInstallment("Compra 15/10")).toBeUndefined();
  });
});

describe("parseCsv", () => {
  it("lê o formato Nubank e ignora pagamento da fatura", () => {
    const r = parseCsv("date,title,amount\n2026-10-03,Netflix.com,55.90\n2026-10-05,Magalu 03/10,429.90\n2026-10-10,Pagamento recebido,-1500.00\n");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: "2026-10-03", description: "Netflix.com", amount: 5590 });
    expect(r.rows[1]).toMatchObject({ description: "Magalu", installment: { current: 3, total: 10 } });
    expect(r.skipped[0].reason).toMatch(/Pagamento/);
  });
  it("lê ponto e vírgula, data brasileira e inverte gastos negativos", () => {
    const r = parseCsv("Data;Lançamento;Valor\n03/10/2026;UBER TRIP;-23,40\n04/10/2026;IFOOD;-45,90\n05/10/2026;STARBUCKS;-18,00\n");
    expect(r.rows.map((x) => x.amount)).toEqual([2340, 4590, 1800]);
    expect(r.warnings.length).toBe(1);
  });
});

describe("parseOfx", () => {
  it("lê OFX SGML de cartão", () => {
    const ofx = `OFXHEADER:100
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000[-3:BRT]<TRNAMT>-55.90<FITID>1<MEMO>NETFLIX.COM
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261008<TRNAMT>45.90<FITID>2<MEMO>ESTORNO IFOOD
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261010<TRNAMT>1500.00<FITID>3<MEMO>PAGAMENTO RECEBIDO
</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    const r = parseOfx(ofx);
    expect(r.rows).toEqual([
      { date: "2026-10-03", description: "NETFLIX.COM", amount: 5590, installment: undefined },
      { date: "2026-10-08", description: "ESTORNO IFOOD", amount: -4590, installment: undefined },
    ]);
  });
});

describe("parsePdfText", () => {
  it("extrai linhas DD/MM descrição valor", () => {
    const text = `Fatura Outubro\n03/10 NETFLIX.COM 55,90\n05 OUT MAGALU 03/10 429,90\n10/10 PAGAMENTO RECEBIDO -1.500,00\nTotal 485,80`;
    const r = parsePdfText(text, 2026);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ date: "2026-10-05", amount: 42990, installment: { current: 3, total: 10 } });
  });
});
