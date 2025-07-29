// tests/unit/ts/index.test.ts

import { startBot } from "../../../src/ts/index";

describe("startBot", () => {
  it("ska logga uppstart och returnera true", () => {
    // Spy på console.log
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    
    const result = startBot();
    
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith("🤖 Bot uppstartad!");
    
    spy.mockRestore();
  });
});
