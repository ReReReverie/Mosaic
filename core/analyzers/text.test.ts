import { describe, it, expect } from "vitest";
import { textAnalyzer } from "./text";
import type { ReferenceFile } from "../types";

function makeFile(
  mimeType = "text/plain",
  filename = "notes.txt"
): ReferenceFile {
  return {
    id: "test-txt",
    path: `/refs/${filename}`,
    filename,
    mimeType,
    sizeBytes: 500,
    lastModified: 0,
  };
}

describe("textAnalyzer", () => {
  it("canAnalyze accepts text/plain", () =>
    expect(textAnalyzer.canAnalyze(makeFile("text/plain"))).toBe(true));
  it("canAnalyze accepts text/markdown", () =>
    expect(textAnalyzer.canAnalyze(makeFile("text/markdown"))).toBe(true));
  it("canAnalyze accepts text/html", () =>
    expect(textAnalyzer.canAnalyze(makeFile("text/html"))).toBe(true));
  it("canAnalyze accepts application/json", () =>
    expect(textAnalyzer.canAnalyze(makeFile("application/json"))).toBe(true));
  it("canAnalyze rejects image/png", () =>
    expect(textAnalyzer.canAnalyze(makeFile("image/png"))).toBe(false));

  it("extracts top keywords from plain text", async () => {
    const text = "Food food food community poster warm editorial design design";
    const result = await textAnalyzer.analyze(
      makeFile("text/plain"),
      Buffer.from(text)
    );
    expect(result.extractedText).toContain("food");
    expect(result.hasText).toBe(true);
  });

  it("removes stop words", async () => {
    const text = "the quick brown fox and the lazy dog";
    const result = await textAnalyzer.analyze(
      makeFile("text/plain"),
      Buffer.from(text)
    );
    expect(result.extractedText).not.toContain("the");
    expect(result.extractedText).not.toContain("and");
  });

  it("strips HTML tags", async () => {
    const html = "<h1>Editorial Design</h1><p>Warm <strong>poster</strong> art.</p>";
    const result = await textAnalyzer.analyze(
      makeFile("text/html"),
      Buffer.from(html)
    );
    expect(result.extractedText).toContain("editorial");
    expect(result.extractedText).toContain("poster");
    // Tag names should not appear as keywords
    expect(result.extractedText).not.toContain("h1");
  });

  it("flattens JSON objects", async () => {
    const json = JSON.stringify({ title: "food poster", mood: "warm editorial" });
    const result = await textAnalyzer.analyze(
      makeFile("application/json"),
      Buffer.from(json)
    );
    expect(result.extractedText).toContain("food");
    expect(result.extractedText).toContain("poster");
    expect(result.extractedText).toContain("warm");
  });

  it("returns max 30 keywords", async () => {
    const text = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const result = await textAnalyzer.analyze(
      makeFile("text/plain"),
      Buffer.from(text)
    );
    expect(result.extractedText!.length).toBeLessThanOrEqual(30);
  });

  it("handles empty content gracefully", async () => {
    const result = await textAnalyzer.analyze(
      makeFile("text/plain"),
      Buffer.from("")
    );
    expect(result.extractedText).toHaveLength(0);
    expect(result.hasText).toBe(false);
  });
});
