// tests/unit/ts/bundleSender.test.ts

import { BundleSender } from "../../../src/ts/services/bundleSender";
import fetch from "node-fetch";

jest.mock("node-fetch", () => jest.fn());

describe("BundleSender", () => {
  const fakeEndpoint = "https://jito.example/sendBundle";
  const fakeToken = "uuid-1234";

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("ska returnera true när status är ok", async () => {
    // Mocka fetch-respons
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      text: async () => "",
    } as any);

    const sender = new BundleSender({ endpoint: fakeEndpoint, authToken: fakeToken });
    const result = await sender.sendBundle({ foo: "bar" });

    expect(fetch).toHaveBeenCalledWith(fakeEndpoint, expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "x-jito-auth": fakeToken,
      }),
      body: JSON.stringify({ foo: "bar" }),
    }));
    expect(result).toBe(true);
  });

  it("ska returnera false när respons.ok är false", async () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: false,
      text: async () => "error details",
    } as any);

    const sender = new BundleSender({ endpoint: fakeEndpoint, authToken: fakeToken });
    const result = await sender.sendBundle({ foo: "bar" });

    expect(result).toBe(false);
  });
});
