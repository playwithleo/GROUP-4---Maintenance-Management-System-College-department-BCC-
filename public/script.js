const DEMO_USERS = [
  { email: "admin@bcc.edu.ph", password: "bcc1947", role: "Department Admin" },
  { email: "staff@bcc.edu.ph", password: "group3", role: "Maintenance Staff" }
];

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  const demoUsers = {
    admin: DEMO_USERS[0],
    staff: DEMO_USERS[1]
  };

  document.querySelectorAll("[data-demo-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = demoUsers[button.dataset.demoUser];
      document.getElementById("email").value = user.email;
      document.getElementById("password").value = user.password;
      document.getElementById("errorMsg").textContent = "";
    });
  });

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const user = DEMO_USERS.find((item) => item.email === email && item.password === password);

    if (!user) {
      document.getElementById("errorMsg").textContent = "Invalid email or password.";
      return;
    }

    localStorage.setItem("bcc_user", JSON.stringify({ email: user.email, role: user.role }));
    window.location.href = "dashboard.html";
  });
}

if (document.body.classList.contains("dashboard-body")) {
  let storedUser;
  try {
    storedUser = JSON.parse(localStorage.getItem("bcc_user") || "null");
  } catch {
    localStorage.removeItem("bcc_user");
  }

  if (!storedUser) {
    window.location.replace("index.html");
  } else {
    initializeDashboard(storedUser);
  }
}

