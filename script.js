const DEMO_USERS = [
  { email: "admin@bcc.edu.ph", password: "bcc1947", role: "Department Admin" },
  { email: "staff@bcc.edu.ph", password: "group3", role: "Maintenance Staff" }
];

// Quick-fill helper for demo accounts on login page
function fillDemo(email, password) {
  document.getElementById("email").value = email;
  document.getElementById("password").value = password;
  document.getElementById("errorMsg").textContent = "";
}

// Login Form Handling
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const errorMsg = document.getElementById("errorMsg");

    const user = DEMO_USERS.find(
      (u) => u.email === email && u.password === password
    );

    if (user) {
      localStorage.setItem("bcc_user", JSON.stringify(user));
      window.location.href = "dashboard.html";
    } else {
      errorMsg.textContent = "Invalid email or password.";
    }
  });
}

// Dashboard Handling
if (document.body.classList.contains("dashboard-body")) {
  const storedUser = JSON.parse(localStorage.getItem("bcc_user"));

  if (storedUser) {
    document.getElementById("userEmail").textContent = storedUser.email;
    document.getElementById("userRole").textContent = storedUser.role;
  }

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("bcc_user");
      window.location.href = "index.html";
    });
  }

  // Active nav highlight
  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
    });
  });

  // Simulated ML Diagnostic Scan
  const runAiBtn = document.getElementById("runAiBtn");
  if (runAiBtn) {
    runAiBtn.addEventListener("click", () => {
      runAiBtn.textContent = "Scanning...";
      runAiBtn.disabled = true;

      setTimeout(() => {
        alert("ML Diagnostic Complete: 3 high-risk equipment anomalies verified.");
        runAiBtn.textContent = "Run ML Scan";
        runAiBtn.disabled = false;
      }, 700);
    });
  }
}