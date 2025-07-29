// src/ts/services/bundleSender.ts

import fetch from "node-fetch";

export interface BundleSenderOptions {
  endpoint: string;
  authToken: string;
}

/**
 * Enkel klass för att skicka bundle till Jito Block Engine via HTTP POST.
 */
export class BundleSender {
  private endpoint: string;
  private authToken: string;

  constructor(opts: BundleSenderOptions) {
    this.endpoint = opts.endpoint;
    this.authToken = opts.authToken;
  }

  /**
   * Skickar ett JSON-serialiserat bundle-objekt.
   * @param bundle – det data du vill skicka (signaturer + transaktioner)
   */
  async sendBundle(bundle: any): Promise<boolean> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-jito-auth": this.authToken,
      },
      body: JSON.stringify(bundle),
    });

    if (!res.ok) {
      console.error("BundleSender failed:", await res.text());
      return false;
    }

    return true;
  }
}
