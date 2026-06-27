import { describe, expect, test } from "vitest";
import { classifyMedia, resolveMime } from "../../src/controllers/media-types";

describe("resolveMime", () => {
	test("prefers explicit mime over extension", () => {
		expect(resolveMime("foo.png", "image/gif")).toBe("image/gif");
	});

	test("falls back to extension map when mime is empty", () => {
		expect(resolveMime("photo.jpg")).toBe("image/jpeg");
		expect(resolveMime("song.mp3")).toBe("audio/mpeg");
		expect(resolveMime("doc.pdf")).toBe("application/pdf");
	});

	test("returns undefined for unknown extension", () => {
		expect(resolveMime("data.xyz")).toBeUndefined();
		expect(resolveMime("archive.zip")).toBeUndefined();
	});

	test("heic is absent from the map (Chrome cannot decode)", () => {
		expect(resolveMime("photo.heic")).toBeUndefined();
	});

	test("svg resolves to image/svg+xml", () => {
		expect(resolveMime("logo.svg")).toBe("image/svg+xml");
	});
});

describe("classifyMedia", () => {
	test("image kinds", () => {
		expect(classifyMedia("a.png")).toBe("image");
		expect(classifyMedia("a.jpg")).toBe("image");
		expect(classifyMedia("a.gif")).toBe("image");
		expect(classifyMedia("a.svg")).toBe("image");
		expect(classifyMedia("a.webp")).toBe("image");
	});

	test("video kinds", () => {
		expect(classifyMedia("a.mp4")).toBe("video");
		expect(classifyMedia("a.webm")).toBe("video");
		expect(classifyMedia("a.mov")).toBe("video");
	});

	test("audio kinds", () => {
		expect(classifyMedia("a.mp3")).toBe("audio");
		expect(classifyMedia("a.wav")).toBe("audio");
		expect(classifyMedia("a.flac")).toBe("audio");
	});

	test("pdf kind", () => {
		expect(classifyMedia("a.pdf")).toBe("pdf");
	});

	test("text kind falls through isTextFile", () => {
		expect(classifyMedia("readme.md")).toBe("text");
		expect(classifyMedia("notes.txt")).toBe("text");
		expect(classifyMedia("app.ts")).toBe("text");
	});

	test("binary fallback for unsupported types", () => {
		expect(classifyMedia("archive.zip")).toBe("binary");
		expect(classifyMedia("photo.heic")).toBe("binary");
		expect(classifyMedia("binary.exe")).toBe("binary");
	});

	test("explicit mime overrides extension-based classification", () => {
		// A .md file claimed as image/png still routes to image.
		expect(classifyMedia("readme.md", "image/png")).toBe("image");
	});

	test("explicit application/pdf via mime", () => {
		expect(classifyMedia("report.bin", "application/pdf")).toBe("pdf");
	});
});
