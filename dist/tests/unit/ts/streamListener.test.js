"use strict";
// tests/unit/ts/streamListener.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const streamListener_1 = require("../../../src/ts/services/streamListener");
// Mocka Connection så att onSlotChange registrerar callback
const mockOnSlotChange = jest.fn();
jest.mock("@solana/web3.js", () => {
    return {
        Connection: jest.fn().mockImplementation(() => ({
            onSlotChange: mockOnSlotChange
        })),
        // om du använder SlotInfo-typ, exportera den som tom interface
        SlotInfo: class {
        }
    };
});
describe("StreamListener (WebSocket)", () => {
    it("ska registrera onSlotChange och anropa callback vid nytt slot", async () => {
        const received = [];
        const listener = new streamListener_1.StreamListener("https://example.com", (slot) => {
            received.push(slot);
        });
        await listener.start();
        // Kontrollera att vi prenumererade
        expect(mockOnSlotChange).toHaveBeenCalledTimes(1);
        // Hämta den registrerade callbacken
        const cb = mockOnSlotChange.mock.calls[0][0];
        // Simulera ett inkommande slot
        cb(42);
        cb({ slot: 100 });
        expect(received).toEqual([42, 100]);
    });
});
