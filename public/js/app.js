// Global State
let jobsList = [];
let currentProfile = {};
let currentFilter = 'All';
let activeJobForApply = null;

// On Load
document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

async function initApp() {
  await fetchProfile();
  await fetchJobs();
  await fetchContacts();
  appendLog("search-console", "[SYSTEM] System online. Agent pipeline fully connected.");
  appendLog("dashboard-console", "[SYSTEM] Welcome! System initialized. Ready to search.");
}

// Navigation Tab Switcher
function switchTab(tabId) {
  // Update nav buttons active state
  const menuButtons = document.querySelectorAll(".menu-item");
  menuButtons.forEach(btn => btn.classList.remove("active"));
  
  const targetBtn = document.getElementById(`nav-${tabId}`);
  if (targetBtn) targetBtn.classList.add("active");

  // Show/Hide tab panels
  const panels = document.querySelectorAll(".tab-panel");
  panels.forEach(panel => panel.classList.remove("active"));

  const targetPanel = document.getElementById(`tab-${tabId}`);
  if (targetPanel) targetPanel.classList.add("active");

  // Update top header title
  const titles = {
    dashboard: "Dashboard Overview",
    search: "Search & Contact Extraction Console",
    pipeline: "Job Application Pipeline",
    crm: "Recruiter CRM Panel",
    settings: "System Configurations"
  };
  document.getElementById("page-title").textContent = titles[tabId] || "Dashboard";
}

// Fetch Profile
async function fetchProfile() {
  try {
    const res = await fetch('/api/profile');
    if (!res.ok) throw new Error("Failed to fetch profile");
    currentProfile = await res.json();

    // Populate Settings forms
    document.getElementById("profile-name").value = currentProfile.name || "";
    document.getElementById("profile-email").value = currentProfile.email || "";
    document.getElementById("profile-phone").value = currentProfile.phone || "";
    document.getElementById("profile-skills").value = currentProfile.skills || "";
    document.getElementById("profile-resume").value = currentProfile.resumeText || "";
    document.getElementById("cover-letter-template").value = currentProfile.coverLetterTemplate || "";

    if (currentProfile.smtp) {
      document.getElementById("smtp-host").value = currentProfile.smtp.host || "";
      document.getElementById("smtp-port").value = currentProfile.smtp.port || "";
      document.getElementById("smtp-user").value = currentProfile.smtp.user || "";
      document.getElementById("smtp-pass").value = currentProfile.smtp.pass ? "••••••••••••••••" : "";
      document.getElementById("smtp-secure").checked = currentProfile.smtp.secure || false;
    }

    // Update displays
    document.getElementById("user-name-display").textContent = currentProfile.name || "Set Name in Settings";
  } catch (error) {
    console.error("Error fetching profile:", error);
  }
}

// Save Profile
async function saveProfile(event) {
  event.preventDefault();
  const name = document.getElementById("profile-name").value;
  const email = document.getElementById("profile-email").value;
  const phone = document.getElementById("profile-phone").value;
  const skills = document.getElementById("profile-skills").value;
  const resumeText = document.getElementById("profile-resume").value;

  const updatedProfile = {
    ...currentProfile,
    name,
    email,
    phone,
    skills,
    resumeText
  };

  await sendProfileUpdate(updatedProfile);
  alert("Profile updated successfully!");
}

// Save Cover Letter Template
async function saveTemplate(event) {
  event.preventDefault();
  const coverLetterTemplate = document.getElementById("cover-letter-template").value;

  const updatedProfile = {
    ...currentProfile,
    coverLetterTemplate
  };

  await sendProfileUpdate(updatedProfile);
  alert("Cover Letter Template updated successfully!");
}

