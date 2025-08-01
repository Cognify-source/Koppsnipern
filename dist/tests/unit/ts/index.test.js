"use strict";
// tests/unit/ts/index.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../../../src/ts/index");
describe("orchestrator main", () => {
    it("ska exportera en main-funktion", () => {
        expect(typeof index_1.main).toBe("function");
    });
});
