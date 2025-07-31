// tests/unit/ts/index.test.ts

import { main } from "../../../src/ts/index";

describe("orchestrator main", () => {
  it("ska exportera en main-funktion", () => {
    expect(typeof main).toBe("function");
  });
});