// Save SMTP Config
async function saveSMTP(event) {
  event.preventDefault();
  const host = document.getElementById("smtp-host").value;
  const port = document.getElementById("smtp-port").value;
  const user = document.getElementById("smtp-user").value;
  const passInput = document.getElementById("smtp-pass").value;
  const secure = document.getElementById("smtp-secure").checked;

  const updatedProfile = { ...currentProfile };
  updatedProfile.smtp = {
    host,
    port: parseInt(port) || 587,
    user,
    secure
  };

  // If password was edited (i.e. not the mock bullet placeholder)
  if (passInput && passInput !== "••••••••••••••••") {
    updatedProfile.smtp.pass = passInput;
  } else if (currentProfile.smtp && currentProfile.smtp.pass) {
    updatedProfile.smtp.pass = currentProfile.smtp.pass;
  }

  await sendProfileUpdate(updatedProfile);
  alert("SMTP Configuration updated successfully!");
}

// Helper: send profile updates to API
async function sendProfileUpdate(profileData) {
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });
    const result = await res.json();
    currentProfile = result.profile;
    document.getElementById("user-name-display").textContent = currentProfile.name || "Set Name in Settings";
  } catch (error) {
    console.error("Error saving profile details:", error);
  }
}

// Fetch Jobs
async function fetchJobs() {
  try {
    const res = await fetch('/api/jobs');
    if (!res.ok) throw new Error("Failed to fetch jobs");
    jobsList = await res.json();
    
    // Sort: newest found jobs first
    jobsList.sort((a, b) => new Date(b.dateFound) - new Date(a.dateFound));

    updateStats();
    renderRecentJobs();
    renderPipeline();
  } catch (error) {
    console.error("Error fetching jobs:", error);
  }
}

// Update Stats counters
function updateStats() {
  document.getElementById("stat-total").textContent = jobsList.length;
  
  const appliedJobs = jobsList.filter(j => j.status === 'Applied').length;
  document.getElementById("stat-applied").textContent = appliedJobs;
  
  const interviewJobs = jobsList.filter(j => j.status === 'Interview').length;
  document.getElementById("stat-interviews").textContent = interviewJobs;

  // Count active contact details (unique emails + phone lists)
  const allEmails = new Set();
  jobsList.forEach(job => {
    if (job.emails) job.emails.forEach(e => allEmails.add(e));
  });
  document.getElementById("stat-contacts").textContent = allEmails.size;
}

