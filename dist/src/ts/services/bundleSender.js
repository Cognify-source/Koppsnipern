"use strict";
// src/ts/services/bundleSender.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BundleSender = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
/**
 * Enkel klass för att skicka bundle till Jito Block Engine via HTTP POST.
 */
class BundleSender {
    constructor(opts) {
        this.endpoint = opts.endpoint;
        this.authToken = opts.authToken;
    }
    /**
     * Skickar ett JSON-serialiserat bundle-objekt.
     * @param bundle – det data du vill skicka (signaturer + transaktioner)
     */
    async sendBundle(bundle) {
        const res = await (0, node_fetch_1.default)(this.endpoint, {
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
exports.BundleSender = BundleSender;