function initializeDashboard(user) {
  document.getElementById("userEmail").textContent = user.email;
  document.getElementById("userRole").textContent = user.role;

  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("bcc_user");
    window.location.href = "index.html";
  });

  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");
    });
  });

  const equipmentForm = document.getElementById("equipmentForm");
  const equipmentRows = document.getElementById("equipmentRows");
  const requestForm = document.getElementById("requestForm");
  const requestRows = document.getElementById("requestRows");
  let editingAssetId = null;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }
    return payload;
  }

  function showFeedback(id, message, isError = false) {
    const element = document.getElementById(id);
    element.textContent = message;
    element.classList.toggle("feedback-error", isError);
  }

  function makeCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  function makeButton(text, className, action, id) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.action = action;
    button.dataset.id = id;
    button.textContent = text;
    return button;
  }

  function renderEquipment(items) {
    equipmentRows.replaceChildren();
    for (const item of items) {
      const row = document.createElement("tr");
      row.append(makeCell(item.assetId), makeCell(item.name), makeCell(item.location));
      const actions = document.createElement("td");
      actions.className = "table-actions";
      actions.append(
        makeButton("Edit", "btn-secondary btn-table", "edit-equipment", item.assetId),
        makeButton("Delete", "btn-danger btn-table", "delete-equipment", item.assetId)
      );
      row.append(actions);
      equipmentRows.append(row);
    }
    if (items.length === 0) {
      const row = document.createElement("tr");
      const cell = makeCell("No equipment has been added.");
      cell.colSpan = 4;
      row.append(cell);
      equipmentRows.append(row);
    }
  }

  function renderRequests(items) {
    requestRows.replaceChildren();
    for (const item of items) {
      const row = document.createElement("tr");
      row.dataset.ticketId = item.ticketId;
      row.append(
        makeCell(item.ticketId),
        makeCell(item.location),
        makeCell(item.issue)
      );

      const assigneeCell = document.createElement("td");
      const assigneeInput = document.createElement("input");
      assigneeInput.className = "table-input";
      assigneeInput.setAttribute("aria-label", `Assigned staff for ${item.ticketId}`);
      assigneeInput.maxLength = 120;
      assigneeInput.value = item.assignedTo;
      assigneeCell.append(assigneeInput);
      row.append(assigneeCell);

      const statusCell = document.createElement("td");
      const statusSelect = document.createElement("select");
      statusSelect.className = "table-select";
      statusSelect.setAttribute("aria-label", `Status for ${item.ticketId}`);
      for (const status of ["Pending", "In Progress", "Completed"]) {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status;
        option.selected = status === item.status;
        statusSelect.append(option);
      }
      statusCell.append(statusSelect);
      row.append(statusCell);

      const actions = document.createElement("td");
      actions.append(makeButton("Save", "btn-primary btn-table", "save-request", item.ticketId));
      row.append(actions);
      requestRows.append(row);
    }
    if (items.length === 0) {
      const row = document.createElement("tr");
      const cell = makeCell("No repair requests have been added.");
      cell.colSpan = 6;
      row.append(cell);
      requestRows.append(row);
    }
  }

  async function refreshDashboard() {
    try {
      const [metrics, equipment, requests] = await Promise.all([
        api("/api/dashboard"),
        api("/api/equipment"),
        api("/api/requests")
      ]);
      document.getElementById("equipmentCount").textContent = metrics.equipment;
      document.getElementById("activeRequestCount").textContent = metrics.activeRequests;
      document.getElementById("highRiskCount").textContent = metrics.highRiskAlerts;
      document.getElementById("resolvedCount").textContent = metrics.resolvedThisMonth;
      renderEquipment(equipment);
      renderRequests(requests);
      showFeedback("pageFeedback", "");
    } catch (error) {
      showFeedback("pageFeedback", `Could not load saved data: ${error.message}`, true);
    }
  }

  equipmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const assetId = document.getElementById("assetId").value.trim();
    const values = {
      name: document.getElementById("equipmentName").value.trim(),
      location: document.getElementById("equipmentLocation").value.trim()
    };
    try {
      if (editingAssetId) {
        await api(`/api/equipment/${encodeURIComponent(editingAssetId)}`, {
          method: "PATCH",
          body: JSON.stringify(values)
        });
        showFeedback("equipmentFeedback", "Equipment updated.");
      } else {
        await api("/api/equipment", {
          method: "POST",
          body: JSON.stringify({ assetId, ...values })
        });
        showFeedback("equipmentFeedback", "Equipment added.");
      }
      resetEquipmentForm();
      await refreshDashboard();
    } catch (error) {
      showFeedback("equipmentFeedback", error.message, true);
    }
  });

  function resetEquipmentForm() {
    editingAssetId = null;
    equipmentForm.reset();
    const assetIdInput = document.getElementById("assetId");
    assetIdInput.disabled = false;
    document.getElementById("equipmentSubmit").textContent = "Add equipment";
    document.getElementById("cancelEquipmentEdit").hidden = true;
  }

  document.getElementById("cancelEquipmentEdit").addEventListener("click", resetEquipmentForm);

  equipmentRows.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;

    if (action === "edit-equipment") {
      try {
        const items = await api("/api/equipment");
        const item = items.find((equipment) => equipment.assetId === id);
        if (!item) {
          showFeedback("equipmentFeedback", "Equipment record no longer exists.", true);
          await refreshDashboard();
          return;
        }
        editingAssetId = item.assetId;
        document.getElementById("assetId").value = item.assetId;
        document.getElementById("assetId").disabled = true;
        document.getElementById("equipmentName").value = item.name;
        document.getElementById("equipmentLocation").value = item.location;
        document.getElementById("equipmentSubmit").textContent = "Save changes";
        document.getElementById("cancelEquipmentEdit").hidden = false;
        document.getElementById("equipmentName").focus();
      } catch (error) {
        showFeedback("equipmentFeedback", error.message, true);
      }
      return;
    }

    if (action === "delete-equipment") {
      if (!window.confirm(`Delete equipment ${id}?`)) return;
      try {
        await api(`/api/equipment/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (editingAssetId === id) resetEquipmentForm();
        showFeedback("equipmentFeedback", "Equipment deleted.");
        await refreshDashboard();
      } catch (error) {
        showFeedback("equipmentFeedback", error.message, true);
      }
    }
  });

  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(requestForm);
    const values = Object.fromEntries(formData.entries());
    try {
      const created = await api("/api/requests", {
        method: "POST",
        body: JSON.stringify(values)
      });
      requestForm.reset();
      showFeedback("requestFeedback", `${created.ticketId} created.`);
      await refreshDashboard();
    } catch (error) {
      showFeedback("requestFeedback", error.message, true);
    }
  });

  requestRows.addEventListener("click", async (event) => {
    const button = event.target.closest('button[data-action="save-request"]');
    if (!button) return;
    const row = button.closest("tr");
    const assigneeInput = row.querySelector("input");
    const statusSelect = row.querySelector("select");
    button.disabled = true;
    try {
      await api(`/api/requests/${encodeURIComponent(button.dataset.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          assignedTo: assigneeInput.value.trim(),
          status: statusSelect.value
        })
      });
      showFeedback("requestFeedback", `${button.dataset.id} updated.`);
      await refreshDashboard();
    } catch (error) {
      showFeedback("requestFeedback", error.message, true);
      button.disabled = false;
    }
  });

  refreshDashboard();
}