// Render Recent Jobs table on Dashboard
function renderRecentJobs() {
  const tbody = document.getElementById("recent-jobs-tbody");
  tbody.innerHTML = "";

  const recent = jobsList.slice(0, 5); // top 5
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center">No extractions found yet. Run an Agent Search first!</td></tr>`;
    return;
  }

  recent.forEach(job => {
    const tr = document.createElement("tr");
    
    const emailListStr = job.emails && job.emails.length > 0 ? job.emails.join(", ") : "None found";
    
    tr.innerHTML = `
      <td><strong>${escapeHTML(job.title)}</strong></td>
      <td>${escapeHTML(job.company)}</td>
      <td>${escapeHTML(job.location)}</td>
      <td style="color: var(--accent-teal)">${escapeHTML(emailListStr)}</td>
      <td><span class="status-badge ${job.status.toLowerCase()}">${job.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Pipeline Funnel List
function renderPipeline() {
  const container = document.getElementById("pipeline-container");
  container.innerHTML = "";

  const filteredJobs = currentFilter === 'All' 
    ? jobsList 
    : jobsList.filter(j => j.status === currentFilter);

  if (filteredJobs.length === 0) {
    container.innerHTML = `<div class="card text-center text-muted">No jobs matching filter "${currentFilter}" found in pipeline.</div>`;
    return;
  }

  filteredJobs.forEach(job => {
    const card = document.createElement("div");
    card.className = "job-card";
    
    const emailStr = job.emails && job.emails.length > 0 ? job.emails.join(", ") : "No email";
    const phoneStr = job.phones && job.phones.length > 0 ? job.phones.join(", ") : "No phone";
    
    const hasEmail = job.emails && job.emails.length > 0;
    const sourceLabel = job.source || 'Found';
    const sourceClass = sourceLabel.toLowerCase() === 'indeed' ? 'source-indeed' : (sourceLabel.toLowerCase() === 'simulated' ? 'source-simulated' : '');
    const sourceIcon = sourceLabel.toLowerCase() === 'indeed' ? '🔵' : (sourceLabel.toLowerCase() === 'simulated' ? '🟣' : '📋');

    card.innerHTML = `
      <div class="job-info">
        <div class="job-title-row">
          <h3>${escapeHTML(job.title)}</h3>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            ${job.source ? `<span class="source-tag ${sourceClass}">${sourceIcon} ${escapeHTML(job.source)}</span>` : ''}
            <span class="status-badge ${job.status.toLowerCase()}">${job.status}</span>
          </div>
        </div>
        <div class="job-meta-row">
          <span>🏢 ${escapeHTML(job.company)}</span>
          <span>📍 ${escapeHTML(job.location)}</span>
          <span>📅 Extracted: ${new Date(job.dateFound).toLocaleDateString()}</span>
        </div>
        <div class="job-contacts">
          ${hasEmail ? `<span>✉️ ${escapeHTML(emailStr)}</span>` : ""}
          ${job.phones && job.phones.length > 0 ? `<span>📞 ${escapeHTML(phoneStr)}</span>` : ""}
        </div>
      </div>
      <div class="job-actions">
        ${hasEmail && job.status === 'Found' ? `<button class="btn btn-sm btn-primary" onclick="openApplyModal('${job.id}')">Apply</button>` : ""}
        <select class="btn btn-sm btn-secondary" style="padding-right: 24px;" onchange="updateJobStatus('${job.id}', this.value)">
          <option value="Found" ${job.status === 'Found' ? 'selected' : ''}>Found</option>
          <option value="Applied" ${job.status === 'Applied' ? 'selected' : ''}>Applied</option>
          <option value="Interview" ${job.status === 'Interview' ? 'selected' : ''}>Interview</option>
          <option value="Offer" ${job.status === 'Offer' ? 'selected' : ''}>Offer</option>
        </select>
        <button class="btn btn-sm btn-secondary" onclick="deleteJob('${job.id}')" style="color: var(--accent-red)">🗑️</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Filter Funnel Pipeline List
function filterPipeline(filterValue) {
  currentFilter = filterValue;
  
  const filterButtons = document.querySelectorAll(".filter-btn");
  filterButtons.forEach(btn => {
    if (btn.textContent === filterValue) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  renderPipeline();
}

// Update Job Status
async function updateJobStatus(jobId, newStatus) {
  try {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      await fetchJobs();
      appendLog("dashboard-console", `[SYSTEM] Job status updated to ${newStatus} for job id: ${jobId}`);
    }
  } catch (error) {
    console.error("Error updating status:", error);
  }
}

// Delete Job
async function deleteJob(jobId) {
  if (!confirm("Are you sure you want to remove this job from the database?")) return;
  try {
    const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
    if (res.ok) {
      await fetchJobs();
      appendLog("dashboard-console", `[SYSTEM] Removed job ID: ${jobId} from list.`);
    }
  } catch (error) {
    console.error("Error deleting job:", error);
  }
}

// Trigger Agent Search Scraper
async function triggerSearch(event) {
  event.preventDefault();
  const keyword = document.getElementById("search-keyword").value;
  const location = document.getElementById("search-location").value;
  const sourceEl = document.getElementById("search-source");
  const sources = sourceEl ? sourceEl.value : 'all';

  const btn = document.getElementById("search-btn");
  const spinner = document.getElementById("search-spinner");

  // Disable button, show loading
  btn.disabled = true;
  spinner.classList.remove("hidden");

  clearTerminal();
  appendLog("search-console", `[COMMAND] Query: Keyword="${keyword}", Location="${location}", Source="${sources}"`);
  appendLog("search-console", `[SYSTEM] Connecting to extractor engine...`);
  if (sources === 'indeed' || sources === 'all') {
    appendLog("search-console", `[INDEED] Initializing Indeed job search pipeline...`);
  }

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, location, sources })
    });
    
    if (!res.ok) throw new Error("Search command failed");
    
    const result = await res.json();
    
    // Output search logs into the terminal console
    if (result.logs) {
      for (const logLine of result.logs) {
        await delay(350); // Add natural typing lag for "wow" agent log experience
        appendLog("search-console", logLine);
      }
    }
    
    appendLog("search-console", `\n[SUCCESS] Extraction completed. Added ${result.newCount} new jobs.`);
    appendLog("dashboard-console", `[EXTRACTOR] Extracted ${result.newCount} new jobs for keyword "${keyword}".`);

    // Reload jobs
    await fetchJobs();
  } catch (error) {
    appendLog("search-console", `[ERROR] Search failed: ${error.message}`);
  } finally {
    btn.disabled = false;
    spinner.classList.add("hidden");
  }
}

