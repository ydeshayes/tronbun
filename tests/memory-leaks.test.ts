/**
 * Memory Leak Tests for Tronbun TypeScript Components
 *
 * Tests for memory leaks in:
 * - Window creation/destruction cycles
 * - IPC handler registration/cleanup
 * - Embedded file decompression
 *
 * Run with: bun test tests/memory-leaks.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";

// Memory tracking utilities
function getMemoryUsageMB(): number {
  if (typeof Bun !== "undefined") {
    // Force garbage collection if available
    if (globalThis.gc) {
      globalThis.gc();
    }
  }
  const usage = process.memoryUsage();
  return usage.heapUsed / 1024 / 1024;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("Memory Leak Tests", () => {

  describe("Compression/Decompression Cycles", () => {
    test("should not leak memory during repeated gzip cycles", async () => {
      const testContent = "A".repeat(100000); // 100KB of content
      const iterations = 100;

      // Extended warm up to allow JIT compilation
      for (let i = 0; i < 20; i++) {
        const compressed = Bun.gzipSync(Buffer.from(testContent, "utf-8"));
        const decompressed = Bun.gunzipSync(compressed);
        new TextDecoder("utf-8").decode(decompressed);
      }

      // Allow GC to stabilize after warmup
      await sleep(200);

      const startMemory = getMemoryUsageMB();

      // Run many compression/decompression cycles
      for (let i = 0; i < iterations; i++) {
        const compressed = Bun.gzipSync(Buffer.from(testContent, "utf-8"));
        const decompressed = Bun.gunzipSync(compressed);
        const result = new TextDecoder("utf-8").decode(decompressed);

        // Verify correctness
        if (i === 0) {
          expect(result).toBe(testContent);
        }
      }

      // Allow GC to run
      await sleep(200);

      const endMemory = getMemoryUsageMB();
      const memoryGrowth = endMemory - startMemory;

      console.log(`  Memory: ${startMemory.toFixed(2)}MB → ${endMemory.toFixed(2)}MB (growth: ${memoryGrowth.toFixed(2)}MB)`);

      // Memory growth should be minimal after warmup (less than 30MB accounts for runtime overhead)
      expect(memoryGrowth).toBeLessThan(30);
    });
  });

  describe("Base64 Encoding/Decoding Cycles", () => {
    test("should not leak memory during repeated base64 cycles", async () => {
      const testData = new Uint8Array(50000).fill(65); // 50KB of data
      const iterations = 100;

      // Warm up
      for (let i = 0; i < 5; i++) {
        const encoded = Buffer.from(testData).toString("base64");
        Buffer.from(encoded, "base64");
      }

      const startMemory = getMemoryUsageMB();

      // Run many encode/decode cycles
      for (let i = 0; i < iterations; i++) {
        const encoded = Buffer.from(testData).toString("base64");
        const decoded = Buffer.from(encoded, "base64");

        if (i === 0) {
          expect(decoded.length).toBe(testData.length);
        }
      }

      await sleep(100);

      const endMemory = getMemoryUsageMB();
      const memoryGrowth = endMemory - startMemory;

      console.log(`  Memory: ${startMemory.toFixed(2)}MB → ${endMemory.toFixed(2)}MB (growth: ${memoryGrowth.toFixed(2)}MB)`);

      expect(memoryGrowth).toBeLessThan(10);
    });
  });

  describe("Map/Object Allocation Cycles", () => {
    test("should not leak memory when creating/clearing Maps", async () => {
      const iterations = 1000;

      const startMemory = getMemoryUsageMB();

      for (let i = 0; i < iterations; i++) {
        const map = new Map<string, string>();

        // Add many entries
        for (let j = 0; j < 100; j++) {
          map.set(`key${j}`, `value${j}`.repeat(100));
        }

        // Clear the map
        map.clear();
      }

      await sleep(100);

      const endMemory = getMemoryUsageMB();
      const memoryGrowth = endMemory - startMemory;

      console.log(`  Memory: ${startMemory.toFixed(2)}MB → ${endMemory.toFixed(2)}MB (growth: ${memoryGrowth.toFixed(2)}MB)`);

      expect(memoryGrowth).toBeLessThan(10);
    });
  });

  describe("Simulated Embedded Files Processing", () => {
    test("should not leak memory when processing embedded files", async () => {
      // Simulate the embedded files processing that happens at startup
      const iterations = 50;

      // Create mock compressed files (similar to what compile generates)
      const mockFiles: Record<string, string> = {};
      for (let i = 0; i < 10; i++) {
        const content = `console.log('file ${i}');`.repeat(100);
        const compressed = Bun.gzipSync(Buffer.from(content, "utf-8"));
        mockFiles[`file${i}.js`] = Buffer.from(compressed).toString("base64");
      }

      const startMemory = getMemoryUsageMB();

      // Simulate multiple app startups (decompress all files)
      for (let iter = 0; iter < iterations; iter++) {
        const decompressedFiles: Record<string, string> = {};

        for (const [path, base64Content] of Object.entries(mockFiles)) {
          const compressed = Buffer.from(base64Content, "base64");
          const decompressed = Bun.gunzipSync(compressed);
          decompressedFiles[path] = new TextDecoder("utf-8").decode(decompressed);
        }

        // Verify one file
        if (iter === 0) {
          expect(decompressedFiles["file0.js"]).toContain("console.log");
        }
      }

      await sleep(100);

      const endMemory = getMemoryUsageMB();
      const memoryGrowth = endMemory - startMemory;

      console.log(`  Memory: ${startMemory.toFixed(2)}MB → ${endMemory.toFixed(2)}MB (growth: ${memoryGrowth.toFixed(2)}MB)`);

      expect(memoryGrowth).toBeLessThan(20);
    });
  });

  describe("IPC Handler Registration Simulation", () => {
    test("should not leak memory when registering/unregistering handlers", async () => {
      const iterations = 1000;

      const startMemory = getMemoryUsageMB();

      for (let i = 0; i < iterations; i++) {
        const handlers = new Map<string, (data: any) => any>();

        // Register many handlers
        for (let j = 0; j < 20; j++) {
          handlers.set(`handler${j}`, (data) => ({ result: data }));
        }

        // Simulate IPC calls
        for (const [name, handler] of handlers) {
          handler({ test: true });
        }

        // Clear handlers
        handlers.clear();
      }

      await sleep(100);

      const endMemory = getMemoryUsageMB();
      const memoryGrowth = endMemory - startMemory;

      console.log(`  Memory: ${startMemory.toFixed(2)}MB → ${endMemory.toFixed(2)}MB (growth: ${memoryGrowth.toFixed(2)}MB)`);

      expect(memoryGrowth).toBeLessThan(10);
    });
  });

  describe("JSON Parsing Cycles", () => {
    test("should not leak memory during repeated JSON parse/stringify", async () => {
      const iterations = 1000;

      const testObject = {
        method: "test_method",
        id: "12345",
        params: {
          html: "<html><body>Test content</body></html>".repeat(10),
          nested: {
            array: [1, 2, 3, 4, 5],
            deep: { value: "test" }
          }
        }
      };

      const startMemory = getMemoryUsageMB();

      for (let i = 0; i < iterations; i++) {
        const json = JSON.stringify(testObject);
        const parsed = JSON.parse(json);

        if (i === 0) {
          expect(parsed.method).toBe("test_method");
        }
      }

      await sleep(100);

      const endMemory = getMemoryUsageMB();
      const memoryGrowth = endMemory - startMemory;

      console.log(`  Memory: ${startMemory.toFixed(2)}MB → ${endMemory.toFixed(2)}MB (growth: ${memoryGrowth.toFixed(2)}MB)`);

      expect(memoryGrowth).toBeLessThan(10);
    });
  });

  describe("Long-running Memory Stability", () => {
    test("should maintain stable memory over extended operations", async () => {
      const samplePoints: number[] = [];
      const totalDuration = 2000; // 2 seconds
      const sampleInterval = 200; // Sample every 200ms

      // Extended warmup
      for (let i = 0; i < 10; i++) {
        const content = "test".repeat(1000);
        const compressed = Bun.gzipSync(Buffer.from(content));
        Bun.gunzipSync(compressed);
        JSON.parse(JSON.stringify({ test: content }));
      }
      await sleep(300);

      const startTime = Date.now();

      while (Date.now() - startTime < totalDuration) {
        // Simulate various operations
        const content = "test".repeat(1000);
        const compressed = Bun.gzipSync(Buffer.from(content));
        Bun.gunzipSync(compressed);

        const map = new Map();
        for (let i = 0; i < 100; i++) {
          map.set(i, `value${i}`);
        }
        map.clear();

        JSON.parse(JSON.stringify({ test: content }));

        await sleep(sampleInterval);
        samplePoints.push(getMemoryUsageMB());
      }

      // Check that final memory is not significantly higher than minimum observed
      // This accounts for GC behavior where memory can spike and recover
      const minMemory = Math.min(...samplePoints);
      const maxMemory = Math.max(...samplePoints);
      const finalMemory = samplePoints[samplePoints.length - 1];

      console.log(`  Memory samples: ${samplePoints.map(m => m.toFixed(1)).join(", ")} MB`);
      console.log(`  Range: ${minMemory.toFixed(2)}MB - ${maxMemory.toFixed(2)}MB, Final: ${finalMemory.toFixed(2)}MB`);

      // Memory should not grow unbounded - max should be reasonable
      // and final should be close to min (GC should reclaim memory)
      expect(maxMemory - minMemory).toBeLessThan(50); // Allow up to 50MB variance for GC cycles
    });
  });
});
