"use strict";
// tests/unit/ts/featureService.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const featureService_1 = require("../../../src/ts/services/featureService");
const child_process_1 = require("child_process");
jest.mock("child_process", () => ({
    spawnSync: jest.fn(),
}));
describe("FeatureService", () => {
    const dummyEvent = { foo: "bar" };
    const fakeScript = "/fake/path/extract.py";
    beforeEach(() => {
        child_process_1.spawnSync.mockReset();
    });
    it("ska returnera parsed JSON när script exit 0", () => {
        const fakeFeatures = { a: 1, b: 2 };
        child_process_1.spawnSync.mockReturnValue({
            error: null,
            status: 0,
            stdout: JSON.stringify(fakeFeatures),
            stderr: ""
        });
        const svc = new featureService_1.FeatureService({
            pythonPath: "py3",
            scriptPath: fakeScript
        });
        const out = svc.extract(dummyEvent);
        expect(child_process_1.spawnSync).toHaveBeenCalledWith("py3", [fakeScript], expect.objectContaining({
            input: JSON.stringify(dummyEvent),
            encoding: "utf-8"
        }));
        expect(out).toEqual(fakeFeatures);
    });
    it("ska kasta vid script-error", () => {
        const err = new Error("bang");
        child_process_1.spawnSync.mockReturnValue({ error: err });
        const svc = new featureService_1.FeatureService({ scriptPath: fakeScript });
        expect(() => svc.extract(dummyEvent)).toThrow(err);
    });
    it("ska kasta vid non-zero exit", () => {
        child_process_1.spawnSync.mockReturnValue({
            error: null,
            status: 1,
            stdout: "",
            stderr: "fail"
        });
        const svc = new featureService_1.FeatureService({ scriptPath: fakeScript });
        expect(() => svc.extract(dummyEvent))
            .toThrow(/FeatureService failed: fail/);
    });
    it("ska kasta vid invalid JSON", () => {
        child_process_1.spawnSync.mockReturnValue({
            error: null,
            status: 0,
            stdout: "notjson",
            stderr: ""
        });
        const svc = new featureService_1.FeatureService({ scriptPath: fakeScript });
        expect(() => svc.extract(dummyEvent))
            .toThrow(/Invalid JSON from feature script/);
    });
});
