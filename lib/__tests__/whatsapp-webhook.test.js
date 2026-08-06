import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyWebhookSignature, extractIncomingMessages } from "../whatsapp-webhook";

const APP_SECRET = "test-secret";

function sign(body) {
  return "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex");
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = '{"hello":"world"}';
    expect(verifyWebhookSignature(body, sign(body), APP_SECRET)).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    const body = '{"hello":"world"}';
    const wrongSig = "sha256=" + crypto.createHmac("sha256", "other-secret").update(body, "utf8").digest("hex");
    expect(verifyWebhookSignature(body, wrongSig, APP_SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const body = '{"hello":"world"}';
    const signature = sign(body);
    expect(verifyWebhookSignature('{"hello":"tampered"}', signature, APP_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature('{"a":1}', null, APP_SECRET)).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyWebhookSignature('{"a":1}', "not-a-real-signature", APP_SECRET)).toBe(false);
  });
});

describe("extractIncomingMessages", () => {
  it("extracts a text message", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "wamid.1", from: "59899111222", type: "text", text: { body: "Hola" } },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(extractIncomingMessages(payload)).toEqual([
      { waId: "59899111222", waMessageId: "wamid.1", type: "text", body: "Hola" },
    ]);
  });

  it("marks non-text messages as 'other' with no body", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: "wamid.2", from: "59899111222", type: "image" }],
              },
            },
          ],
        },
      ],
    };
    expect(extractIncomingMessages(payload)).toEqual([
      { waId: "59899111222", waMessageId: "wamid.2", type: "other", body: null },
    ]);
  });

  it("returns an empty array for a status-only webhook call (no messages)", () => {
    const payload = {
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered" }] } }] }],
    };
    expect(extractIncomingMessages(payload)).toEqual([]);
  });

  it("handles multiple messages across entries", () => {
    const payload = {
      entry: [
        { changes: [{ value: { messages: [{ id: "a", from: "1", type: "text", text: { body: "x" } }] } }] },
        { changes: [{ value: { messages: [{ id: "b", from: "2", type: "text", text: { body: "y" } }] } }] },
      ],
    };
    expect(extractIncomingMessages(payload)).toHaveLength(2);
  });

  it("returns an empty array for a malformed/empty payload", () => {
    expect(extractIncomingMessages({})).toEqual([]);
    expect(extractIncomingMessages({ entry: [] })).toEqual([]);
  });
});
