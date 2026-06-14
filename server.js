require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'database.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to read database
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      // Create directories and default db if not exists
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      const defaultData = { profile: {}, jobs: [], contacts: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(data);
    if (!parsed.contacts) parsed.contacts = [];
    return parsed;
  } catch (error) {
    console.error("Error reading database:", error);
    return { profile: {}, jobs: [], contacts: [] };
  }
}

// Helper to write database
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("Error writing database:", error);
    return false;
  }
}

// Regular expressions for extraction
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

// Profile routes
app.get('/api/profile', (req, res) => {
  const db = readDB();
  res.json(db.profile);
});

app.post('/api/profile', (req, res) => {
  const db = readDB();
  db.profile = req.body;
  writeDB(db);
  res.json({ success: true, profile: db.profile });
});

// Jobs routes
app.get('/api/jobs', (req, res) => {
  const db = readDB();
  res.json(db.jobs);
});

app.put('/api/jobs/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const index = db.jobs.findIndex(j => j.id === id);
  if (index !== -1) {
    db.jobs[index] = { ...db.jobs[index], ...req.body };
    writeDB(db);
    res.json({ success: true, job: db.jobs[index] });
  } else {
    res.status(404).json({ error: "Job not found" });
  }
});

app.delete('/api/jobs/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  db.jobs = db.jobs.filter(j => j.id !== id);
  writeDB(db);
  res.json({ success: true });
});

