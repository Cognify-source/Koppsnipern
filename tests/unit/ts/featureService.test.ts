// tests/unit/ts/featureService.test.ts

import { FeatureService } from "../../../src/ts/services/featureService";
import { spawnSync } from "child_process";

jest.mock("child_process", () => ({
  spawnSync: jest.fn(),
}));

describe("FeatureService", () => {
  const dummyEvent = { foo: "bar" };
  const fakeScript = "/fake/path/extract.py";

  beforeEach(() => {
    (spawnSync as jest.Mock).mockReset();
  });

  it("ska returnera parsed JSON när script exit 0", () => {
    const fakeFeatures = { a: 1, b: 2 };
    (spawnSync as jest.Mock).mockReturnValue({
      error: null,
      status: 0,
      stdout: JSON.stringify(fakeFeatures),
      stderr: ""
    });

    const svc = new FeatureService({
      pythonPath: "py3",
      scriptPath: fakeScript
    });
    const out = svc.extract(dummyEvent);

    expect(spawnSync).toHaveBeenCalledWith(
      "py3",
      [fakeScript],
      expect.objectContaining({
        input: JSON.stringify(dummyEvent),
        encoding: "utf-8"
      })
    );
    expect(out).toEqual(fakeFeatures);
  });

  it("ska kasta vid script-error", () => {
    const err = new Error("bang");
    (spawnSync as jest.Mock).mockReturnValue({ error: err } as any);

    const svc = new FeatureService({ scriptPath: fakeScript });
    expect(() => svc.extract(dummyEvent)).toThrow(err);
  });

  it("ska kasta vid non-zero exit", () => {
    (spawnSync as jest.Mock).mockReturnValue({
      error: null,
      status: 1,
      stdout: "",
      stderr: "fail"
    });
    const svc = new FeatureService({ scriptPath: fakeScript });
    expect(() => svc.extract(dummyEvent))
      .toThrow(/FeatureService failed: fail/);
  });

  it("ska kasta vid invalid JSON", () => {
    (spawnSync as jest.Mock).mockReturnValue({
      error: null,
      status: 0,
      stdout: "notjson",
      stderr: ""
    });
    const svc = new FeatureService({ scriptPath: fakeScript });
    expect(() => svc.extract(dummyEvent))
      .toThrow(/Invalid JSON from feature script/);
  });
});
