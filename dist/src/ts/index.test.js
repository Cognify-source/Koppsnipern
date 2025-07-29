"use strict";
// tests/unit/ts/index.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../../../src/ts/index");
describe("startBot", () => {
    it("ska logga uppstart och returnera true", () => {
        // Spy på console.log
        const spy = jest.spyOn(console, "log").mockImplementation(() => { });
        const result = (0, index_1.startBot)();
        expect(result).toBe(true);
        expect(spy).toHaveBeenCalledWith("🤖 Bot uppstartad!");
        spy.mockRestore();
    });
});