// Auto Apply Modal handling
function openApplyModal(jobId) {
  const job = jobsList.find(j => j.id === jobId);
  if (!job) return;

  activeJobForApply = job;

  // Dynamic replacements of template fields
  let compiledBody = currentProfile.coverLetterTemplate || "";
  compiledBody = compiledBody.replace(/{company}/g, job.company);
  compiledBody = compiledBody.replace(/{role}/g, job.title);
  compiledBody = compiledBody.replace(/{skills}/g, currentProfile.skills || "");
  compiledBody = compiledBody.replace(/{name}/g, currentProfile.name || "Applicant");

  const recipient = job.emails && job.emails.length > 0 ? job.emails[0] : "";
  const subject = `Application for ${job.title} - ${currentProfile.name}`;

  document.getElementById("modal-to").textContent = recipient;
  document.getElementById("modal-subject").textContent = subject;
  document.getElementById("modal-body-content").textContent = compiledBody;

  // Decide if we simulate or send real
  const hasSMTP = currentProfile.smtp && currentProfile.smtp.host && currentProfile.smtp.user;
  const sendBtn = document.getElementById("modal-send-btn");
  
  if (hasSMTP) {
    sendBtn.textContent = "Send via SMTP";
    sendBtn.onclick = () => performApply(false);
  } else {
    sendBtn.textContent = "Simulate Apply (SMTP not set)";
    sendBtn.onclick = () => performApply(true);
  }

  document.getElementById("preview-modal").classList.add("active");
}

function closeModal() {
  document.getElementById("preview-modal").classList.remove("active");
  activeJobForApply = null;
}

// Perform application call
async function performApply(simulate) {
  if (!activeJobForApply) return;
  
  const sendBtn = document.getElementById("modal-send-btn");
  sendBtn.disabled = true;
  sendBtn.textContent = "Sending...";

  try {
    const res = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: activeJobForApply.id, simulate })
    });

    const result = await res.json();
    if (!res.ok) {
      alert(`Error sending application: ${result.error}`);
      return;
    }

    if (result.log) {
      appendLog("dashboard-console", result.log);
    }
    
    alert(simulate ? "Simulated application successfully completed!" : "Application email dispatched successfully via SMTP!");
    closeModal();
    await fetchJobs();
  } catch (error) {
    alert(`Failed to apply: ${error.message}`);
  } finally {
    sendBtn.disabled = false;
  }
}

