const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { createAppServer } = require("../src/server");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "bcc-maintenance-"));
const { server, db } = createAppServer({
  databasePath: path.join(temporaryDirectory, "test.sqlite")
});
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function requestJson(route, options) {
  const response = await fetch(`${baseUrl}${route}`, options);
  return { response, body: await response.json() };
}

test("dashboard metrics are calculated from seeded SQLite records", async () => {
  const { response, body } = await requestJson("/api/dashboard");
  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    equipment: 4,
    activeRequests: 2,
    highRiskAlerts: 0,
    resolvedThisMonth: 1
  });
});

test("repair requests can be created and updated with live counts", async () => {
  const created = await requestJson("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "Room 101",
      issue: "Broken desk lamp",
      assignedTo: "A. Cruz"
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.ticketId, "REQ-1025");
  assert.equal(created.body.status, "Pending");

  const updated = await requestJson(`/api/requests/${created.body.ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignedTo: "B. Reyes", status: "Completed" })
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.assignedTo, "B. Reyes");
  assert.equal(updated.body.status, "Completed");

  const metrics = await requestJson("/api/dashboard");
  assert.equal(metrics.body.activeRequests, 2);
  assert.equal(metrics.body.resolvedThisMonth, 2);
});

test("equipment records can be added, edited, and deleted", async () => {
  const created = await requestJson("/api/equipment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assetId: "EQ-TEST-01",
      name: "Test Fan",
      location: "Room 101"
    })
  });
  assert.equal(created.response.status, 201);

  const edited = await requestJson("/api/equipment/EQ-TEST-01", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Ceiling Fan", location: "Room 102" })
  });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.name, "Ceiling Fan");
  assert.equal(edited.body.location, "Room 102");

  const deleted = await requestJson("/api/equipment/EQ-TEST-01", { method: "DELETE" });
  assert.equal(deleted.response.status, 200);
  const metrics = await requestJson("/api/dashboard");
  assert.equal(metrics.body.equipment, 4);
});

test("invalid request updates and duplicate asset IDs return clear client errors", async () => {
  const invalidStatus = await requestJson("/api/requests/REQ-1024", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignedTo: "", status: "Unknown" })
  });
  assert.equal(invalidStatus.response.status, 400);
  assert.match(invalidStatus.body.error, /Status must be one of/);

  const duplicateAsset = await requestJson("/api/equipment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assetId: "EQ-CL2-04",
      name: "Duplicate",
      location: "Room 1"
    })
  });
  assert.equal(duplicateAsset.response.status, 409);
});

test("only intended public files can be served", async () => {
  const dashboard = await fetch(`${baseUrl}/dashboard.html`);
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /Repair Requests/);

  const privateFile = await fetch(`${baseUrl}/src/server.js`);
  assert.equal(privateFile.status, 404);
});