// Indeed RSS Feed Scraper
async function scrapeIndeedJobs(keyword, location, searchLogs) {
  const indeedJobs = [];
  try {
    const query = encodeURIComponent(keyword);
    const loc = encodeURIComponent(location || '');
    // Indeed public RSS feed
    const rssUrl = `https://www.indeed.com/rss?q=${query}&l=${loc}&sort=date&limit=15`;
    searchLogs.push(`[INDEED] Connecting to Indeed RSS feed...`);
    searchLogs.push(`[INDEED] URL: ${rssUrl}`);

    const response = await axios.get(rssUrl, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const $ = cheerio.load(response.data, { xmlMode: true });
    const items = $('item');

    searchLogs.push(`[INDEED] RSS feed loaded. Parsing ${items.length} job listings...`);

    items.each((i, el) => {
      if (indeedJobs.length >= 8) return false; // limit to 8 jobs

      const title = $(el).find('title').text().trim();
      const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
      const description = $(el).find('description').text().trim();
      const pubDate = $(el).find('pubDate').text().trim();

      // Extract company and location from source/description
      let company = $(el).find('source').text().trim();
      if (!company) {
        // Try to parse from title: "Job Title - Company Name"
        const dashIdx = title.lastIndexOf(' - ');
        if (dashIdx !== -1) {
          company = title.substring(dashIdx + 3).trim();
        } else {
          company = 'Indeed Company';
        }
      }

      // Clean title by removing company name suffix
      let cleanTitle = title;
      const titleDashIdx = title.lastIndexOf(' - ');
      if (titleDashIdx !== -1) {
        cleanTitle = title.substring(0, titleDashIdx).trim();
      }

      // Extract emails from description
      const emails = (description.match(EMAIL_REGEX) || []).filter(e => !e.endsWith('.png') && !e.endsWith('.jpg'));

      // Extract phones from description
      const phones = description.match(PHONE_REGEX) || [];

      // Extract location from description HTML snippet
      const descText = description.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
      const locationMatch = descText.match(/([A-Za-z ]+,\s*[A-Z]{2}(?:\s+\d{5})?)|Remote|Hybrid|Work from home/i);
      const extractedLocation = locationMatch ? locationMatch[0].trim() : (location || 'Remote');

      indeedJobs.push({
        id: `indeed_${Date.now()}_${i}`,
        title: cleanTitle || keyword,
        company: company,
        location: extractedLocation,
        description: descText.substring(0, 500),
        url: link,
        emails: emails,
        phones: phones,
        source: 'Indeed',
        status: 'Found',
        dateFound: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        notes: ''
      });

      searchLogs.push(`[INDEED] ✓ Parsed: "${cleanTitle}" at ${company} | Location: ${extractedLocation}`);
    });

    searchLogs.push(`[INDEED] Successfully extracted ${indeedJobs.length} jobs from Indeed.`);
  } catch (err) {
    searchLogs.push(`[INDEED] ⚠ RSS fetch failed: ${err.message}`);
    searchLogs.push(`[INDEED] Indeed may be blocking automated requests. Falling back to simulation mode.`);
  }
  return indeedJobs;
}

// Fallback mock job generator
function generateMockJobs(keyword, location, searchLogs) {
  const mockCompanies = ["AlphaTech", "Beta Systems", "Cyberdyne", "Delta Digital", "Echo Software", "OmniCorp", "Vesper Labs", "Apex Solutions"];
  const mockDomains = ["alphatech.com", "betasystems.co", "cyberdyne.io", "deltadigital.net", "echosoft.com", "omnicorp.org", "vesperlabs.com", "apexsolutions.co"];
  const jobsFound = [];

  searchLogs.push(`[FALLBACK] Generating curated job matches for "${keyword}"...`);

  for (let i = 0; i < 4; i++) {
    const companyIndex = Math.floor(Math.random() * mockCompanies.length);
    const companyName = mockCompanies[companyIndex];
    const companyDomain = mockDomains[companyIndex];
    const contactEmail = `careers@${companyDomain}`;
    const contactPhone = `+1-800-${Math.floor(100 + Math.random() * 899)}-${Math.floor(1000 + Math.random() * 8999)}`;
    const suffixes = ['Developer', 'Engineer', 'Consultant', 'Architect', 'Lead'];

    const jobDesc = `Exciting opportunity for a ${keyword} ${suffixes[i % 5]} at ${companyName} in ${location || 'Remote'}. Contact: ${contactEmail} | ${contactPhone}`;

    jobsFound.push({
      id: (Date.now() + i).toString(),
      title: `${keyword} ${suffixes[i % 5]}`,
      company: companyName,
      location: location || 'Remote',
      description: jobDesc,
      url: `https://jobs.${companyDomain}/careers/${i + 100}`,
      emails: [contactEmail],
      phones: [contactPhone],
      source: 'Simulated',
      status: 'Found',
      dateFound: new Date().toISOString(),
      notes: ''
    });
  }

  searchLogs.push(`[FALLBACK] Generated ${jobsFound.length} simulated matches.`);
  return jobsFound;
}

// Job Search endpoint - Now with Indeed + fallback
app.post('/api/search', async (req, res) => {
  const { keyword, location, sources } = req.body;
  const db = readDB();
  
  const searchLogs = [];
  const activeSource = sources || 'all'; // 'indeed', 'simulated', or 'all'
  searchLogs.push(`[SYSTEM] Starting job extraction for "${keyword}" in "${location || 'Any Location'}"...`);
  searchLogs.push(`[SYSTEM] Active sources: ${activeSource.toUpperCase()}`);
  
  let jobsFound = [];
  try {
    // Try Indeed RSS first if source is 'indeed' or 'all'
    if (activeSource === 'indeed' || activeSource === 'all') {
      const indeedResults = await scrapeIndeedJobs(keyword, location, searchLogs);
      jobsFound = jobsFound.concat(indeedResults);
    }

    // Add fallback/simulation if no Indeed results or if source is 'simulated'
    if (activeSource === 'simulated' || (activeSource === 'all' && jobsFound.length === 0)) {
      searchLogs.push(`[SYSTEM] Indeed returned ${jobsFound.length} results. Adding simulated data...`);
      const mockResults = generateMockJobs(keyword, location, searchLogs);
      jobsFound = jobsFound.concat(mockResults);
    }

    searchLogs.push(`\n[EXTRACTOR] Total matches found: ${jobsFound.length}`);
    jobsFound.forEach(j => {
      const src = j.source ? `[${j.source}]` : '';
      const contactStr = j.emails && j.emails.length > 0 ? j.emails.join(', ') : 'No direct email';
      searchLogs.push(`[EXTRACTOR] ${src} "${j.title}" at ${j.company} | Contacts: ${contactStr}`);
    });

  } catch (err) {
    searchLogs.push(`[ERROR] Extraction pipeline error: ${err.message}. Switching to fallback.`);
    jobsFound = generateMockJobs(keyword, location, searchLogs);
  }

  // Save new unique jobs to DB (avoid duplicate title+company)
  let newCount = 0;
  jobsFound.forEach(job => {
    const exists = db.jobs.some(j => j.title.toLowerCase() === job.title.toLowerCase() && j.company.toLowerCase() === job.company.toLowerCase());
    if (!exists) {
      db.jobs.push(job);
      newCount++;
    }
  });

  writeDB(db);
  
  res.json({
    success: true,
    newCount,
    jobs: db.jobs,
    logs: searchLogs
  });
});

// Apply / Auto-email dispatch
app.post('/api/apply', async (req, res) => {
  const { jobId, simulate } = req.body;
  const db = readDB();
  const job = db.jobs.find(j => j.id === jobId);
  
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  const profile = db.profile;
  
  // Build letter content by replacing template tags
  let emailContent = profile.coverLetterTemplate || "";
  emailContent = emailContent.replace(/{company}/g, job.company);
  emailContent = emailContent.replace(/{role}/g, job.title);
  emailContent = emailContent.replace(/{skills}/g, profile.skills || "");
  emailContent = emailContent.replace(/{name}/g, profile.name || "Applicant");
  
  const recipient = job.emails && job.emails.length > 0 ? job.emails[0] : null;
  
  if (!recipient) {
    return res.status(400).json({ error: "No email address found for this job posting." });
  }

  const logMessage = `[${new Date().toLocaleTimeString()}] Sent to ${recipient} (Subject: Application for ${job.title})`;

  if (simulate) {
    // Simulated send
    job.status = 'Applied';
    job.notes = (job.notes ? job.notes + '\n' : '') + `[SIMULATION] Email sent to ${recipient} successfully.`;
    writeDB(db);
    return res.json({ 
      success: true, 
      simulated: true, 
      recipient, 
      subject: `Application for ${job.title} - ${profile.name}`,
      body: emailContent,
      log: logMessage 
    });
  }

  // Real send via SMTP
  const smtp = profile.smtp;
  if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
    return res.status(400).json({ error: "SMTP settings are missing. Please configure them in Settings or use Simulated Apply." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: parseInt(smtp.port) || 587,
      secure: smtp.secure || false,
      auth: {
        user: smtp.user,
        pass: smtp.pass
      }
    });

    const mailOptions = {
      from: `"${profile.name}" <${smtp.user}>`,
      to: recipient,
      subject: `Application for ${job.title} - ${profile.name}`,
      text: `${emailContent}\n\n---\nResume Info:\n${profile.resumeText || ""}`
    };

    await transporter.sendMail(mailOptions);
    
    job.status = 'Applied';
    job.notes = (job.notes ? job.notes + '\n' : '') + `[REAL] Email sent to ${recipient} successfully.`;
    writeDB(db);

    res.json({ 
      success: true, 
      simulated: false, 
      recipient,
      log: logMessage 
    });
  } catch (err) {
    res.status(500).json({ error: `SMTP Transport Error: ${err.message}` });
  }
});