// Logging helpers
function appendLog(consoleId, message) {
  const consoleEl = document.getElementById(consoleId);
  if (consoleEl) {
    consoleEl.textContent += "\n" + message;
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
}

function clearTerminal() {
  document.getElementById("search-console").textContent = "[READY] Scraper agent console cleared.";
}

// Utility Helpers
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// CRM Global variables
let contactsList = [];
let activeCRMContact = null;

// Fetch and render contacts
async function fetchContacts() {
  try {
    const res = await fetch('/api/contacts');
    if (!res.ok) throw new Error("Failed to fetch contacts");
    contactsList = await res.json();
    
    updateCRMStats();
    renderCRMContacts();
  } catch (error) {
    console.error("Error fetching contacts:", error);
  }
}

// Update CRM specific stats counters
function updateCRMStats() {
  document.getElementById("crm-stat-contacts").textContent = contactsList.length;
  
  // count active reminders (tasks that are not completed)
  let pendingTasks = 0;
  let totalInteractions = 0;
  contactsList.forEach(c => {
    if (c.tasks) {
      pendingTasks += c.tasks.filter(t => !t.completed).length;
    }
    if (c.interactions) {
      totalInteractions += c.interactions.length;
    }
  });
  
  document.getElementById("crm-stat-tasks").textContent = pendingTasks;
  document.getElementById("crm-stat-interactions").textContent = totalInteractions;
}

// Render recruiter contact cards grid
function renderCRMContacts() {
  const container = document.getElementById("contacts-grid-container");
  container.innerHTML = "";

  if (contactsList.length === 0) {
    container.innerHTML = `<div class="card text-center text-muted" style="grid-column: 1 / -1;">No recruitment contacts in database. Click "+ Add Contact" to create one.</div>`;
    return;
  }

  contactsList.forEach(contact => {
    const card = document.createElement("div");
    card.className = "recruiter-card";
    card.onclick = () => openCRMDrawer(contact.id);
    
    const notesSnippet = contact.notes || "No details added yet.";
    const activeTasks = contact.tasks ? contact.tasks.filter(t => !t.completed).length : 0;
    const interactionsCount = contact.interactions ? contact.interactions.length : 0;

    card.innerHTML = `
      <div class="recruiter-card-header">
        <div>
          <h3>${escapeHTML(contact.name)}</h3>
          <div class="recruiter-card-company">${escapeHTML(contact.company || 'Independent')}</div>
        </div>
      </div>
      <div class="recruiter-card-body">
        ${escapeHTML(notesSnippet)}
      </div>
      <div class="recruiter-card-footer">
        <div class="recruiter-card-stat">📝 ${interactionsCount} log touches</div>
        <div class="recruiter-card-stat ${activeTasks > 0 ? 'tasks-active' : ''}">📋 ${activeTasks} pending</div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Contact Modal triggers
function openContactModal() {
  document.getElementById("contact-modal").classList.add("active");
}

function closeContactModal() {
  document.getElementById("contact-form").reset();
  document.getElementById("contact-modal").classList.remove("active");
}

// Save New Contact
async function saveNewContact(event) {
  event.preventDefault();
  const name = document.getElementById("contact-name").value;
  const email = document.getElementById("contact-email").value;
  const phone = document.getElementById("contact-phone").value;
  const company = document.getElementById("contact-company").value;
  const linkedin = document.getElementById("contact-linkedin").value;
  const notes = document.getElementById("contact-notes").value;

  try {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, company, linkedin, notes })
    });

    if (res.ok) {
      closeContactModal();
      await fetchContacts();
      appendLog("dashboard-console", `[SYSTEM] New CRM Contact added: "${name}"`);
    } else {
      const err = await res.json();
      alert(`Error creating contact: ${err.error}`);
    }
  } catch (error) {
    alert(`Failed to save contact: ${error.message}`);
  }
}

// CRM Drawer handlers
function openCRMDrawer(contactId) {
  const contact = contactsList.find(c => c.id === contactId);
  if (!contact) return;

  activeCRMContact = contact;

  document.getElementById("drawer-recruiter-name").textContent = contact.name;
  document.getElementById("drawer-recruiter-meta").textContent = contact.company || "Independent Recruiter";
  document.getElementById("drawer-recruiter-notes").textContent = contact.notes || "No context notes added yet.";

  // LinkedIn & Email quick buttons
  const emailBtn = document.getElementById("drawer-email-btn");
  if (contact.email) {
    emailBtn.href = `mailto:${contact.email}`;
    emailBtn.style.display = "inline-flex";
  } else {
    emailBtn.style.display = "none";
  }

  const linkedinBtn = document.getElementById("drawer-linkedin-btn");
  if (contact.linkedin) {
    linkedinBtn.href = contact.linkedin;
    linkedinBtn.style.display = "inline-flex";
  } else {
    linkedinBtn.style.display = "none";
  }

  // Delete button binder
  document.getElementById("drawer-delete-btn").onclick = () => deleteCRMContact(contact.id);

  // Render lists
  renderTimeline();
  renderChecklist();

  document.getElementById("crm-details-drawer").classList.add("active");
}

function closeCRMDrawer() {
  document.getElementById("crm-details-drawer").classList.remove("active");
  activeCRMContact = null;
}

// Render Interaction Timeline inside drawer
function renderTimeline() {
  const container = document.getElementById("drawer-timeline");
  container.innerHTML = "";

  if (!activeCRMContact.interactions || activeCRMContact.interactions.length === 0) {
    container.innerHTML = `<div class="text-muted" style="font-size: 13px; text-align: center; padding: 10px;">No interactions logged yet.</div>`;
    return;
  }

  // Sort interactions newest first
  const sorted = [...activeCRMContact.interactions].sort((a,b) => new Date(b.date) - new Date(a.date));

  sorted.forEach(item => {
    const el = document.createElement("div");
    el.className = "timeline-item";
    
    // Choose marker color
    let markerClass = "";
    if (item.type === 'Call') markerClass = "call";
    if (item.type === 'Email Sent') markerClass = "email";
    if (item.type === 'Interview') markerClass = "interview";

    el.innerHTML = `
      <div class="timeline-marker ${markerClass}"></div>
      <div class="timeline-content">
        <div class="timeline-meta">
          <strong>${item.type}</strong>
          <span>${new Date(item.date).toLocaleString()}</span>
        </div>
        <div class="timeline-notes">${escapeHTML(item.notes)}</div>
      </div>
    `;
    container.appendChild(el);
  });
}

// Add Interaction history log
async function addInteraction(event) {
  event.preventDefault();
  if (!activeCRMContact) return;

  const type = document.getElementById("interaction-type").value;
  const notes = document.getElementById("interaction-text").value;

  try {
    const res = await fetch(`/api/contacts/${activeCRMContact.id}/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, notes })
    });

    if (res.ok) {
      document.getElementById("drawer-interaction-form").reset();
      
      // Fetch updated info & refresh drawer
      await fetchContacts();
      const updated = contactsList.find(c => c.id === activeCRMContact.id);
      if (updated) {
        activeCRMContact = updated;
        renderTimeline();
      }
    }
  } catch (error) {
    console.error("Error logging interaction:", error);
  }
}

