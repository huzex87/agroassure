import { uuidv7 } from "@agroassure/domain";

// The runtime gap that only a handset found.
//
// Node supplies globalThis.crypto, so every test on this machine passed while
// the app threw on the first call to uuidv7 — "crypto.getRandomValues must be
// defined" — because Hermes ships no crypto global and Expo installs none.
//
// So the test has to take the global away first. Asserting the polyfill works
// while Node's own crypto is still present would assert nothing at all.

const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");

function withoutCryptoGlobal(run: () => void) {
  // @ts-expect-error deleting a global that the runtime normally guarantees
  delete globalThis.crypto;
  try {
    run();
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
  }
}

describe("the crypto polyfill", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("installs getRandomValues when the runtime has no crypto at all", () => {
    withoutCryptoGlobal(() => {
      expect(globalThis.crypto).toBeUndefined();
      require("../src/crypto-polyfill");
      expect(typeof globalThis.crypto.getRandomValues).toBe("function");
    });
  });

  it("actually fills the array it is handed, and returns it", () => {
    withoutCryptoGlobal(() => {
      require("../src/crypto-polyfill");
      const target = new Uint8Array(32);
      const returned = globalThis.crypto.getRandomValues(target);

      expect(returned).toBe(target);
      // Thirty-two zero bytes from a working source is a 1-in-2^256 event, so
      // this distinguishes a real fill from a no-op that returns the argument.
      expect(target.some((b) => b !== 0)).toBe(true);
    });
  });

  it("lets the identifier minting that failed on device succeed", () => {
    withoutCryptoGlobal(() => {
      require("../src/crypto-polyfill");
      // uuidv7 seeds from @noble/hashes randomBytes, which is what reached for
      // crypto.getRandomValues and threw.
      const id = uuidv7();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(uuidv7()).not.toBe(id);
    });
  });

  it("leaves a runtime that already has getRandomValues alone", () => {
    // A development build, or a future Expo that installs the global itself,
    // must not have its implementation replaced by ours.
    const existing = jest.fn((a: Uint8Array) => a);
    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues: existing },
      configurable: true,
      writable: true,
    });
    try {
      require("../src/crypto-polyfill");
      expect(globalThis.crypto.getRandomValues).toBe(existing);
    } finally {
      if (original) Object.defineProperty(globalThis, "crypto", original);
    }
  });
});
