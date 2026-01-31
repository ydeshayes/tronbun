/**
 * Tests for the Auto-Resize functionality for Child Views
 *
 * Tests cover:
 * 1. Type checking and interface validation
 * 2. Resize calculation logic for all modes (none, fill, proportional, anchor)
 * 3. Edge cases and boundary conditions
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// Import types from ChildView
import type {
    AutoResizeMode,
    AutoResizeConfig,
    AnchorConfig,
    ChildViewBounds,
    ChildViewOptions
} from "../src/ChildView";

// ============================================================================
// Type Tests
// ============================================================================

describe("Auto-Resize Types", () => {
    test("AutoResizeMode should accept valid values", () => {
        const validModes: AutoResizeMode[] = ["none", "fill", "proportional", "anchor"];
        expect(validModes).toHaveLength(4);
        validModes.forEach(mode => {
            expect(typeof mode).toBe("string");
        });
    });

    test("AnchorConfig should support all edge options", () => {
        const config: AnchorConfig = {
            left: true,
            right: true,
            top: true,
            bottom: true
        };
        expect(config.left).toBe(true);
        expect(config.right).toBe(true);
        expect(config.top).toBe(true);
        expect(config.bottom).toBe(true);
    });

    test("AnchorConfig should allow partial configuration", () => {
        const config: AnchorConfig = {
            left: true,
            top: true
        };
        expect(config.left).toBe(true);
        expect(config.top).toBe(true);
        expect(config.right).toBeUndefined();
        expect(config.bottom).toBeUndefined();
    });

    test("AutoResizeConfig with fill mode should support margins", () => {
        const config: AutoResizeConfig = {
            mode: "fill",
            margins: {
                top: 50,
                right: 10,
                bottom: 10,
                left: 200
            }
        };
        expect(config.mode).toBe("fill");
        expect(config.margins?.top).toBe(50);
        expect(config.margins?.left).toBe(200);
    });

    test("AutoResizeConfig with anchor mode should support anchors", () => {
        const config: AutoResizeConfig = {
            mode: "anchor",
            anchors: {
                left: true,
                right: true,
                top: true,
                bottom: true
            }
        };
        expect(config.mode).toBe("anchor");
        expect(config.anchors?.left).toBe(true);
        expect(config.anchors?.right).toBe(true);
    });

    test("ChildViewOptions should accept autoResize as string", () => {
        const options: ChildViewOptions = {
            bounds: { x: 0, y: 0, width: 100, height: 100 },
            autoResize: "fill"
        };
        expect(options.autoResize).toBe("fill");
    });

    test("ChildViewOptions should accept autoResize as config object", () => {
        const options: ChildViewOptions = {
            bounds: { x: 0, y: 0, width: 100, height: 100 },
            autoResize: {
                mode: "anchor",
                anchors: { left: true, right: true }
            }
        };
        expect(typeof options.autoResize).toBe("object");
        expect((options.autoResize as AutoResizeConfig).mode).toBe("anchor");
    });
});

// ============================================================================
// Resize Calculation Tests
// ============================================================================

describe("Resize Calculations", () => {
    // Helper to create a mock ChildView-like object for testing calculations
    function createMockChildView(
        initialBounds: ChildViewBounds,
        config: AutoResizeConfig | null,
        initialWindowSize: { width: number; height: number }
    ) {
        return {
            bounds: { ...initialBounds },
            initialBounds: { ...initialBounds },
            autoResizeConfig: config,
            initialWindowSize,

            calculateResizedBounds(newWindowWidth: number, newWindowHeight: number): ChildViewBounds | null {
                if (!this.autoResizeConfig || this.autoResizeConfig.mode === "none") {
                    return null;
                }

                const config = this.autoResizeConfig;

                switch (config.mode) {
                    case "fill": {
                        const margins = config.margins || {};
                        const top = margins.top ?? 0;
                        const right = margins.right ?? 0;
                        const bottom = margins.bottom ?? 0;
                        const left = margins.left ?? 0;

                        return {
                            x: left,
                            y: top,
                            width: Math.max(0, newWindowWidth - left - right),
                            height: Math.max(0, newWindowHeight - top - bottom)
                        };
                    }

                    case "proportional": {
                        if (!this.initialWindowSize) {
                            return null;
                        }

                        const scaleX = newWindowWidth / this.initialWindowSize.width;
                        const scaleY = newWindowHeight / this.initialWindowSize.height;

                        return {
                            x: Math.round(this.initialBounds.x * scaleX),
                            y: Math.round(this.initialBounds.y * scaleY),
                            width: Math.round(this.initialBounds.width * scaleX),
                            height: Math.round(this.initialBounds.height * scaleY)
                        };
                    }

                    case "anchor": {
                        if (!this.initialWindowSize || !config.anchors) {
                            return null;
                        }

                        const anchors = config.anchors;
                        const initial = this.initialBounds;
                        const oldWidth = this.initialWindowSize.width;
                        const oldHeight = this.initialWindowSize.height;

                        let x = initial.x;
                        let y = initial.y;
                        let width = initial.width;
                        let height = initial.height;

                        // Horizontal
                        if (anchors.left && anchors.right) {
                            const rightMargin = oldWidth - initial.x - initial.width;
                            width = newWindowWidth - initial.x - rightMargin;
                        } else if (anchors.right) {
                            const rightMargin = oldWidth - initial.x - initial.width;
                            x = newWindowWidth - width - rightMargin;
                        }

                        // Vertical
                        if (anchors.top && anchors.bottom) {
                            const bottomMargin = oldHeight - initial.y - initial.height;
                            height = newWindowHeight - initial.y - bottomMargin;
                        } else if (anchors.bottom) {
                            const bottomMargin = oldHeight - initial.y - initial.height;
                            y = newWindowHeight - height - bottomMargin;
                        }

                        return {
                            x: Math.max(0, x),
                            y: Math.max(0, y),
                            width: Math.max(0, width),
                            height: Math.max(0, height)
                        };
                    }

                    default:
                        return null;
                }
            }
        };
    }

    describe("Mode: none", () => {
        test("should return null when mode is none", () => {
            const view = createMockChildView(
                { x: 100, y: 100, width: 400, height: 300 },
                { mode: "none" },
                { width: 1000, height: 700 }
            );
            const result = view.calculateResizedBounds(1200, 800);
            expect(result).toBeNull();
        });

        test("should return null when config is null", () => {
            const view = createMockChildView(
                { x: 100, y: 100, width: 400, height: 300 },
                null,
                { width: 1000, height: 700 }
            );
            const result = view.calculateResizedBounds(1200, 800);
            expect(result).toBeNull();
        });
    });

    describe("Mode: fill", () => {
        test("should fill entire window with no margins", () => {
            const view = createMockChildView(
                { x: 100, y: 100, width: 400, height: 300 },
                { mode: "fill" },
                { width: 1000, height: 700 }
            );
            const result = view.calculateResizedBounds(1200, 800);
            expect(result).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
        });

        test("should respect top margin", () => {
            const view = createMockChildView(
                { x: 0, y: 0, width: 400, height: 300 },
                { mode: "fill", margins: { top: 50 } },
                { width: 1000, height: 700 }
            );
            const result = view.calculateResizedBounds(1200, 800);
            expect(result).toEqual({ x: 0, y: 50, width: 1200, height: 750 });
        });

        test("should respect left margin (sidebar layout)", () => {
            const view = createMockChildView(
                { x: 200, y: 0, width: 800, height: 700 },
                { mode: "fill", margins: { left: 200 } },
                { width: 1000, height: 700 }
            );
            const result = view.calculateResizedBounds(1200, 800);
            expect(result).toEqual({ x: 200, y: 0, width: 1000, height: 800 });
        });

        test("should respect all margins", () => {
            const view = createMockChildView(
                { x: 0, y: 0, width: 400, height: 300 },
                { mode: "fill", margins: { top: 50, right: 20, bottom: 30, left: 200 } },
                { width: 1000, height: 700 }
            );
            const result = view.calculateResizedBounds(1200, 800);
            expect(result).toEqual({ x: 200, y: 50, width: 980, height: 720 });
        });

        test("should handle zero-size window gracefully", () => {
            const view = createMockChildView(
                { x: 0, y: 0, width: 400, height: 300 },
                { mode: "fill", margins: { left: 200, top: 100 } },
                { width: 1000, height: 700 }
            );
            const result = view.calculateResizedBounds(100, 50);
            expect(result).toEqual({ x: 200, y: 100, width: 0, height: 0 });
        });
    });

    describe("Mode: proportional", () => {
        test("should scale proportionally when window grows", () => {
            const view = createMockChildView(
                { x: 100, y: 100, width: 400, height: 300 },
                { mode: "proportional" },
                { width: 1000, height: 700 }
            );
            // Window grows by 20% in width and ~14% in height
            const result = view.calculateResizedBounds(1200, 800);
            expect(result).toEqual({
                x: 120,  // 100 * 1.2
                y: 114,  // 100 * 1.14...
                width: 480,  // 400 * 1.2
                height: 343  // 300 * 1.14... rounded
            });
        });

        test("should scale proportionally when window shrinks", () => {
            const view = createMockChildView(
                { x: 100, y: 100, width: 400, height: 300 },
                { mode: "proportional" },
                { width: 1000, height: 700 }
            );
            // Window shrinks by 50%
            const result = view.calculateResizedBounds(500, 350);
            expect(result).toEqual({
                x: 50,   // 100 * 0.5
                y: 50,   // 100 * 0.5
                width: 200,  // 400 * 0.5
                height: 150  // 300 * 0.5
            });
        });

        test("should handle non-uniform scaling", () => {
            const view = createMockChildView(
                { x: 200, y: 100, width: 600, height: 500 },
                { mode: "proportional" },
                { width: 1000, height: 1000 }
            );
            // Width doubles, height stays same
            const result = view.calculateResizedBounds(2000, 1000);
            expect(result).toEqual({
                x: 400,
                y: 100,
                width: 1200,
                height: 500
            });
        });
    });

    describe("Mode: anchor", () => {
        test("should stretch horizontally when left and right anchored", () => {
            const view = createMockChildView(
                { x: 200, y: 100, width: 600, height: 400 },
                { mode: "anchor", anchors: { left: true, right: true } },
                { width: 1000, height: 700 }
            );
            // Initial: x=200, width=600, rightMargin=200
            // New: width=1200, so new width = 1200 - 200 - 200 = 800
            const result = view.calculateResizedBounds(1200, 700);
            expect(result?.x).toBe(200);
            expect(result?.width).toBe(800);
            expect(result?.height).toBe(400); // Unchanged
        });

        test("should stretch vertically when top and bottom anchored", () => {
            const view = createMockChildView(
                { x: 100, y: 50, width: 400, height: 600 },
                { mode: "anchor", anchors: { top: true, bottom: true } },
                { width: 1000, height: 700 }
            );
            // Initial: y=50, height=600, bottomMargin=50
            // New: height=900, so new height = 900 - 50 - 50 = 800
            const result = view.calculateResizedBounds(1000, 900);
            expect(result?.y).toBe(50);
            expect(result?.height).toBe(800);
            expect(result?.width).toBe(400); // Unchanged
        });

        test("should stretch in both directions when all edges anchored", () => {
            const view = createMockChildView(
                { x: 200, y: 120, width: 800, height: 580 },
                { mode: "anchor", anchors: { left: true, right: true, top: true, bottom: true } },
                { width: 1000, height: 700 }
            );
            // rightMargin = 1000 - 200 - 800 = 0
            // bottomMargin = 700 - 120 - 580 = 0
            const result = view.calculateResizedBounds(1200, 900);
            expect(result).toEqual({
                x: 200,
                y: 120,
                width: 1000,  // 1200 - 200 - 0
                height: 780   // 900 - 120 - 0
            });
        });

        test("should move view when only right anchored", () => {
            const view = createMockChildView(
                { x: 800, y: 100, width: 150, height: 100 },
                { mode: "anchor", anchors: { right: true } },
                { width: 1000, height: 700 }
            );
            // Initial: x=800, width=150, rightMargin=50
            // New: x = 1200 - 150 - 50 = 1000
            const result = view.calculateResizedBounds(1200, 700);
            expect(result?.x).toBe(1000);
            expect(result?.width).toBe(150); // Unchanged
        });

        test("should move view when only bottom anchored", () => {
            const view = createMockChildView(
                { x: 100, y: 550, width: 200, height: 100 },
                { mode: "anchor", anchors: { bottom: true } },
                { width: 1000, height: 700 }
            );
            // Initial: y=550, height=100, bottomMargin=50
            // New: y = 900 - 100 - 50 = 750
            const result = view.calculateResizedBounds(1000, 900);
            expect(result?.y).toBe(750);
            expect(result?.height).toBe(100); // Unchanged
        });

        test("should keep position when only left anchored", () => {
            const view = createMockChildView(
                { x: 50, y: 100, width: 200, height: 100 },
                { mode: "anchor", anchors: { left: true } },
                { width: 1000, height: 700 }
            );
            const result = view.calculateResizedBounds(1200, 900);
            expect(result?.x).toBe(50); // Unchanged
            expect(result?.width).toBe(200); // Unchanged
        });

        test("should keep position when only top anchored", () => {
            const view = createMockChildView(
                { x: 100, y: 50, width: 200, height: 100 },
                { mode: "anchor", anchors: { top: true } },
                { width: 1000, height: 700 }
            );
            const result = view.calculateResizedBounds(1200, 900);
            expect(result?.y).toBe(50); // Unchanged
            expect(result?.height).toBe(100); // Unchanged
        });

        test("sidebar layout: left, top, bottom anchored", () => {
            const view = createMockChildView(
                { x: 0, y: 120, width: 200, height: 580 },
                { mode: "anchor", anchors: { left: true, top: true, bottom: true } },
                { width: 1000, height: 700 }
            );
            // bottomMargin = 700 - 120 - 580 = 0
            const result = view.calculateResizedBounds(1200, 900);
            expect(result).toEqual({
                x: 0,
                y: 120,
                width: 200,  // Unchanged (not right anchored)
                height: 780  // 900 - 120 - 0
            });
        });

        test("should not produce negative values", () => {
            const view = createMockChildView(
                { x: 200, y: 100, width: 600, height: 500 },
                { mode: "anchor", anchors: { left: true, right: true, top: true, bottom: true } },
                { width: 1000, height: 700 }
            );
            // Shrink to very small window
            const result = view.calculateResizedBounds(100, 50);
            expect(result?.x).toBeGreaterThanOrEqual(0);
            expect(result?.y).toBeGreaterThanOrEqual(0);
            expect(result?.width).toBeGreaterThanOrEqual(0);
            expect(result?.height).toBeGreaterThanOrEqual(0);
        });
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
    function createMockChildView(
        initialBounds: ChildViewBounds,
        config: AutoResizeConfig | null,
        initialWindowSize: { width: number; height: number }
    ) {
        return {
            bounds: { ...initialBounds },
            initialBounds: { ...initialBounds },
            autoResizeConfig: config,
            initialWindowSize,

            calculateResizedBounds(newWindowWidth: number, newWindowHeight: number): ChildViewBounds | null {
                if (!this.autoResizeConfig || this.autoResizeConfig.mode === "none") {
                    return null;
                }

                const config = this.autoResizeConfig;

                switch (config.mode) {
                    case "fill": {
                        const margins = config.margins || {};
                        const top = margins.top ?? 0;
                        const right = margins.right ?? 0;
                        const bottom = margins.bottom ?? 0;
                        const left = margins.left ?? 0;

                        return {
                            x: left,
                            y: top,
                            width: Math.max(0, newWindowWidth - left - right),
                            height: Math.max(0, newWindowHeight - top - bottom)
                        };
                    }

                    case "proportional": {
                        if (!this.initialWindowSize) {
                            return null;
                        }

                        const scaleX = newWindowWidth / this.initialWindowSize.width;
                        const scaleY = newWindowHeight / this.initialWindowSize.height;

                        return {
                            x: Math.round(this.initialBounds.x * scaleX),
                            y: Math.round(this.initialBounds.y * scaleY),
                            width: Math.round(this.initialBounds.width * scaleX),
                            height: Math.round(this.initialBounds.height * scaleY)
                        };
                    }

                    case "anchor": {
                        if (!this.initialWindowSize || !config.anchors) {
                            return null;
                        }

                        const anchors = config.anchors;
                        const initial = this.initialBounds;
                        const oldWidth = this.initialWindowSize.width;
                        const oldHeight = this.initialWindowSize.height;

                        let x = initial.x;
                        let y = initial.y;
                        let width = initial.width;
                        let height = initial.height;

                        if (anchors.left && anchors.right) {
                            const rightMargin = oldWidth - initial.x - initial.width;
                            width = newWindowWidth - initial.x - rightMargin;
                        } else if (anchors.right) {
                            const rightMargin = oldWidth - initial.x - initial.width;
                            x = newWindowWidth - width - rightMargin;
                        }

                        if (anchors.top && anchors.bottom) {
                            const bottomMargin = oldHeight - initial.y - initial.height;
                            height = newWindowHeight - initial.y - bottomMargin;
                        } else if (anchors.bottom) {
                            const bottomMargin = oldHeight - initial.y - initial.height;
                            y = newWindowHeight - height - bottomMargin;
                        }

                        return {
                            x: Math.max(0, x),
                            y: Math.max(0, y),
                            width: Math.max(0, width),
                            height: Math.max(0, height)
                        };
                    }

                    default:
                        return null;
                }
            }
        };
    }

    test("should handle same size window (no change)", () => {
        const view = createMockChildView(
            { x: 100, y: 100, width: 400, height: 300 },
            { mode: "fill" },
            { width: 1000, height: 700 }
        );
        const result = view.calculateResizedBounds(1000, 700);
        expect(result).toEqual({ x: 0, y: 0, width: 1000, height: 700 });
    });

    test("should handle very large window", () => {
        const view = createMockChildView(
            { x: 100, y: 100, width: 400, height: 300 },
            { mode: "fill" },
            { width: 1000, height: 700 }
        );
        const result = view.calculateResizedBounds(10000, 10000);
        expect(result).toEqual({ x: 0, y: 0, width: 10000, height: 10000 });
    });

    test("should handle very small window", () => {
        const view = createMockChildView(
            { x: 100, y: 100, width: 400, height: 300 },
            { mode: "fill" },
            { width: 1000, height: 700 }
        );
        const result = view.calculateResizedBounds(10, 10);
        expect(result).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    });

    test("anchor mode should return null without anchors config", () => {
        const view = createMockChildView(
            { x: 100, y: 100, width: 400, height: 300 },
            { mode: "anchor" },  // No anchors specified
            { width: 1000, height: 700 }
        );
        const result = view.calculateResizedBounds(1200, 800);
        expect(result).toBeNull();
    });

    test("proportional mode should handle zero initial size gracefully", () => {
        const view = createMockChildView(
            { x: 0, y: 0, width: 0, height: 0 },
            { mode: "proportional" },
            { width: 1000, height: 700 }
        );
        const result = view.calculateResizedBounds(1200, 800);
        expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    test("fill mode with margins larger than window should clamp to zero", () => {
        const view = createMockChildView(
            { x: 0, y: 0, width: 400, height: 300 },
            { mode: "fill", margins: { left: 500, top: 400 } },
            { width: 1000, height: 700 }
        );
        const result = view.calculateResizedBounds(400, 300);
        expect(result).toEqual({ x: 500, y: 400, width: 0, height: 0 });
    });
});

// ============================================================================
// Integration-style Tests (Testing actual ChildView if possible)
// ============================================================================

describe("ChildView Integration", () => {
    test("ChildViewOptions should properly type autoResize shorthand", () => {
        // Test that TypeScript accepts the shorthand string form
        const options1: ChildViewOptions = {
            bounds: { x: 0, y: 0, width: 800, height: 600 },
            autoResize: "fill"
        };
        expect(options1.autoResize).toBe("fill");

        const options2: ChildViewOptions = {
            bounds: { x: 0, y: 0, width: 800, height: 600 },
            autoResize: "proportional"
        };
        expect(options2.autoResize).toBe("proportional");

        const options3: ChildViewOptions = {
            bounds: { x: 0, y: 0, width: 800, height: 600 },
            autoResize: "anchor"
        };
        expect(options3.autoResize).toBe("anchor");

        const options4: ChildViewOptions = {
            bounds: { x: 0, y: 0, width: 800, height: 600 },
            autoResize: "none"
        };
        expect(options4.autoResize).toBe("none");
    });

    test("ChildViewOptions should properly type autoResize object form", () => {
        const options: ChildViewOptions = {
            bounds: { x: 200, y: 120, width: 800, height: 580 },
            autoResize: {
                mode: "anchor",
                anchors: {
                    left: true,
                    right: true,
                    top: true,
                    bottom: true
                }
            }
        };

        const config = options.autoResize as AutoResizeConfig;
        expect(config.mode).toBe("anchor");
        expect(config.anchors?.left).toBe(true);
        expect(config.anchors?.right).toBe(true);
        expect(config.anchors?.top).toBe(true);
        expect(config.anchors?.bottom).toBe(true);
    });

    test("ChildViewBounds should have all required fields", () => {
        const bounds: ChildViewBounds = {
            x: 100,
            y: 200,
            width: 800,
            height: 600
        };
        expect(bounds.x).toBe(100);
        expect(bounds.y).toBe(200);
        expect(bounds.width).toBe(800);
        expect(bounds.height).toBe(600);
    });
});

// ============================================================================
// Real-world Layout Scenarios
// ============================================================================

describe("Real-world Layout Scenarios", () => {
    function createMockChildView(
        initialBounds: ChildViewBounds,
        config: AutoResizeConfig,
        initialWindowSize: { width: number; height: number }
    ) {
        return {
            bounds: { ...initialBounds },
            initialBounds: { ...initialBounds },
            autoResizeConfig: config,
            initialWindowSize,

            calculateResizedBounds(newWindowWidth: number, newWindowHeight: number): ChildViewBounds | null {
                const cfg = this.autoResizeConfig;

                switch (cfg.mode) {
                    case "fill": {
                        const margins = cfg.margins || {};
                        return {
                            x: margins.left ?? 0,
                            y: margins.top ?? 0,
                            width: Math.max(0, newWindowWidth - (margins.left ?? 0) - (margins.right ?? 0)),
                            height: Math.max(0, newWindowHeight - (margins.top ?? 0) - (margins.bottom ?? 0))
                        };
                    }

                    case "anchor": {
                        if (!cfg.anchors) return null;
                        const anchors = cfg.anchors;
                        const initial = this.initialBounds;
                        const oldWidth = this.initialWindowSize.width;
                        const oldHeight = this.initialWindowSize.height;

                        let x = initial.x, y = initial.y;
                        let width = initial.width, height = initial.height;

                        if (anchors.left && anchors.right) {
                            width = newWindowWidth - initial.x - (oldWidth - initial.x - initial.width);
                        } else if (anchors.right) {
                            x = newWindowWidth - width - (oldWidth - initial.x - initial.width);
                        }

                        if (anchors.top && anchors.bottom) {
                            height = newWindowHeight - initial.y - (oldHeight - initial.y - initial.height);
                        } else if (anchors.bottom) {
                            y = newWindowHeight - height - (oldHeight - initial.y - initial.height);
                        }

                        return { x: Math.max(0, x), y: Math.max(0, y), width: Math.max(0, width), height: Math.max(0, height) };
                    }

                    default:
                        return null;
                }
            }
        };
    }

    test("Sidebar + Content layout", () => {
        // Typical app layout: fixed sidebar on left, content fills rest
        const windowSize = { width: 1000, height: 700 };

        const sidebar = createMockChildView(
            { x: 0, y: 80, width: 200, height: 620 },
            { mode: "anchor", anchors: { left: true, top: true, bottom: true } },
            windowSize
        );

        const content = createMockChildView(
            { x: 200, y: 80, width: 800, height: 620 },
            { mode: "anchor", anchors: { left: true, right: true, top: true, bottom: true } },
            windowSize
        );

        // Resize window to 1200x900
        const newWidth = 1200, newHeight = 900;

        const sidebarResult = sidebar.calculateResizedBounds(newWidth, newHeight);
        const contentResult = content.calculateResizedBounds(newWidth, newHeight);

        // Sidebar: fixed width, stretches vertically
        expect(sidebarResult?.x).toBe(0);
        expect(sidebarResult?.width).toBe(200);
        expect(sidebarResult?.height).toBe(820); // 900 - 80 - 0

        // Content: stretches both ways
        expect(contentResult?.x).toBe(200);
        expect(contentResult?.width).toBe(1000); // 1200 - 200 - 0
        expect(contentResult?.height).toBe(820); // 900 - 80 - 0
    });

    test("Header + Content layout", () => {
        // Fixed header at top, content fills rest
        const windowSize = { width: 1000, height: 700 };

        const header = createMockChildView(
            { x: 0, y: 0, width: 1000, height: 60 },
            { mode: "anchor", anchors: { left: true, right: true, top: true } },
            windowSize
        );

        const content = createMockChildView(
            { x: 0, y: 60, width: 1000, height: 640 },
            { mode: "fill", margins: { top: 60 } },
            windowSize
        );

        const newWidth = 1200, newHeight = 900;

        const headerResult = header.calculateResizedBounds(newWidth, newHeight);
        const contentResult = content.calculateResizedBounds(newWidth, newHeight);

        // Header: stretches horizontally, fixed height
        expect(headerResult?.width).toBe(1200);
        expect(headerResult?.height).toBe(60);

        // Content: fills remaining space
        expect(contentResult?.y).toBe(60);
        expect(contentResult?.width).toBe(1200);
        expect(contentResult?.height).toBe(840); // 900 - 60
    });

    test("Three-panel layout (sidebar + main + inspector)", () => {
        const windowSize = { width: 1200, height: 800 };

        const sidebar = createMockChildView(
            { x: 0, y: 0, width: 200, height: 800 },
            { mode: "anchor", anchors: { left: true, top: true, bottom: true } },
            windowSize
        );

        const main = createMockChildView(
            { x: 200, y: 0, width: 700, height: 800 },
            { mode: "anchor", anchors: { left: true, right: true, top: true, bottom: true } },
            windowSize
        );

        const inspector = createMockChildView(
            { x: 900, y: 0, width: 300, height: 800 },
            { mode: "anchor", anchors: { right: true, top: true, bottom: true } },
            windowSize
        );

        // Resize to 1400x1000
        const newWidth = 1400, newHeight = 1000;

        const sidebarResult = sidebar.calculateResizedBounds(newWidth, newHeight);
        const mainResult = main.calculateResizedBounds(newWidth, newHeight);
        const inspectorResult = inspector.calculateResizedBounds(newWidth, newHeight);

        // Sidebar: fixed width 200, full height
        expect(sidebarResult?.width).toBe(200);
        expect(sidebarResult?.height).toBe(1000);

        // Main: expands to fill middle (gains the extra 200px width)
        expect(mainResult?.x).toBe(200);
        expect(mainResult?.width).toBe(900); // 700 + 200 extra width
        expect(mainResult?.height).toBe(1000);

        // Inspector: stays right-aligned, fixed width
        expect(inspectorResult?.x).toBe(1100); // 1400 - 300
        expect(inspectorResult?.width).toBe(300);
        expect(inspectorResult?.height).toBe(1000);
    });
});
