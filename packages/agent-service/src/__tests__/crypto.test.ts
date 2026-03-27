import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "../crypto.js";

describe("crypto", () => {
  const key = "a".repeat(64);

  it("encrypts and decrypts a token", () => {
    const token = "sk-ant-oauth-test-token-12345";
    const encrypted = encryptToken(token, key);
    expect(encrypted).not.toBe(token);
    expect(encrypted).toContain(":");
    const decrypted = decryptToken(encrypted, key);
    expect(decrypted).toBe(token);
  });

  it("produces different ciphertexts for same plaintext", () => {
    const token = "same-token";
    const e1 = encryptToken(token, key);
    const e2 = encryptToken(token, key);
    expect(e1).not.toBe(e2);
  });

  it("fails to decrypt with wrong key", () => {
    const token = "secret-token";
    const encrypted = encryptToken(token, key);
    const wrongKey = "b".repeat(64);
    expect(() => decryptToken(encrypted, wrongKey)).toThrow();
  });
});
