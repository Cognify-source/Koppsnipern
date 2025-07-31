// tests/unit/ts/mlService.test.ts

import { MLService } from "../../../src/ts/services/mlService";
import { spawnSync } from "child_process";

jest.mock("child_process", () => ({
  spawnSync: jest.fn()
}));

describe("MLService", () => {
  const fakeFeatures = { foo: "bar" };
  const fakeScript = "/fake/path/predict.py";

  beforeEach(() => {
    (spawnSync as jest.Mock).mockReset();
  });

  it("ska returnera score när processen lyckas", () => {
    (spawnSync as jest.Mock).mockReturnValue({
      error: null,
      status: 0,
      stdout: "0.73\n",
      stderr: ""
    });

    const svc = new MLService({
      pythonPath: "py3",
      scriptPath: fakeScript
    });
    const score = svc.predict(fakeFeatures);

    expect(spawnSync).toHaveBeenCalledWith(
      "py3",
      [fakeScript],
      expect.objectContaining({
        input: JSON.stringify(fakeFeatures),
        encoding: "utf-8"
      })
    );
    expect(score).toBeCloseTo(0.73);
  });

  it("ska kasta om processen returnerar error", () => {
    const err = new Error("oops");
    (spawnSync as jest.Mock).mockReturnValue({ error: err });
    const svc = new MLService({ scriptPath: fakeScript });

    expect(() => svc.predict(fakeFeatures)).toThrow(err);
  });

  it("ska kasta om status ≠ 0", () => {
    (spawnSync as jest.Mock).mockReturnValue({
      error: null,
      status: 1,
      stdout: "",
      stderr: "bad input"
    });
    const svc = new MLService({ scriptPath: fakeScript });
    expect(() => svc.predict(fakeFeatures))
      .toThrow(/ML predict failed: bad input/);
  });

  it("ska kasta om output inte är ett tal", () => {
    (spawnSync as jest.Mock).mockReturnValue({
      error: null,
      status: 0,
      stdout: "notanumber",
      stderr: ""
    });
    const svc = new MLService({ scriptPath: fakeScript });
    expect(() => svc.predict(fakeFeatures))
      .toThrow(/Invalid ML output/);
  });
});
