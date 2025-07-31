// tests/unit/ts/streamListener.test.ts

import { StreamListener } from "../../../src/ts/services/streamListener";
import { Connection } from "@solana/web3.js";

// Mocka Connection så att onSlotChange registrerar callback
const mockOnSlotChange = jest.fn();

jest.mock("@solana/web3.js", () => {
  return {
    Connection: jest.fn().mockImplementation(() => ({
      onSlotChange: mockOnSlotChange
    })),
    // om du använder SlotInfo-typ, exportera den som tom interface
    SlotInfo: class {}
  };
});

describe("StreamListener (WebSocket)", () => {
  it("ska registrera onSlotChange och anropa callback vid nytt slot", async () => {
    const received: number[] = [];
    const listener = new StreamListener("https://example.com", (slot) => {
      received.push(slot);
    });

    await listener.start();

    // Kontrollera att vi prenumererade
    expect(mockOnSlotChange).toHaveBeenCalledTimes(1);

    // Hämta den registrerade callbacken
    const cb = mockOnSlotChange.mock.calls[0][0] as (info: number) => void;

    // Simulera ett inkommande slot
    cb(42);
    cb({ slot: 100 } as any);

    expect(received).toEqual([42, 100]);
  });
});
