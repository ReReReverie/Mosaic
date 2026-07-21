import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/", init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, init), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Mosaic workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /MOSAIC/);
  assert.match(html, /Automatic Search|AUTO OFF/);
  assert.match(html, /Style DNA/);
  assert.match(html, /Your eye stays in charge/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("discovery route returns source-aware references", async () => {
  const response = await render("/api/discover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "warm food poster" }) });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.fallback, true);
  assert.ok(Array.isArray(data.references));
  assert.ok(data.references.some((reference) => reference.license));
  assert.ok(data.references.every((reference) => reference.source === "online"));
});