// Render Checklist tasks reminders
function renderChecklist() {
  const container = document.getElementById("drawer-checklist");
  container.innerHTML = "";

  if (!activeCRMContact.tasks || activeCRMContact.tasks.length === 0) {
    container.innerHTML = `<div class="text-muted" style="font-size: 13px; text-align: center; padding: 10px;">No pending tasks. Add one below!</div>`;
    return;
  }

  activeCRMContact.tasks.forEach(task => {
    const el = document.createElement("div");
    el.className = `crm-task-item ${task.completed ? 'completed' : ''}`;

    el.innerHTML = `
      <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleCRMTask('${activeCRMContact.id}', '${task.id}')">
      <div class="crm-task-details">
        <span>${escapeHTML(task.title)}</span>
        ${task.dueDate ? `<span class="crm-task-due">📅 Due: ${task.dueDate}</span>` : ""}
      </div>
    `;
    container.appendChild(el);
  });
}

// Add CRM Reminder task
async function addCRMTask(event) {
  event.preventDefault();
  if (!activeCRMContact) return;

  const title = document.getElementById("task-title").value;
  const dueDate = document.getElementById("task-duedate").value;

  try {
    const res = await fetch(`/api/contacts/${activeCRMContact.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, dueDate })
    });

    if (res.ok) {
      document.getElementById("drawer-task-form").reset();
      
      await fetchContacts();
      const updated = contactsList.find(c => c.id === activeCRMContact.id);
      if (updated) {
        activeCRMContact = updated;
        renderChecklist();
      }
    }
  } catch (error) {
    console.error("Error adding task:", error);
  }
}

// Toggle completion status of task checkbox
async function toggleCRMTask(contactId, taskId) {
  try {
    const res = await fetch(`/api/contacts/${contactId}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    });

    if (res.ok) {
      await fetchContacts();
      // If drawer is still open, refresh it
      if (activeCRMContact && activeCRMContact.id === contactId) {
        const updated = contactsList.find(c => c.id === contactId);
        if (updated) {
          activeCRMContact = updated;
          renderChecklist();
        }
      }
    }
  } catch (error) {
    console.error("Error toggling task completion status:", error);
  }
}

