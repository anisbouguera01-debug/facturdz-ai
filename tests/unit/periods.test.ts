import { describe, expect, it } from "vitest";
import { todayISO } from "@/lib/dates";
import { resolvePeriod } from "@/lib/periods";

describe("resolvePeriod", () => {
  it("sans période : aucun filtre", () => {
    expect(resolvePeriod({}, "2026-10-09")).toEqual({});
    expect(resolvePeriod({ period: "n'importe quoi" }, "2026-10-09")).toEqual({});
  });

  it("aujourd'hui", () => {
    expect(resolvePeriod({ period: "today" }, "2026-10-09")).toMatchObject({
      from: "2026-10-09",
      to: "2026-10-09",
    });
  });

  it("cette semaine : dimanche à samedi", () => {
    // 2026-10-09 est un vendredi : semaine du dimanche 4 au samedi 10.
    expect(resolvePeriod({ period: "week" }, "2026-10-09")).toMatchObject({
      from: "2026-10-04",
      to: "2026-10-10",
    });
    // Un dimanche ouvre la semaine, un samedi la clôt.
    expect(resolvePeriod({ period: "week" }, "2026-10-04")).toMatchObject({
      from: "2026-10-04",
      to: "2026-10-10",
    });
    expect(resolvePeriod({ period: "week" }, "2026-10-10")).toMatchObject({
      from: "2026-10-04",
      to: "2026-10-10",
    });
  });

  it("semaine à cheval sur deux mois et deux années", () => {
    expect(resolvePeriod({ period: "week" }, "2026-12-31")).toMatchObject({
      from: "2026-12-27",
      to: "2027-01-02",
    });
  });

  it("ce mois : premier au dernier jour, y compris février bissextile", () => {
    expect(resolvePeriod({ period: "month" }, "2026-10-09")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(resolvePeriod({ period: "month" }, "2028-02-10")).toMatchObject({
      from: "2028-02-01",
      to: "2028-02-29",
    });
    expect(resolvePeriod({ period: "month" }, "2027-02-10")).toMatchObject({
      from: "2027-02-01",
      to: "2027-02-28",
    });
  });

  it("mois précédent, dont le passage d'année", () => {
    expect(resolvePeriod({ period: "last-month" }, "2026-10-09")).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(resolvePeriod({ period: "last-month" }, "2027-01-01")).toMatchObject({
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(resolvePeriod({ period: "last-month" }, "2028-03-31")).toMatchObject({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("période personnalisée valide, ouverte d'un côté ou d'un jour", () => {
    expect(resolvePeriod({ period: "custom", from: "2026-01-01", to: "2026-01-31" })).toEqual({
      preset: "custom",
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(resolvePeriod({ period: "custom", from: "2026-05-05" })).toMatchObject({
      from: "2026-05-05",
    });
    expect(resolvePeriod({ period: "custom", from: "2026-05-05", to: "2026-05-05" })).toMatchObject(
      { from: "2026-05-05", to: "2026-05-05" },
    );
  });

  it("des dates seules valent période personnalisée", () => {
    expect(resolvePeriod({ from: "2026-01-01" })).toMatchObject({
      preset: "custom",
      from: "2026-01-01",
    });
  });

  it("refuse les dates invalides ou inversées sans appliquer de filtre", () => {
    for (const input of [
      { period: "custom", from: "2026-02-30" },
      { period: "custom", from: "pas-une-date" },
      { period: "custom", to: "2026-13-01" },
      { period: "custom", from: "2026-03-10", to: "2026-03-09" },
    ]) {
      const r = resolvePeriod(input);
      expect(r.error).toBeTruthy();
      expect(r.from).toBeUndefined();
      expect(r.to).toBeUndefined();
    }
  });

  it("le jour courant suit le fuseau d'Alger (UTC+1), pas celui du serveur", () => {
    // 23h30 UTC le 30 juin = 00h30 le 1er juillet à Alger.
    const now = new Date("2026-06-30T23:30:00.000Z");
    expect(todayISO(now)).toBe("2026-07-01");
    expect(resolvePeriod({ period: "month" }, todayISO(now))).toMatchObject({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(resolvePeriod({ period: "last-month" }, todayISO(now))).toMatchObject({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });
});
