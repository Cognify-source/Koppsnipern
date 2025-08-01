"use strict";
// tests/unit/ts/mlService.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const mlService_1 = require("../../../src/ts/services/mlService");
const child_process_1 = require("child_process");
jest.mock("child_process", () => ({
    spawnSync: jest.fn()
}));
describe("MLService", () => {
    const fakeFeatures = { foo: "bar" };
    const fakeScript = "/fake/path/predict.py";
    beforeEach(() => {
        child_process_1.spawnSync.mockReset();
    });
    it("ska returnera score när processen lyckas", () => {
        child_process_1.spawnSync.mockReturnValue({
            error: null,
            status: 0,
            stdout: "0.73\n",
            stderr: ""
        });
        const svc = new mlService_1.MLService({
            pythonPath: "py3",
            scriptPath: fakeScript
        });
        const score = svc.predict(fakeFeatures);
        expect(child_process_1.spawnSync).toHaveBeenCalledWith("py3", [fakeScript], expect.objectContaining({
            input: JSON.stringify(fakeFeatures),
            encoding: "utf-8"
        }));
        expect(score).toBeCloseTo(0.73);
    });
    it("ska kasta om processen returnerar error", () => {
        const err = new Error("oops");
        child_process_1.spawnSync.mockReturnValue({ error: err });
        const svc = new mlService_1.MLService({ scriptPath: fakeScript });
        expect(() => svc.predict(fakeFeatures)).toThrow(err);
    });
    it("ska kasta om status ≠ 0", () => {
        child_process_1.spawnSync.mockReturnValue({
            error: null,
            status: 1,
            stdout: "",
            stderr: "bad input"
        });
        const svc = new mlService_1.MLService({ scriptPath: fakeScript });
        expect(() => svc.predict(fakeFeatures))
            .toThrow(/ML predict failed: bad input/);
    });
    it("ska kasta om output inte är ett tal", () => {
        child_process_1.spawnSync.mockReturnValue({
            error: null,
            status: 0,
            stdout: "notanumber",
            stderr: ""
        });
        const svc = new mlService_1.MLService({ scriptPath: fakeScript });
        expect(() => svc.predict(fakeFeatures))
            .toThrow(/Invalid ML output/);
    });
});
