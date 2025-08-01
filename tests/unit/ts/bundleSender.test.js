"use strict";
// tests/unit/ts/bundleSender.test.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bundleSender_1 = require("../../../src/ts/services/bundleSender");
const node_fetch_1 = __importDefault(require("node-fetch"));
// Mocka node-fetch som en ES-modul med default-export
jest.mock("node-fetch", () => ({
    __esModule: true,
    default: jest.fn(),
}));
describe("BundleSender", () => {
    const fakeEndpoint = "https://jito.example/sendBundle";
    const fakeToken = "uuid-1234";
    beforeEach(() => {
        jest.resetAllMocks();
    });
    it("ska returnera true när status är ok", async () => {
        // Mocka att fetch-responsen är OK
        node_fetch_1.default.mockResolvedValue({
            ok: true,
            text: async () => "",
        });
        const sender = new bundleSender_1.BundleSender({ endpoint: fakeEndpoint, authToken: fakeToken });
        const result = await sender.sendBundle({ foo: "bar" });
        expect(node_fetch_1.default).toHaveBeenCalledWith(fakeEndpoint, expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
                "x-jito-auth": fakeToken,
            }),
            body: JSON.stringify({ foo: "bar" }),
        }));
        expect(result).toBe(true);
    });
    it("ska returnera false när respons.ok är false", async () => {
        // Mocka en icke-OK respons
        node_fetch_1.default.mockResolvedValue({
            ok: false,
            text: async () => "error details",
        });
        // Stubba console.error så vi inte ser loggar i testet
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => { });
        const sender = new bundleSender_1.BundleSender({ endpoint: fakeEndpoint, authToken: fakeToken });
        const result = await sender.sendBundle({ foo: "bar" });
        expect(result).toBe(false);
        expect(errSpy).toHaveBeenCalledWith("BundleSender failed:", "error details");
        errSpy.mockRestore();
    });
});