// Delete contact recruiter profile
async function deleteCRMContact(contactId) {
  if (!confirm("Are you sure you want to remove this contact recruiter profile? All history records and checklist tasks will be lost.")) return;
  try {
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      closeCRMDrawer();
      await fetchContacts();
      appendLog("dashboard-console", `[SYSTEM] Removed CRM Contact: ${contactId}`);
    }
  } catch (error) {
    console.error("Error removing contact recruiter:", error);
  }
}

// AI Copilot Chat State
let chatHistory = [
  {
    role: 'assistant',
    content: 'Hello! I am your AI Copilot. I have access to your resume details, job search pipeline, and recruiter contacts.\n\nHow can I assist you today? You can choose one of the suggestions below or type a message!'
  }
];

// Send chat message
async function sendChatMessage(event) {
  if (event) event.preventDefault();
  const inputEl = document.getElementById("chat-input-field");
  const messageText = inputEl.value.trim();
  if (!messageText && !event) {
    // If triggered by chip, messageText might be empty but chip set the value
    // So let's re-read input just in case
  }
  const actualText = messageText || inputEl.value.trim();
  if (!actualText) return;

  // Clear input
  inputEl.value = "";

  // Append user message
  chatHistory.push({ role: 'user', content: actualText });
  renderChatHistory();

  // Show loading bot bubble
  const messagesContainer = document.getElementById("chat-messages-container");
  const loadingBubble = document.createElement("div");
  loadingBubble.className = "chat-message bot";
  loadingBubble.id = "chat-loading-bubble";
  loadingBubble.innerHTML = `
    <div class="chat-message-bubble">
      <span class="btn-spinner" style="border: 2px solid rgba(255,255,255,0.1); border-top: 2px solid var(--accent-purple); width: 14px; height: 14px;"></span> Thinking...
    </div>
  `;
  messagesContainer.appendChild(loadingBubble);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory })
    });

    // Remove loading bubble
    const loadingEl = document.getElementById("chat-loading-bubble");
    if (loadingEl) loadingEl.remove();

    if (!res.ok) {
      const result = await res.json();
      throw new Error(result.error || "Failed to communicate with AI");
    }

    const result = await res.json();
    chatHistory.push({ role: 'assistant', content: result.response });
    renderChatHistory();
  } catch (error) {
    console.error("Chat Error:", error);
    
    const loadingEl = document.getElementById("chat-loading-bubble");
    if (loadingEl) loadingEl.remove();

    const errBubble = document.createElement("div");
    errBubble.className = "chat-message bot";
    errBubble.innerHTML = `
      <div class="chat-message-bubble" style="border-color: var(--accent-red); color: var(--accent-red); background: rgba(239, 68, 68, 0.05);">
        ⚠️ Error: ${error.message}
      </div>
    `;
    messagesContainer.appendChild(errBubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

// Render Chat History bubbles
function renderChatHistory() {
  const container = document.getElementById("chat-messages-container");
  container.innerHTML = "";

  chatHistory.forEach(msg => {
    const bubbleWrapper = document.createElement("div");
    bubbleWrapper.className = `chat-message ${msg.role === 'assistant' ? 'bot' : 'user'}`;
    
    // Convert markdown code blocks loosely for presentation
    let formattedText = escapeHTML(msg.content);
    
    // Format markdown pre/code blocks
    formattedText = formattedText.replace(/```([\s\S]*?)```/g, (match, p1) => {
      return `<pre><code>${p1}</code></pre>`;
    });
    
    // Format inline code backticks
    formattedText = formattedText.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Format list items
    formattedText = formattedText.replace(/^\* (.*?)$/gm, '<li>$1</li>');
    formattedText = formattedText.replace(/^- (.*?)$/gm, '<li>$1</li>');
    formattedText = formattedText.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
    // clean multiple wrapped lists
    formattedText = formattedText.replace(/<\/ul>\s*<ul>/g, '');

    bubbleWrapper.innerHTML = `
      <div class="chat-message-bubble">${formattedText}</div>
    `;
    container.appendChild(bubbleWrapper);
  });
  
  container.scrollTop = container.scrollHeight;
}

// Suggestion chip clicking handler
function clickSuggestionChip(promptText) {
  const inputEl = document.getElementById("chat-input-field");
  inputEl.value = promptText;
  sendChatMessage();
}

