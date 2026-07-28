import { describe, expect, it } from "vitest";
import { replicateOutputToText } from "./replicateProvider";

describe("replicateOutputToText", () => {
  it("normalizes string, nested, array, and typed-array outputs", () => {
    expect(replicateOutputToText("  plain response  ")).toBe("plain response");
    expect(replicateOutputToText({ output: { text: "nested response" } })).toBe("nested response");
    expect(replicateOutputToText([{ content: "first" }, { response: " second" }])).toBe("firstsecond");
    expect(replicateOutputToText(new TextEncoder().encode("encoded response"))).toBe("encoded response");
    const encoded = new TextEncoder().encode("data-view response");
    expect(replicateOutputToText(new DataView(encoded.buffer))).toBe("data-view response");
  });

  it("does not stringify arbitrary provider objects as fake model output", () => {
    expect(replicateOutputToText({ status: "succeeded", id: "prediction-id" })).toBe("");
  });
});
