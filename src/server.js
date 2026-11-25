const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PROJECT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_DIR, "public");
const DEFAULT_DATABASE_PATH = path.join(PROJECT_DIR, "data", "maintenance.sqlite");
const REQUEST_STATUSES = ["Pending", "In Progress", "Completed"];
const MAX_BODY_BYTES = 64 * 1024;
const PUBLIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/dashboard.html", ["dashboard.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/script.js", ["script.js", "text/javascript; charset=utf-8"]],
  ["/assets/BCC.png", ["assets/BCC.png", "image/png"]]
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createDatabase(databasePath = DEFAULT_DATABASE_PATH) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);

  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS equipment (
      asset_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS requests (
      ticket_id TEXT PRIMARY KEY,
      location TEXT NOT NULL,
      issue TEXT NOT NULL,
      assigned_to TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Completed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  seedDatabase(db);
  return db;
}

function seedDatabase(db) {
  const now = new Date().toISOString();
  const equipmentCount = db.prepare("SELECT COUNT(*) AS count FROM equipment").get().count;
  if (equipmentCount === 0) {
    const insertEquipment = db.prepare(`
      INSERT INTO equipment (asset_id, name, location, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const equipment = [
      ["EQ-CL2-04", "Split AC Unit", "Computer Lab 2"],
      ["EQ-AVR-01", "Epson Projector", "Room 304"],
      ["EQ-NET-02", "24-Port Switch", "IT Faculty"],
      ["EQ-CL1-15", "Desktop PC #15", "Computer Lab 1"]
    ];
    for (const item of equipment) {
      insertEquipment.run(...item, now, now);
    }
  }

  const requestCount = db.prepare("SELECT COUNT(*) AS count FROM requests").get().count;
  if (requestCount === 0) {
    const insertRequest = db.prepare(`
      INSERT INTO requests (ticket_id, location, issue, assigned_to, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const requests = [
      ["REQ-1024", "Computer Lab 1", "No display output on PC-08", "Engr. M. Santos", "In Progress"],
      ["REQ-1023", "Room 202", "Flickering ceiling light fixture", "J. Dela Cruz", "Pending"],
      ["REQ-1022", "Science Lab", "Exhaust hood switch replacement", "R. Reyes", "Completed"]
    ];
    for (const item of requests) {
      insertRequest.run(...item, now, now);
    }
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(request.headers["content-length"] || 0);
    if (contentLength > MAX_BODY_BYTES) {
      reject(new HttpError(413, "Request body is too large."));
      request.resume();
      return;
    }

    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Request body is too large."));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (size === 0) {
        reject(new HttpError(400, "A JSON request body is required."));
        return;
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || Array.isArray(body) || typeof body !== "object") {
          throw new HttpError(400, "The JSON body must be an object.");
        }
        resolve(body);
      } catch (error) {
        reject(error instanceof HttpError ? error : new HttpError(400, "The request body contains invalid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function requiredText(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `${field} is required.`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new HttpError(400, `${field} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new HttpError(400, `${field} must be ${maxLength} characters or fewer.`);
  }
  return value.trim();
}

function listEquipment(db) {
  return db.prepare(`
    SELECT asset_id AS assetId, name, location
    FROM equipment
    ORDER BY asset_id
  `).all();
}

function listRequests(db) {
  return db.prepare(`
    SELECT ticket_id AS ticketId, location, issue, assigned_to AS assignedTo, status
    FROM requests
    ORDER BY created_at DESC, ticket_id DESC
  `).all();
}

function getDashboardMetrics(db) {
  const equipment = db.prepare("SELECT COUNT(*) AS count FROM equipment").get().count;
  const activeRequests = db.prepare(
    "SELECT COUNT(*) AS count FROM requests WHERE status != 'Completed'"
  ).get().count;
  const resolvedThisMonth = db.prepare(`
    SELECT COUNT(*) AS count
    FROM requests
    WHERE status = 'Completed'
      AND substr(created_at, 1, 7) = strftime('%Y-%m', 'now')
  `).get().count;

  return { equipment, activeRequests, highRiskAlerts: 0, resolvedThisMonth };
}

function createAppServer({ databasePath = DEFAULT_DATABASE_PATH } = {}) {
  const db = createDatabase(databasePath);

  async function handleApi(request, response, pathname) {
    if (request.method === "GET" && pathname === "/api/dashboard") {
      sendJson(response, 200, getDashboardMetrics(db));
      return;
    }

    if (request.method === "GET" && pathname === "/api/equipment") {
      sendJson(response, 200, listEquipment(db));
      return;
    }

    if (request.method === "POST" && pathname === "/api/equipment") {
      const body = await readJsonBody(request);
      const assetId = requiredText(body.assetId, "Asset ID", 40);
      const name = requiredText(body.name, "Equipment name", 120);
      const location = requiredText(body.location, "Location", 120);
      const now = new Date().toISOString();
      try {
        db.prepare(`
          INSERT INTO equipment (asset_id, name, location, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(assetId, name, location, now, now);
      } catch (error) {
        if (error.errcode === 1555 || error.errcode === 2067) {
          throw new HttpError(409, `Equipment ID ${assetId} already exists.`);
        }
        throw error;
      }
      sendJson(response, 201, { assetId, name, location });
      return;
    }

    const equipmentMatch = pathname.match(/^\/api\/equipment\/([^/]+)$/);
    if (equipmentMatch) {
      const assetId = decodeURIComponent(equipmentMatch[1]);
      if (request.method === "PATCH") {
        const body = await readJsonBody(request);
        const name = requiredText(body.name, "Equipment name", 120);
        const location = requiredText(body.location, "Location", 120);
        const result = db.prepare(`
          UPDATE equipment SET name = ?, location = ?, updated_at = ?
          WHERE asset_id = ?
        `).run(name, location, new Date().toISOString(), assetId);
        if (result.changes === 0) {
          throw new HttpError(404, "Equipment record not found.");
        }
        sendJson(response, 200, { assetId, name, location });
        return;
      }
      if (request.method === "DELETE") {
        const result = db.prepare("DELETE FROM equipment WHERE asset_id = ?").run(assetId);
        if (result.changes === 0) {
          throw new HttpError(404, "Equipment record not found.");
        }
        sendJson(response, 200, { deleted: assetId });
        return;
      }
    }

    if (request.method === "GET" && pathname === "/api/requests") {
      sendJson(response, 200, listRequests(db));
      return;
    }

    if (request.method === "POST" && pathname === "/api/requests") {
      const body = await readJsonBody(request);
      const location = requiredText(body.location, "Location", 120);
      const issue = requiredText(body.issue, "Issue", 500);
      const assignedTo = optionalText(body.assignedTo, "Assigned staff", 120);
      const now = new Date().toISOString();
      const lastTicket = db.prepare(`
        SELECT MAX(CAST(substr(ticket_id, 5) AS INTEGER)) AS number
        FROM requests
      `).get().number || 1021;
      const ticketId = `REQ-${lastTicket + 1}`;
      db.prepare(`
        INSERT INTO requests (ticket_id, location, issue, assigned_to, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'Pending', ?, ?)
      `).run(ticketId, location, issue, assignedTo, now, now);
      sendJson(response, 201, { ticketId, location, issue, assignedTo, status: "Pending" });
      return;
    }

    const requestMatch = pathname.match(/^\/api\/requests\/([^/]+)$/);
    if (requestMatch && request.method === "PATCH") {
      const ticketId = decodeURIComponent(requestMatch[1]);
      const body = await readJsonBody(request);
      const assignedTo = optionalText(body.assignedTo, "Assigned staff", 120);
      if (!REQUEST_STATUSES.includes(body.status)) {
        throw new HttpError(400, `Status must be one of: ${REQUEST_STATUSES.join(", ")}.`);
      }
      const result = db.prepare(`
        UPDATE requests SET assigned_to = ?, status = ?, updated_at = ?
        WHERE ticket_id = ?
      `).run(assignedTo, body.status, new Date().toISOString(), ticketId);
      if (result.changes === 0) {
        throw new HttpError(404, "Maintenance request not found.");
      }
      sendJson(response, 200, { ticketId, assignedTo, status: body.status });
      return;
    }

    const knownPath = pathname === "/api/dashboard"
      || pathname === "/api/equipment"
      || pathname.startsWith("/api/equipment/")
      || pathname === "/api/requests"
      || pathname.startsWith("/api/requests/");
    throw new HttpError(knownPath ? 405 : 404, knownPath ? "Method not allowed." : "API endpoint not found.");
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname.startsWith("/api/")) {
      handleApi(request, response, url.pathname).catch((error) => {
        if (response.headersSent) {
          response.destroy(error);
          return;
        }
        const status = error instanceof HttpError ? error.status : 500;
        if (status >= 500) {
          console.error("API request failed:", error);
        }
        sendJson(response, status, {
          error: status === 500 ? "An unexpected server error occurred." : error.message
        });
      });
      return;
    }

    const file = PUBLIC_FILES.get(url.pathname);
    if (!file || (request.method !== "GET" && request.method !== "HEAD")) {
      response.writeHead(file ? 405 : 404, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(file ? "Method not allowed." : "Not found.");
      return;
    }

    const filePath = path.join(PUBLIC_DIR, file[0]);
    fs.readFile(filePath, (error, contents) => {
      if (error) {
        console.error(`Unable to serve ${file[0]}:`, error);
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Unable to load this page.");
        return;
      }
      response.writeHead(200, {
        "Content-Type": file[1],
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(request.method === "HEAD" ? undefined : contents);
    });
  });

  return { server, db };
}

if (require.main === module) {
  const { server, db } = createAppServer();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, "127.0.0.1", () => {
    console.log(`BCC Maintenance System is running at http://127.0.0.1:${port}`);
  });
  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { createAppServer };
