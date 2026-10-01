import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { REDACT_PATHS } from "@/server/logger";

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const log = pino({ redact: { paths: REDACT_PATHS, censor: "[MASQUÉ]" } }, stream);
  return { log, lines };
}

describe("masquage des secrets dans les logs", () => {
  it("masque mots de passe, jetons, clés API et cookies", () => {
    const { log, lines } = captureLogger();
    log.info(
      {
        password: "motdepasse",
        user: { passwordHash: "hash", token: "tok" },
        apiKey: "sk-123",
        headers: { authorization: "Bearer abc", cookie: "session=xyz" },
        OPENAI_API_KEY: "sk-openai",
        invoiceId: "inv_1",
      },
      "test",
    );
    const out = lines.join("");
    for (const secret of [
      "motdepasse",
      "hash",
      'tok"',
      "sk-123",
      "Bearer abc",
      "session=xyz",
      "sk-openai",
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("inv_1");
    expect(out).toContain("[MASQUÉ]");
  });
});
