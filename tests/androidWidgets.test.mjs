import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { requestPinWidget } from "../src/androidWidgets.ts";

let scheduledTimeout;
let cleared;
beforeEach(() => {
  cleared = false;
  globalThis.window = {
    setTimeout(callback) { scheduledTimeout = callback; return 1; },
    clearTimeout() { cleared = true; },
  };
});
afterEach(() => { delete globalThis.window; });

test("missing Android bridge returns the manual-add fallback", async () => {
  assert.deepEqual(await requestPinWidget("lanfeng"), { ok: false, supported: false });
});

test("pinning sends the selected kind and waits for the matching native reply", async () => {
  let sent;
  const unrelated = [];
  const originalHandler = (event) => unrelated.push(event.data);
  window.AndroidWidget = {
    postMessage(message) { sent = JSON.parse(message); },
    onmessage: originalHandler,
  };
  const pending = requestPinWidget("duet");
  assert.equal(sent.action, "pin");
  assert.equal(sent.kind, "duet");
  window.AndroidWidget.onmessage({ data: "not JSON" });
  window.AndroidWidget.onmessage({ data: "null" });
  window.AndroidWidget.onmessage({ data: JSON.stringify({ requestId: "old", ok: true }) });
  assert.equal(unrelated.length, 1);
  assert.equal(cleared, false);
  window.AndroidWidget.onmessage({ data: JSON.stringify({ requestId: sent.requestId, ok: true, supported: true }) });
  assert.equal((await pending).ok, true);
  assert.equal(cleared, true);
  assert.equal(window.AndroidWidget.onmessage, originalHandler);
});

test("a launcher without pin support remains an unsuccessful request", async () => {
  window.AndroidWidget = {
    onmessage: null,
    postMessage(message) {
      const { requestId } = JSON.parse(message);
      this.onmessage({ data: JSON.stringify({ requestId, ok: false, supported: false }) });
    },
  };
  const result = await requestPinWidget("xuelang");
  assert.equal(result.ok, false);
  assert.equal(result.supported, false);
  assert.equal(window.AndroidWidget.onmessage, null);
});

test("timeout restores the bridge handler so a retry can receive its reply", async () => {
  window.AndroidWidget = { onmessage: null, postMessage() {} };
  const pending = requestPinWidget("lanfeng");
  const rejection = assert.rejects(pending, /系统暂未响应/);
  scheduledTimeout();
  await rejection;
  assert.equal(window.AndroidWidget.onmessage, null);
  assert.equal(cleared, true);
});

test("a failed bridge send releases the pending request", async () => {
  window.AndroidWidget = { onmessage: null, postMessage() { throw new Error("bridge unavailable"); } };
  await assert.rejects(requestPinWidget("xuelang"), /无法打开系统添加界面/);
  assert.equal(window.AndroidWidget.onmessage, null);
  assert.equal(cleared, true);
});