// CRM Contact Routes
app.get('/api/contacts', (req, res) => {
  const db = readDB();
  res.json(db.contacts || []);
});

app.post('/api/contacts', (req, res) => {
  const db = readDB();
  const newContact = {
    id: 'c_' + Date.now(),
    name: req.body.name || "Unknown Recruiter",
    email: req.body.email || "",
    phone: req.body.phone || "",
    company: req.body.company || "",
    linkedin: req.body.linkedin || "",
    notes: req.body.notes || "",
    interactions: [],
    tasks: []
  };
  
  db.contacts.push(newContact);
  writeDB(db);
  res.json({ success: true, contact: newContact });
});

app.put('/api/contacts/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const index = db.contacts.findIndex(c => c.id === id);
  if (index !== -1) {
    db.contacts[index] = { ...db.contacts[index], ...req.body };
    writeDB(db);
    res.json({ success: true, contact: db.contacts[index] });
  } else {
    res.status(404).json({ error: "Contact not found" });
  }
});

app.delete('/api/contacts/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  db.contacts = db.contacts.filter(c => c.id !== id);
  writeDB(db);
  res.json({ success: true });
});

// Interactions endpoints
app.post('/api/contacts/:id/interactions', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const contact = db.contacts.find(c => c.id === id);
  if (!contact) {
    return res.status(404).json({ error: "Contact not found" });
  }

  const newInteraction = {
    id: 'i_' + Date.now(),
    date: new Date().toISOString(),
    type: req.body.type || "Note",
    notes: req.body.notes || ""
  };

  if (!contact.interactions) contact.interactions = [];
  contact.interactions.push(newInteraction);
  writeDB(db);
  res.json({ success: true, interaction: newInteraction });
});

