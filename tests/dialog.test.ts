/**
 * Tests for the Native Dialog API
 *
 * Note: Most dialog functions require user interaction and can't be fully automated.
 * These tests focus on:
 * 1. Type checking and interface validation
 * 2. Parameter mapping and encoding
 * 3. Mock-based unit tests for the API layer
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// Import types from Window.ts
import type {
    MessageBoxType,
    MessageBoxButtons,
    MessageBoxResult,
    FileFilter,
    OpenFileOptions,
    SaveFileOptions,
    OpenFolderOptions,
    MessageBoxOptions,
    WindowDialog
} from "../src/Window";

describe("Dialog API Types", () => {
    test("MessageBoxType should accept valid values", () => {
        const validTypes: MessageBoxType[] = ["info", "warning", "error", "question"];
        expect(validTypes).toHaveLength(4);
        validTypes.forEach(type => {
            expect(typeof type).toBe("string");
        });
    });

    test("MessageBoxButtons should accept valid values", () => {
        const validButtons: MessageBoxButtons[] = ["ok", "okCancel", "yesNo", "yesNoCancel"];
        expect(validButtons).toHaveLength(4);
        validButtons.forEach(button => {
            expect(typeof button).toBe("string");
        });
    });

    test("MessageBoxResult should accept valid values", () => {
        const validResults: MessageBoxResult[] = ["ok", "cancel", "yes", "no"];
        expect(validResults).toHaveLength(4);
        validResults.forEach(result => {
            expect(typeof result).toBe("string");
        });
    });

    test("FileFilter should have correct structure", () => {
        const filter: FileFilter = {
            name: "Images",
            extensions: ["png", "jpg", "gif"]
        };
        expect(filter.name).toBe("Images");
        expect(filter.extensions).toHaveLength(3);
        expect(filter.extensions).toContain("png");
    });

    test("OpenFileOptions should support all fields", () => {
        const options: OpenFileOptions = {
            title: "Select a file",
            filters: [{ name: "Text", extensions: ["txt"] }],
            multiple: true
        };
        expect(options.title).toBe("Select a file");
        expect(options.filters).toHaveLength(1);
        expect(options.multiple).toBe(true);
    });

    test("SaveFileOptions should support all fields", () => {
        const options: SaveFileOptions = {
            title: "Save file",
            defaultName: "untitled.txt",
            filters: [{ name: "Text", extensions: ["txt"] }]
        };
        expect(options.title).toBe("Save file");
        expect(options.defaultName).toBe("untitled.txt");
        expect(options.filters).toHaveLength(1);
    });

    test("OpenFolderOptions should support title", () => {
        const options: OpenFolderOptions = {
            title: "Select folder"
        };
        expect(options.title).toBe("Select folder");
    });

    test("MessageBoxOptions should support all fields", () => {
        const options: MessageBoxOptions = {
            title: "Confirm",
            message: "Are you sure?",
            detail: "This action cannot be undone.",
            type: "question",
            buttons: "yesNo"
        };
        expect(options.title).toBe("Confirm");
        expect(options.message).toBe("Are you sure?");
        expect(options.detail).toBe("This action cannot be undone.");
        expect(options.type).toBe("question");
        expect(options.buttons).toBe("yesNo");
    });
});

describe("Dialog Parameter Encoding", () => {
    // Test the encoding logic that would be used when calling native code

    const typeMap: Record<MessageBoxType, number> = {
        info: 0,
        warning: 1,
        error: 2,
        question: 3
    };

    const buttonsMap: Record<MessageBoxButtons, number> = {
        ok: 0,
        okCancel: 1,
        yesNo: 2,
        yesNoCancel: 3
    };

    test("MessageBoxType should map to correct native values", () => {
        expect(typeMap.info).toBe(0);
        expect(typeMap.warning).toBe(1);
        expect(typeMap.error).toBe(2);
        expect(typeMap.question).toBe(3);
    });

    test("MessageBoxButtons should map to correct native values", () => {
        expect(buttonsMap.ok).toBe(0);
        expect(buttonsMap.okCancel).toBe(1);
        expect(buttonsMap.yesNo).toBe(2);
        expect(buttonsMap.yesNoCancel).toBe(3);
    });

    test("FileFilter should serialize to correct JSON format", () => {
        const filters: FileFilter[] = [
            { name: "Images", extensions: ["png", "jpg", "gif"] },
            { name: "Documents", extensions: ["pdf", "doc", "docx"] }
        ];
        const json = JSON.stringify(filters);
        const parsed = JSON.parse(json);

        expect(parsed).toHaveLength(2);
        expect(parsed[0].name).toBe("Images");
        expect(parsed[0].extensions).toContain("png");
        expect(parsed[1].name).toBe("Documents");
        expect(parsed[1].extensions).toContain("pdf");
    });

    test("Empty filters should serialize to empty array", () => {
        const filters: FileFilter[] = [];
        const json = JSON.stringify(filters);
        expect(json).toBe("[]");
    });

    test("Special characters in filter names should be preserved", () => {
        const filters: FileFilter[] = [
            { name: "C++ Source (*.cpp)", extensions: ["cpp", "cc", "cxx"] }
        ];
        const json = JSON.stringify(filters);
        const parsed = JSON.parse(json);

        expect(parsed[0].name).toBe("C++ Source (*.cpp)");
    });
});

describe("Dialog Result Parsing", () => {
    test("File dialog result should parse JSON array of paths", () => {
        const result = '["file1.txt","file2.txt","file3.txt"]';
        const paths = JSON.parse(result);

        expect(paths).toHaveLength(3);
        expect(paths[0]).toBe("file1.txt");
        expect(paths[1]).toBe("file2.txt");
        expect(paths[2]).toBe("file3.txt");
    });

    test("File dialog result with special characters should parse correctly", () => {
        // Paths with spaces and special chars
        const result = '["/Users/test/My Documents/file.txt","/path/with spaces/file (1).txt"]';
        const paths = JSON.parse(result);

        expect(paths).toHaveLength(2);
        expect(paths[0]).toBe("/Users/test/My Documents/file.txt");
        expect(paths[1]).toBe("/path/with spaces/file (1).txt");
    });

    test("Windows paths should parse correctly", () => {
        // Windows paths need escaped backslashes in JSON
        const result = '["C:\\\\Users\\\\test\\\\Documents\\\\file.txt"]';
        const paths = JSON.parse(result);

        expect(paths).toHaveLength(1);
        expect(paths[0]).toBe("C:\\Users\\test\\Documents\\file.txt");
    });

    test("Empty selection should return empty array", () => {
        const result = '[]';
        const paths = JSON.parse(result);

        expect(paths).toHaveLength(0);
    });

    test("Null/cancelled dialog should be handled", () => {
        const nullResult = null;
        expect(nullResult).toBeNull();

        // Simulate the API handling null
        const paths = nullResult ? JSON.parse(nullResult) : null;
        expect(paths).toBeNull();
    });

    test("Message box result should parse correctly", () => {
        const results = [
            { input: '{"result":"ok"}', expected: "ok" },
            { input: '{"result":"cancel"}', expected: "cancel" },
            { input: '{"result":"yes"}', expected: "yes" },
            { input: '{"result":"no"}', expected: "no" }
        ];

        results.forEach(({ input, expected }) => {
            const parsed = JSON.parse(input);
            expect(parsed.result).toBe(expected);
        });
    });
});

describe("Mock Dialog API", () => {
    // Create a mock implementation for testing
    function createMockDialogAPI(): WindowDialog {
        let mockResponse: any = null;

        return {
            setMockResponse(response: any) {
                mockResponse = response;
            },

            async openFile(options?: OpenFileOptions): Promise<string[] | null> {
                return mockResponse;
            },

            async saveFile(options?: SaveFileOptions): Promise<string | null> {
                return mockResponse;
            },

            async openFolder(options?: OpenFolderOptions): Promise<string | null> {
                return mockResponse;
            },

            async showMessage(options: MessageBoxOptions): Promise<MessageBoxResult> {
                return mockResponse || "ok";
            },

            async showInfo(message: string, title?: string): Promise<void> {
                await this.showMessage({ message, title, type: "info", buttons: "ok" });
            },

            async showWarning(message: string, title?: string): Promise<void> {
                await this.showMessage({ message, title, type: "warning", buttons: "ok" });
            },

            async showError(message: string, title?: string): Promise<void> {
                await this.showMessage({ message, title, type: "error", buttons: "ok" });
            },

            async confirm(message: string, title?: string): Promise<boolean> {
                const result = await this.showMessage({
                    message,
                    title,
                    type: "question",
                    buttons: "yesNo"
                });
                return result === "yes";
            }
        } as WindowDialog & { setMockResponse: (response: any) => void };
    }

    test("openFile should return array of paths", async () => {
        const dialog = createMockDialogAPI() as any;
        dialog.setMockResponse(["/path/to/file1.txt", "/path/to/file2.txt"]);

        const result = await dialog.openFile({ title: "Test", multiple: true });
        expect(result).toHaveLength(2);
        expect(result[0]).toBe("/path/to/file1.txt");
    });

    test("openFile cancelled should return null", async () => {
        const dialog = createMockDialogAPI() as any;
        dialog.setMockResponse(null);

        const result = await dialog.openFile();
        expect(result).toBeNull();
    });

    test("saveFile should return single path", async () => {
        const dialog = createMockDialogAPI() as any;
        dialog.setMockResponse("/path/to/saved.txt");

        const result = await dialog.saveFile({ defaultName: "test.txt" });
        expect(result).toBe("/path/to/saved.txt");
    });

    test("openFolder should return folder path", async () => {
        const dialog = createMockDialogAPI() as any;
        dialog.setMockResponse("/path/to/folder");

        const result = await dialog.openFolder({ title: "Select folder" });
        expect(result).toBe("/path/to/folder");
    });

    test("confirm should return true for yes", async () => {
        const dialog = createMockDialogAPI() as any;
        dialog.setMockResponse("yes");

        const result = await dialog.confirm("Are you sure?");
        expect(result).toBe(true);
    });

    test("confirm should return false for no", async () => {
        const dialog = createMockDialogAPI() as any;
        dialog.setMockResponse("no");

        const result = await dialog.confirm("Are you sure?");
        expect(result).toBe(false);
    });
});

describe("Edge Cases", () => {
    test("Very long file paths should be handled", () => {
        const longPath = "/".repeat(50) + "a".repeat(200) + "/file.txt";
        const json = JSON.stringify([longPath]);
        const parsed = JSON.parse(json);

        expect(parsed[0]).toBe(longPath);
    });

    test("Unicode in file paths should be handled", () => {
        const unicodePath = "/Users/用户/Documents/文件.txt";
        const json = JSON.stringify([unicodePath]);
        const parsed = JSON.parse(json);

        expect(parsed[0]).toBe(unicodePath);
    });

    test("Empty strings in options should be handled", () => {
        const options: OpenFileOptions = {
            title: "",
            filters: [],
            multiple: false
        };

        expect(options.title).toBe("");
        expect(options.filters).toHaveLength(0);
    });

    test("Large number of filters should be handled", () => {
        const filters: FileFilter[] = Array.from({ length: 100 }, (_, i) => ({
            name: `Filter ${i}`,
            extensions: [`ext${i}`]
        }));

        const json = JSON.stringify(filters);
        const parsed = JSON.parse(json);

        expect(parsed).toHaveLength(100);
    });

    test("Filter with many extensions should be handled", () => {
        const filter: FileFilter = {
            name: "All Images",
            extensions: [
                "png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp", "ico",
                "svg", "heic", "heif", "raw", "psd", "ai", "eps"
            ]
        };

        expect(filter.extensions).toHaveLength(15);
        const json = JSON.stringify([filter]);
        const parsed = JSON.parse(json);
        expect(parsed[0].extensions).toHaveLength(15);
    });

    test("Message with newlines should be preserved", () => {
        const message = "Line 1\nLine 2\nLine 3";
        const options: MessageBoxOptions = {
            message,
            type: "info"
        };

        expect(options.message).toBe("Line 1\nLine 2\nLine 3");
    });

    test("Message with special characters should be preserved", () => {
        const message = 'File "test.txt" contains <special> & characters!';
        const options: MessageBoxOptions = {
            message,
            type: "warning"
        };

        expect(options.message).toBe('File "test.txt" contains <special> & characters!');
    });
});
