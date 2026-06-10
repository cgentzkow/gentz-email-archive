// gentz-email-archive worker
// Password: stored as AUTH_PASSWORD env var (set in CF dashboard)

const AUTH_COOKIE = "gentz_archive_auth";
const SESSION_HOURS = 72;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function isAuthenticated(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
  if (!match) return false;
  // Simple token: base64 of "gentz:password:timestamp"
  try {
    const decoded = atob(match[1]);
    const [prefix, pw, ts] = decoded.split(":");
    if (prefix !== "gentz" || pw !== env.AUTH_PASSWORD) return false;
    const age = (Date.now() - parseInt(ts)) / 3600000;
    return age < SESSION_HOURS;
  } catch { return false; }
}

function setCookieHeader(env) {
  const token = btoa(`gentz:${env.AUTH_PASSWORD}:${Date.now()}`);
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

function loginPage(error = "") {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gentz Email Archive</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 40px; width: 360px; }
  .logo { text-align: center; margin-bottom: 28px; }
  .logo h1 { font-size: 22px; font-weight: 700; color: #58a6ff; letter-spacing: -0.5px; }
  .logo p { color: #8b949e; font-size: 13px; margin-top: 4px; }
  label { display: block; font-size: 13px; color: #8b949e; margin-bottom: 6px; }
  input[type=password] { width: 100%; padding: 10px 14px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; font-size: 15px; outline: none; }
  input[type=password]:focus { border-color: #58a6ff; box-shadow: 0 0 0 3px rgba(88,166,255,0.15); }
  button { width: 100%; padding: 10px; background: #238636; border: none; border-radius: 6px; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 16px; }
  button:hover { background: #2ea043; }
  .error { background: rgba(248,81,73,0.1); border: 1px solid rgba(248,81,73,0.4); border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #f85149; margin-bottom: 16px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <h1>📬 Email Archive</h1>
    <p>GENTZ Commercial · Private Access</p>
  </div>
  ${error ? `<div class="error">${error}</div>` : ""}
  <form method="POST" action="/login">
    <label for="pw">Password</label>
    <input type="password" id="pw" name="password" autofocus autocomplete="current-password" placeholder="Enter password">
    <button type="submit">Sign In →</button>
  </form>
</div>
</body>
</html>`, {
    status: error ? 401 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

function searchUI() {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gentz Email Archive</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 18px; font-weight: 700; color: #58a6ff; }
  header span { font-size: 12px; color: #8b949e; }
  .logout { color: #8b949e; font-size: 13px; text-decoration: none; padding: 4px 10px; border: 1px solid #30363d; border-radius: 5px; }
  .logout:hover { color: #f85149; border-color: #f85149; }
  main { max-width: 960px; margin: 0 auto; padding: 32px 24px; }
  .stats-bar { display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
  .stat { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 18px; flex: 1; min-width: 140px; }
  .stat-num { font-size: 22px; font-weight: 700; color: #58a6ff; }
  .stat-label { font-size: 12px; color: #8b949e; margin-top: 2px; }
  .search-box { display: flex; gap: 10px; margin-bottom: 20px; }
  .search-box input { flex: 1; padding: 12px 16px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; color: #e6edf3; font-size: 15px; outline: none; }
  .search-box input:focus { border-color: #58a6ff; box-shadow: 0 0 0 3px rgba(88,166,255,0.1); }
  .search-box select { padding: 12px 14px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; color: #e6edf3; font-size: 14px; cursor: pointer; }
  .search-box button { padding: 12px 24px; background: #1f6feb; border: none; border-radius: 8px; color: #fff; font-weight: 600; cursor: pointer; font-size: 14px; }
  .search-box button:hover { background: #388bfd; }
  .results { display: flex; flex-direction: column; gap: 10px; }
  .result-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
  .result-card:hover { border-color: #58a6ff44; }
  .rc-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .rc-title { font-size: 14px; font-weight: 600; color: #e6edf3; }
  .rc-meta { font-size: 12px; color: #8b949e; white-space: nowrap; }
  .rc-from { font-size: 13px; color: #58a6ff; margin-bottom: 4px; }
  .rc-body { font-size: 13px; color: #8b949e; line-height: 1.5; }
  .contact-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .contact-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px; }
  .cc-name { font-size: 14px; font-weight: 600; color: #e6edf3; }
  .cc-email { font-size: 12px; color: #58a6ff; margin-top: 2px; word-break: break-all; }
  .cc-meta { font-size: 12px; color: #8b949e; margin-top: 6px; }
  .badge { display: inline-block; background: #1f6feb22; color: #58a6ff; border-radius: 4px; padding: 2px 7px; font-size: 11px; margin-left: 6px; }
  .no-results { text-align: center; color: #8b949e; padding: 40px; font-size: 14px; }
  .loading { text-align: center; color: #58a6ff; padding: 40px; }
  .tab-bar { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid #30363d; }
  .tab { padding: 8px 16px; font-size: 13px; color: #8b949e; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab.active { color: #58a6ff; border-bottom-color: #58a6ff; font-weight: 600; }
  .pst-tag { font-size: 11px; color: #3fb950; background: #3fb95015; border: 1px solid #3fb95030; border-radius: 4px; padding: 1px 6px; }
</style>
</head>
<body>
<header>
  <h1>📬 Gentz Email Archive</h1>
  <div style="display:flex;align-items:center;gap:14px;">
    <span id="stats-summary">Loading stats…</span>
    <a href="/logout" class="logout">Sign out</a>
  </div>
</header>
<main>
  <div class="tab-bar">
    <div class="tab active" onclick="setTab('emails')">Emails</div>
    <div class="tab" onclick="setTab('contacts')">Contacts</div>
    <div class="tab" onclick="setTab('top')">Top Contacts</div>
  </div>
  <div class="search-box">
    <input type="text" id="q" placeholder="Search by name, company, subject, keywords…" onkeydown="if(event.key==='Enter')doSearch()">
    <select id="type">
      <option value="emails">Emails</option>
      <option value="contacts">Contacts</option>
    </select>
    <button onclick="doSearch()">Search</button>
  </div>
  <div class="results" id="results"></div>
</main>
<script>
let currentTab = 'emails';

async function loadStats() {
  try {
    const r = await fetch('/stats'); const d = await r.json();
    document.getElementById('stats-summary').textContent =
      (d.total_emails||0).toLocaleString() + ' emails · ' + (d.total_contacts||0).toLocaleString() + ' contacts';
  } catch(e) {}
}

function setTab(t) {
  currentTab = t;
  document.querySelectorAll('.tab').forEach((el,i) => {
    el.classList.toggle('active', ['emails','contacts','top'][i] === t);
  });
  const qEl = document.getElementById('q');
  const typeEl = document.getElementById('type');
  if (t === 'top') { loadTop(); return; }
  typeEl.value = t === 'contacts' ? 'contacts' : 'emails';
  if (qEl.value.trim()) doSearch();
  else document.getElementById('results').innerHTML = '';
}

async function doSearch() {
  const q = document.getElementById('q').value.trim();
  const type = document.getElementById('type').value;
  if (!q) return;
  const res = document.getElementById('results');
  res.innerHTML = '<div class="loading">Searching…</div>';
  try {
    const r = await fetch('/search?q=' + encodeURIComponent(q) + '&type=' + type + '&limit=50');
    const d = await r.json();
    if (d.error) { res.innerHTML = '<div class="no-results">Error: ' + d.error + '</div>'; return; }
    if (!d.results || d.results.length === 0) { res.innerHTML = '<div class="no-results">No results for "' + q + '"</div>'; return; }
    if (type === 'contacts') renderContacts(d.results);
    else renderEmails(d.results);
  } catch(e) { res.innerHTML = '<div class="no-results">Search failed. Try again.</div>'; }
}

function renderEmails(items) {
  const res = document.getElementById('results');
  res.innerHTML = items.map(e => {
    const date = e.date_sent ? new Date(e.date_sent).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}) : '';
    const pst = e.pst_file ? '<span class="pst-tag">' + e.pst_file.replace(/.*[\\/]/,'') + '</span>' : '';
    return '<div class="result-card">' +
      '<div class="rc-header"><div class="rc-title">' + esc(e.subject||'(no subject)') + '</div><div class="rc-meta">' + date + ' ' + pst + '</div></div>' +
      '<div class="rc-from">From: ' + esc(e.sender||'') + (e.sender_email ? ' &lt;' + esc(e.sender_email) + '&gt;' : '') + '</div>' +
      (e.recipients ? '<div class="rc-body" style="color:#6e7681;font-size:12px;margin-bottom:6px;">To: ' + esc(e.recipients.substring(0,120)) + '</div>' : '') +
      (e.body_excerpt ? '<div class="rc-body">' + esc(e.body_excerpt) + '</div>' : '') +
      '</div>';
  }).join('');
}

function renderContacts(items) {
  const res = document.getElementById('results');
  res.innerHTML = '<div class="contact-grid">' + items.map(c =>
    '<div class="contact-card">' +
    '<div class="cc-name">' + esc(c.display_name||'') + '<span class="badge">' + (c.email_count||0) + ' emails</span></div>' +
    '<div class="cc-email">' + esc(c.email||'') + '</div>' +
    '<div class="cc-meta">' + (c.company||c.domain||'') + (c.first_seen ? ' · ' + new Date(c.first_seen).getFullYear() + '–' + new Date(c.last_seen).getFullYear() : '') + '</div>' +
    '</div>'
  ).join('') + '</div>';
}

async function loadTop() {
  const res = document.getElementById('results');
  res.innerHTML = '<div class="loading">Loading top contacts…</div>';
  try {
    const r = await fetch('/contacts/top?limit=100');
    const d = await r.json();
    renderContacts(d.results || []);
  } catch(e) { res.innerHTML = '<div class="no-results">Failed to load.</div>'; }
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

loadStats();
</script>
</body>
</html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    // Logout
    if (path === "/logout") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/", "Set-Cookie": `${AUTH_COOKIE}=; Path=/; Max-Age=0` }
      });
    }

    // Login POST
    if (path === "/login" && request.method === "POST") {
      const formData = await request.formData();
      const pw = formData.get("password") || "";
      if (pw === env.AUTH_PASSWORD) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/", "Set-Cookie": setCookieHeader(env) }
        });
      }
      return loginPage("Incorrect password. Please try again.");
    }

    // Auth check for all other routes
    if (!isAuthenticated(request, env)) {
      if (path === "/" || path === "") return loginPage();
      // API calls get JSON 401
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Authenticated routes
    if (path === "/" || path === "") return searchUI();

    try {
      if (path === "/search") {
        const q = (url.searchParams.get("q") || "").toLowerCase();
        const type = url.searchParams.get("type") || "emails";
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
        const offset = parseInt(url.searchParams.get("offset") || "0");
        if (!q || q.length < 2) return json({ error: "Query must be at least 2 characters" }, 400);
        if (type === "contacts") {
          const { results } = await env.DB.prepare(
            "SELECT email,display_name,company,domain,email_count,first_seen,last_seen FROM contacts WHERE lower(display_name) LIKE ? OR lower(email) LIKE ? OR lower(company) LIKE ? ORDER BY email_count DESC LIMIT ? OFFSET ?"
          ).bind(`%${q}%`, `%${q}%`, `%${q}%`, limit, offset).all();
          return json({ query: q, type: "contacts", count: results.length, results });
        }
        const { results } = await env.DB.prepare(
          "SELECT e.id,e.pst_file,e.subject,e.sender,e.sender_email,e.recipients,e.date_sent,substr(e.body,1,500) as body_excerpt FROM emails e JOIN emails_fts fts ON e.id=fts.rowid WHERE emails_fts MATCH ? ORDER BY rank LIMIT ? OFFSET ?"
        ).bind(q, limit, offset).all();
        return json({ query: q, type: "emails", count: results.length, results });
      }
      if (path === "/company") {
        const name = (url.searchParams.get("name") || "").toLowerCase();
        if (!name) return json({ error: "name param required" }, 400);
        const { results: contacts } = await env.DB.prepare(
          "SELECT email,display_name,company,domain,email_count,first_seen,last_seen FROM contacts WHERE lower(company) LIKE ? OR lower(domain) LIKE ? OR lower(email) LIKE ? ORDER BY email_count DESC LIMIT 100"
        ).bind(`%${name}%`, `%${name}%`, `%${name}%`).all();
        const { results: emails } = await env.DB.prepare(
          "SELECT id,subject,sender,sender_email,recipients,date_sent,substr(body,1,300) as body_excerpt FROM emails WHERE lower(sender_email) LIKE ? OR lower(recipients) LIKE ? OR lower(sender) LIKE ? ORDER BY date_sent DESC LIMIT 50"
        ).bind(`%${name}%`, `%${name}%`, `%${name}%`).all();
        return json({ company: name, contacts, recent_emails: emails });
      }
      if (path === "/contacts/top") {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
        const domain = (url.searchParams.get("domain") || "").toLowerCase();
        let stmt = domain
          ? env.DB.prepare("SELECT email,display_name,company,domain,email_count,first_seen,last_seen FROM contacts WHERE lower(domain) LIKE ? ORDER BY email_count DESC LIMIT ?").bind(`%${domain}%`, limit)
          : env.DB.prepare("SELECT email,display_name,company,domain,email_count,first_seen,last_seen FROM contacts WHERE email LIKE '%@%.%' ORDER BY email_count DESC LIMIT ?").bind(limit);
        const { results } = await stmt.all();
        return json({ count: results.length, results });
      }
      if (path === "/stats") {
        const [ec, cc, dr, top] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) as cnt FROM emails").first(),
          env.DB.prepare("SELECT COUNT(*) as cnt FROM contacts").first(),
          env.DB.prepare('SELECT MIN(date_sent) as earliest, MAX(date_sent) as latest FROM emails WHERE date_sent != ""').first(),
          env.DB.prepare("SELECT display_name,email,email_count,company FROM contacts WHERE email LIKE '%@%.%' ORDER BY email_count DESC LIMIT 20").all()
        ]);
        return json({ total_emails: ec.cnt, total_contacts: cc.cnt, date_range: dr, top_contacts: top.results });
      }


      return json({ error: "Not found", endpoints: ["/search?q=&type=emails|contacts", "/company?name=", "/contacts/top", "/stats"] }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};

export default worker;