// Tasks endpoints
app.post('/api/contacts/:id/tasks', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const contact = db.contacts.find(c => c.id === id);
  if (!contact) {
    return res.status(404).json({ error: "Contact not found" });
  }

  const newTask = {
    id: 't_' + Date.now(),
    title: req.body.title || "New Task",
    dueDate: req.body.dueDate || "",
    completed: false
  };

  if (!contact.tasks) contact.tasks = [];
  contact.tasks.push(newTask);
  writeDB(db);
  res.json({ success: true, task: newTask });
});

app.put('/api/contacts/:id/tasks/:taskId', (req, res) => {
  const db = readDB();
  const { id, taskId } = req.params;
  const contact = db.contacts.find(c => c.id === id);
  if (!contact) {
    return res.status(404).json({ error: "Contact not found" });
  }

  const task = contact.tasks.find(t => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  task.completed = req.body.completed !== undefined ? req.body.completed : !task.completed;
  writeDB(db);
  res.json({ success: true, task });
});

// Gemini AI Chat Copilot endpoint
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  const db = readDB();
  
  const systemPrompt = `You are "AutoApply AI Copilot", a smart helper inside the user's Job search CRM dashboard.
Your goal is to help them analyze job matchings, optimize skills, suggest resume edits, draft cover letters, write professional outreach emails, and answer questions.
You have access to the user's current profile, job search list, and recruiter contacts list.
Here is the active context:
--------------------
APPLICANT PROFILE:
Name: ${db.profile.name || "Jane Doe"}
Email: ${db.profile.email || ""}
Phone: ${db.profile.phone || ""}
Skills: ${db.profile.skills || ""}
Resume context: ${db.profile.resumeText || ""}
--------------------
JOB LISTINGS IN FUNNEL:
${JSON.stringify(db.jobs || [])}
--------------------
RECRUITER CRM CONTACTS:
${JSON.stringify(db.contacts || [])}
--------------------

Instructions:
1. Always be professional, helpful, and encourage the user.
2. If asked to write an email or cover letter, tailor it to the user's profile and the specific company/role they ask about. Use their name in the sign-off.
3. Be concise and formatted in clean markdown.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "Gemini API key is not configured on the server." });
  }

  // Format messages for Gemini API
  // Contents schema: { role: 'user'|'model', parts: [{ text: '...' }] }
  const formattedContents = [];
  
  messages.forEach(msg => {
    formattedContents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    });
  });

  let modelName = 'gemini-1.5-flash';
  try {
    const listRes = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (listRes.data && listRes.data.models) {
      const modelsList = listRes.data.models.map(m => m.name);
      // Check if gemini-1.5-flash is in the list
      const hasFlash = modelsList.some(name => name.includes('gemini-1.5-flash'));
      if (!hasFlash) {
        // Find first model supporting generateContent
        const fallback = listRes.data.models.find(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));
        if (fallback) {
          modelName = fallback.name.replace('models/', '');
        }
      }
    }
  } catch (listErr) {
    console.warn("Skipping ListModels fallback, using default gemini-1.5-flash:", listErr.message);
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        contents: formattedContents,
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        }
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (response.data.candidates && response.data.candidates[0] && response.data.candidates[0].content) {
      const botResponseText = response.data.candidates[0].content.parts[0].text;
      res.json({ success: true, response: botResponseText });
    } else {
      res.status(500).json({ error: "Unexpected response format from Gemini API." });
    }
  } catch (err) {
    console.error("Gemini API Error:", err.response ? err.response.data : err.message);
    res.status(500).json({ error: `Gemini API Error: ${err.response ? JSON.stringify(err.response.data) : err.message}` });
  }
});

// Serve frontend and start server
app.listen(PORT, () => {
  console.log(`Job Search Server running on http://localhost:${PORT}`);
});

