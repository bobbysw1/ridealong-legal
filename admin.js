"use strict";
/* RideAlong staff console. Talks to the same server functions as the app, so every rule
   (staff-only, two-step, refund logic) is enforced on the server. All member text is inserted
   with textContent, never HTML. */
const SB_URL = "https://mkeebusqmkazqnpmaoil.supabase.co";
const SB_KEY = "sb_publishable_R9CSMrPJFZCU-ZBDmOoYdw_Ncq-5Bg-";
const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
const root = document.getElementById("root");
const TRUST_KEY = "ra_trusted_device";
const trusted = () => { try { return localStorage.getItem(TRUST_KEY) === "1"; } catch { return false; } };
const setTrust = (on) => { try { on ? localStorage.setItem(TRUST_KEY, "1") : localStorage.removeItem(TRUST_KEY); } catch {} };

/* ---------- DOM helper ---------- */
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "html") continue;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const NS = "http://www.w3.org/2000/svg";
const ICONS = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  shield: "M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4",
  chat: "M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z",
  alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  card: "M2 5h20v14H2zM2 10h20",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  server: "M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01",
  check: "M20 6 9 17l-5-5", x: "M18 6 6 18M6 6l12 12",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  refresh: "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  login: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  ban: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2",
};
function ic(name) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  const p = document.createElementNS(NS, "path"); p.setAttribute("d", ICONS[name] || ICONS.grid); s.append(p); return s;
}

/* ---------- format ---------- */
const money = (c) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format((c || 0) / 100);
const when = (x) => x ? new Date(x).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—";
const dateOnly = (x) => x ? new Date(x).toLocaleDateString("en-AU", { dateStyle: "medium" }) : "—";
const hoursAgo = (x) => x ? (Date.now() - new Date(x).getTime()) / 3600000 : Infinity;
function ago(x) { const h = hoursAgo(x); if (h === Infinity) return "never"; const m = h * 60; if (m < 1) return "just now"; if (m < 60) return `${Math.round(m)} min ago`; if (h < 48) return `${Math.round(h)} h ago`; return `${Math.round(h / 24)} days ago`; }
const initials = (n) => (n || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
function avatarColor(seed) { let h = 0; for (const ch of seed || "x") h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 52% 45%)`; }
const avatar = (name, sm) => el("div", { class: `avatar ${sm ? "sm" : ""}`, style: `background:${avatarColor(name)}` }, initials(name));
const pill = (t, tone) => el("span", { class: `pill ${tone || ""}` }, el("span", { class: "dot" }), t);
const TONES = { open: "warn", pending: "warn", in_progress: "warn", reviewing: "warn", requires_action: "warn", requested: "warn", payment_pending: "warn",
  verified: "good", approved: "good", captured: "good", paid: "good", closed: "good", resolved: "good", active: "good", accepted: "good", completed: "good",
  rejected: "bad", declined: "bad", suspended: "bad", failed: "bad", disputed: "bad", refunded: "grey", dismissed: "grey", cancelled: "grey" };
const statusPill = (s) => pill(String(s ?? "unknown").replaceAll("_", " "), TONES[s] || "grey");
let toastTimer;
function toast(msg, kind) { const t = document.getElementById("toast"); t.replaceChildren(ic(kind === "bad" ? "alert" : "check"), el("span", {}, msg)); t.className = kind || "good"; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, kind === "bad" ? 7000 : 3200); }

/* ---------- modal ---------- */
function ask({ title, text, fields = [], confirm = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById("dialog");
    const inputs = fields.map((f) => [el("label", { for: `f_${f.key}` }, f.label), f.long ? el("textarea", { id: `f_${f.key}`, placeholder: f.placeholder || "" }) : el("input", { type: "text", id: `f_${f.key}`, placeholder: f.placeholder || "", autocomplete: "off" })]);
    const err = el("div", { class: "err", hidden: true });
    const ok = el("button", { class: `btn ${danger ? "danger" : "primary"}`, type: "button" }, confirm);
    const cancel = el("button", { class: "btn", type: "button" }, "Cancel");
    let done = false; const finish = (v) => { if (done) return; done = true; dlg.close(); resolve(v); };
    ok.addEventListener("click", () => {
      const values = {};
      for (const f of fields) { const v = dlg.querySelector(`#f_${f.key}`).value.trim(); if (f.required && !v) { err.textContent = `${f.label} is required.`; err.hidden = false; return; } if (f.mustEqual && v !== f.mustEqual) { err.textContent = `Type ${f.mustEqual} exactly to continue.`; err.hidden = false; return; } values[f.key] = v; }
      finish(values);
    });
    cancel.addEventListener("click", () => finish(null));
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(null); }, { once: true });
    dlg.replaceChildren(...[el("h2", {}, title), text ? el("p", { class: "muted" }, text) : null, ...inputs.flat(), err, el("div", { class: "dlg-actions" }, cancel, ok)].filter(Boolean));
    dlg.showModal();
  });
}

/* ---------- server ---------- */
async function api(path, method, body) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("You are signed out.");
  const r = await fetch(`${SB_URL}/functions/v1/${path}`, { method, headers: { Authorization: `Bearer ${session.access_token}`, apikey: SB_KEY, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

/* ---------- state ---------- */
let D = null, view = "overview", memberQuery = "", actFilter = "all", chatSel = null, drawerId = null, meEmail = "";
let P = new Map(), B = new Map(), PAYBK = new Map(), AU = new Map();
function index() {
  P = new Map(D.profiles.map((x) => [x.id, x]));
  B = new Map(D.bookings.map((x) => [x.id, x]));
  AU = new Map((D.authUsers || []).map((u) => [u.id, u]));
  PAYBK = new Map(); for (const p of D.payments) if (!PAYBK.has(p.booking_id) || p.status === "captured") PAYBK.set(p.booking_id, p);
}
const nameOf = (id) => P.get(id)?.display_name || (AU.get(id)?.email) || "Unknown member";
const rideOf = (bid) => { const r = B.get(bid)?.rides; return Array.isArray(r) ? r[0] : r; };
const routeOf = (bid) => { const r = rideOf(bid); return r ? `${r.pickup_name} → ${r.dropoff_name}` : "Unknown trip"; };
const tripLine = (bid) => { const r = rideOf(bid); return r ? `${routeOf(bid)} · ${when(r.departure_at)}` : "Unknown trip"; };
async function reload() { D = await api("admin-dashboard", "GET"); index(); renderShell(); }

/* ---------- auth ---------- */
function authShell(...content) { root.replaceChildren(el("div", { class: "auth" }, el("div", { class: "auth-card" }, el("div", { class: "brand-row" }, el("div", { class: "logo" }, "R"), "RideAlong Staff"), content))); }
function trustCheckbox() { const c = el("input", { type: "checkbox", id: "trustdev" }); c.checked = trusted(); return el("label", { class: "check", for: "trustdev" }, c, "Trust this device — don’t ask for a code here again"); }

function showLogin(message) {
  D = null;
  const email = el("input", { type: "email", id: "email", autocomplete: "username", required: true });
  const pass = el("input", { type: "password", id: "pass", autocomplete: "current-password", required: true });
  const err = el("div", { class: "err", hidden: !message }, message || "");
  const go = el("button", { class: "btn primary block", type: "submit" }, "Sign in");
  const form = el("form", {}, el("label", { for: "email" }, "Email"), email, el("label", { for: "pass" }, "Password"), pass, err, go);
  form.addEventListener("submit", async (e) => { e.preventDefault(); go.disabled = true; err.hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value }); go.disabled = false;
    if (error) { err.textContent = "That email or password didn’t work."; err.hidden = false; return; } afterLogin(); });
  authShell(el("h1", {}, "Sign in"), el("p", { class: "muted" }, "Staff access only."), form);
  email.focus();
}
async function signOut(message) { setTrust(false); await sb.auth.signOut(); showLogin(message); }
async function afterLogin() {
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") return startConsole();
  const { data: factors } = await sb.auth.mfa.listFactors();
  const verified = factors?.totp?.[0];
  return verified ? showCode(verified.id) : showEnroll();
}
function qrImg(uri) {
  try { const q = window.qrcode(0, "M"); q.addData(uri); q.make(); return el("div", { class: "qr-wrap" }, el("img", { alt: "Two-step setup QR code", src: q.createDataURL(5, 10) })); }
  catch { return null; }
}
function showCode(factorId) {
  const code = el("input", { class: "code-input", type: "text", id: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", placeholder: "••••••" });
  const err = el("div", { class: "err", hidden: true });
  const go = el("button", { class: "btn primary block", type: "submit" }, "Verify");
  const form = el("form", {}, el("label", { for: "code" }, "6-digit code"), code, trustCheckbox(), err, go);
  form.addEventListener("submit", async (e) => { e.preventDefault(); go.disabled = true; err.hidden = true;
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.value.replace(/\D/g, "") }); go.disabled = false;
    if (error) { err.textContent = "That code didn’t work. Check your authenticator app and try again."; err.hidden = false; return; }
    setTrust(document.getElementById("trustdev").checked); startConsole(); });
  authShell(el("h1", {}, "Two-step sign-in"), el("p", { class: "muted" }, "Open your authenticator app and enter the current code for RideAlong."), form,
    el("p", { class: "small", style: "margin-top:16px" }, el("button", { class: "link", type: "button", onclick: () => signOut() }, "Use a different account")));
  code.focus();
}
async function showEnroll() {
  authShell(el("h1", {}, "Set up two-step sign-in"), el("p", { class: "muted" }, "Preparing…"));
  const { data: all } = await sb.auth.mfa.listFactors();
  for (const f of all?.all ?? []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", issuer: "RideAlong", friendlyName: `RideAlong staff ${Date.now()}` });
  if (error || !data) return authShell(el("h1", {}, "Couldn’t start setup"), el("div", { class: "err" }, error?.message || "Unknown error"),
    el("p", { class: "hint" }, "If this says two-step is disabled, turn on TOTP in Supabase → Authentication → Sign In / Providers → Multi-Factor."),
    el("p", { class: "small", style: "margin-top:12px" }, el("button", { class: "link", type: "button", onclick: () => signOut() }, "Sign out")));
  const uri = data.totp.uri || `otpauth://totp/RideAlong?secret=${data.totp.secret}&issuer=RideAlong`;
  const code = el("input", { class: "code-input", type: "text", id: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", placeholder: "••••••" });
  const err = el("div", { class: "err", hidden: true });
  const go = el("button", { class: "btn primary block", type: "submit" }, "Verify and continue");
  const form = el("form", {}, code, trustCheckbox(), err, go);
  form.addEventListener("submit", async (e) => { e.preventDefault(); go.disabled = true; err.hidden = true;
    const { error: verr } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: code.value.replace(/\D/g, "") }); go.disabled = false;
    if (verr) { err.textContent = "That code didn’t work. Check the code in your app and try again."; err.hidden = false; return; }
    setTrust(document.getElementById("trustdev").checked); startConsole(); });
  authShell(el("h1", {}, "Set up two-step sign-in"),
    el("div", { class: "enrol-steps" },
      el("div", { class: "step" }, el("div", { class: "n" }, "1"), el("div", { class: "b" }, el("strong", {}, "Scan this code"), el("div", { class: "hint" }, "Open an authenticator app on your phone — Apple Passwords, Google Authenticator or 1Password — and scan it."), qrImg(uri) || el("div", { class: "hint" }, "Enter the key below manually."))),
      el("div", { class: "step" }, el("div", { class: "n" }, "2"), el("div", { class: "b" }, el("strong", {}, "Can’t scan?"), el("div", { class: "hint" }, "Enter this setup key by hand and keep it somewhere safe as a backup:"), el("div", { class: "secret" }, data.totp.secret))),
      el("div", { class: "step" }, el("div", { class: "n" }, "3"), el("div", { class: "b" }, el("strong", {}, "Enter the 6-digit code it shows"), form))));
  code.focus();
}

/* ---------- console shell ---------- */
async function startConsole() {
  authShell(el("h1", {}, "Loading…"));
  try { D = await api("admin-dashboard", "GET"); index(); const { data: { user } } = await sb.auth.getUser(); meEmail = user?.email || ""; renderShell(); }
  catch (e) {
    if (e.message === "mfa_required") return afterLogin();
    if (e.message === "Staff access required") return signOut("This account isn’t a RideAlong staff account.");
    authShell(el("h1", {}, "Couldn’t load"), el("div", { class: "err" }, e.message), el("p", { class: "small", style: "margin-top:12px" }, el("button", { class: "link", type: "button", onclick: startConsole }, "Try again"), " · ", el("button", { class: "link", type: "button", onclick: () => signOut() }, "Sign out")));
  }
}
const isOpen = (s) => s === "open";
function counts() { return {
  refunds: D.refunds.filter((r) => isOpen(r.status)).length,
  verify: D.profiles.filter((p) => p.identity_status === "pending" || p.vehicle_review_status === "pending").length,
  support: D.contacts.filter((c) => c.status !== "closed").length,
  safety: D.reports.filter((r) => r.status === "open" || r.status === "reviewing").length + D.appeals.filter((a) => a.status === "open" || a.status === "reviewing").length,
  payoutQ: D.payouts.filter((p) => p.status !== "paid" && p.status !== "failed").length + D.payouts.filter((p) => p.status === "failed").length,
}; }
const NAV = [
  ["overview", "Overview", "grid"], ["refunds", "Refunds", "dollar", "refunds"], ["verify", "Verifications", "shield", "verify"], ["support", "Support", "chat", "support"], ["safety", "Safety", "alert", "safety"],
  ["g:Records"], ["bookings", "Bookings", "doc"], ["members", "Members", "users"], ["chats", "Chats", "message"], ["money", "Money", "card"], ["payouts", "Payouts", "dollar", "payoutQ"], ["activity", "Activity", "activity"], ["system", "System health", "server"],
];
const TITLES = { overview: ["Overview", "What needs you right now."], bookings: ["Bookings", "Look up any ride, booking or member."], payouts: ["Payouts", "Driver payouts and payout-account readiness."], refunds: ["Refunds", "Nothing is refunded until you approve it."], verify: ["Verifications", "ID and vehicle documents awaiting review."], support: ["Support", "Messages from members."], safety: ["Safety", "Reports and suspension appeals."], members: ["Members", ""], chats: ["Chats", "Ride conversations, exactly as members see them."], money: ["Money", "Card payments and driver payouts."], activity: ["Activity", "Logins, staff changes and app events."], system: ["System health", "Automatic overnight checks."] };
function renderShell() {
  const c = counts();
  const nav = el("nav", { class: "nav", "aria-label": "Sections" }, NAV.map((row) => {
    if (row[0].startsWith("g:")) return el("div", { class: "grp" }, row[0].slice(2));
    const [key, label, icon, cnt] = row;
    return el("button", { type: "button", "aria-current": view === key ? "page" : false, onclick: () => { view = key; chatSel = null; window.scrollTo(0, 0); renderShell(); } }, ic(icon), el("span", {}, label), cnt && c[cnt] ? el("span", { class: "badge" }, c[cnt]) : null);
  }));
  const side = el("aside", { class: "side" }, el("div", { class: "brand-row" }, el("div", { class: "logo" }, "R"), "RideAlong Staff"), nav,
    el("div", { class: "side-foot" }, avatar(meEmail || "Staff", true), el("div", { class: "who" }, el("div", { class: "n" }, meEmail || "Staff"), el("button", { class: "link", type: "button", onclick: () => signOut() }, "Sign out"))));
  const [title, sub] = TITLES[view] || [view, ""];
  const tools = el("div", { class: "tools" }, view === "members" ? memberSearch() : (view === "bookings" ? bookingSearch() : null),
    el("button", { class: "btn small", type: "button", onclick: async () => { try { await reload(); toast("Refreshed"); } catch (e) { toast(e.message, "bad"); } } }, ic("refresh"), "Refresh"));
  const builders = { overview, refunds, verify, support, safety, bookings, members, chats, money: moneyView, payouts: payoutsView, activity, system };
  root.replaceChildren(el("div", { class: "shell" }, side,
    el("main", { class: "main" }, el("div", { class: "topbar" }, el("div", {}, el("h1", {}, title), sub ? el("div", { class: "sub" }, sub) : null), tools),
      el("div", { class: "content" }, builders[view]()))));
}
const emptyBox = (t) => el("div", { class: "card empty" }, ic("check"), el("div", {}, t));
async function act(body, okMsg) { try { await api("admin-action", "POST", body); toast(okMsg); await reload(); } catch (e) { toast(e.message, "bad"); } }
const goView = (v) => () => { view = v; renderShell(); window.scrollTo(0, 0); };

/* ---------- Overview ---------- */
function overview() {
  const c = counts();
  const stat = (n, label, icon, target) => el("button", { class: `stat ${n ? "hot" : "calm"}`, type: "button", onclick: goView(target) }, el("div", { class: "top" }, el("div", { class: "ico" }, ic(icon)), n ? pill("needs you", "bad") : pill("clear", "good")), el("div", { class: "n" }, n), el("div", { class: "l" }, label));
  const since = Date.now() - 30 * 86400000;
  const recent = D.payments.filter((p) => new Date(p.created_at) >= since);
  const taken = recent.filter((p) => p.status === "captured" || p.status === "disputed");
  const sum = (a, k) => a.reduce((x, y) => x + (y[k] || 0), 0);
  const paidOut = D.payouts.filter((p) => p.status === "paid" && new Date(p.paid_at || p.requested_at) >= since);
  const mc = D.moneyCheck;
  const health = [];
  health.push(mc ? (mc.issue_count === 0 ? ["good", `Money check all clear · ${ago(mc.ran_at)}`] : ["bad", `Money check found ${mc.issue_count} difference(s)`]) : ["warn", "Money check hasn’t run yet"]);
  health.push(hoursAgo(D.lastBackupAt) < 30 ? ["good", `Database snapshot · ${ago(D.lastBackupAt)}`] : ["bad", `Snapshot overdue · ${ago(D.lastBackupAt)}`]);
  health.push(D.crashCount7d === 0 ? ["good", "No app crashes this week"] : ["warn", `${D.crashCount7d} crash report(s) this week`]);
  return el("div", {},
    el("div", { class: "grid cols-4" }, stat(c.refunds, "Refunds waiting", "dollar", "refunds"), stat(c.verify, "Verifications", "shield", "verify"), stat(c.support, "Support open", "chat", "support"), stat(c.safety, "Safety items", "alert", "safety")),
    el("div", { class: "section-title" }, "Last 30 days"),
    el("div", { class: "grid cols-2" },
      el("div", { class: "card pad" }, el("h2", {}, "Money"), el("dl", { class: "kv" },
        el("dt", {}, "Card payments taken"), el("dd", { class: "num" }, `${taken.length} · ${money(sum(taken, "rider_total_cents"))}`),
        el("dt", {}, "RideAlong fees"), el("dd", { class: "num" }, money(sum(taken, "ridealong_fee_cents"))),
        el("dt", {}, "Owed to drivers"), el("dd", { class: "num" }, money(sum(taken, "driver_amount_cents"))),
        el("dt", {}, "Payouts sent"), el("dd", { class: "num" }, `${paidOut.length} · ${money(sum(paidOut, "amount_cents"))}`),
        el("dt", {}, "Refunded"), el("dd", { class: "num" }, String(recent.filter((p) => p.status === "refunded").length)))),
      el("div", { class: "card pad" }, el("h2", {}, "System health"), health.map(([t, m]) => el("p", { style: "margin:8px 0" }, pill(t === "good" ? "OK" : t === "warn" ? "Check" : "Act", t), " ", m)),
        el("button", { class: "btn small", type: "button", style: "margin-top:8px", onclick: goView("system") }, "Details"))));
}

/* ---------- Refunds ---------- */
function refunds() {
  const open = D.refunds.filter((r) => isOpen(r.status)), done = D.refunds.filter((r) => !isOpen(r.status)).slice(0, 25);
  const card = (r, actionable) => { const pay = PAYBK.get(r.booking_id);
    return el("div", { class: "item" },
      el("div", { class: "top" }, el("div", { class: "who-row" }, avatar(nameOf(r.requester_id)), el("div", {}, el("div", { class: "who" }, nameOf(r.requester_id)), el("div", { class: "sub" }, tripLine(r.booking_id)))), el("div", { style: "display:flex;gap:8px;align-items:center" }, statusPill(r.status), pay ? el("strong", { class: "num" }, money(pay.rider_total_cents)) : null)),
      el("div", { class: "body-box" }, r.reason || "No reason given."), el("div", { class: "sub" }, `Requested ${when(r.created_at)}${r.staff_reason ? ` · Staff note: ${r.staff_reason}` : ""}`),
      actionable ? el("div", { class: "actions" },
        el("button", { class: "btn good", type: "button", onclick: async () => { const v = await ask({ title: "Approve this refund?", text: `${money(pay?.rider_total_cents)} goes back to ${nameOf(r.requester_id)}’s card through Stripe now. This can’t be undone.`, fields: [{ key: "reason", label: "Note (optional)", long: true }], confirm: "Approve & refund" }); if (v) act({ action: "refund", id: r.id, status: "approved", reason: v.reason }, "Refund approved"); } }, ic("check"), "Approve refund"),
        el("button", { class: "btn danger", type: "button", onclick: async () => { const v = await ask({ title: "Decline this refund?", text: "The member is told this reason.", fields: [{ key: "reason", label: "Reason", long: true, required: true }], confirm: "Decline", danger: true }); if (v) act({ action: "refund", id: r.id, status: "declined", reason: v.reason }, "Refund declined"); } }, "Decline")) : null); };
  return el("div", {}, el("div", { class: "card" }, open.length ? open.map((r) => card(r, true)) : el("div", { class: "empty" }, ic("check"), el("div", {}, "No refunds waiting."))),
    done.length ? [el("div", { class: "section-title" }, "Recently decided"), el("div", { class: "card" }, done.map((r) => card(r, false)))] : null);
}

/* ---------- Verifications ---------- */
async function openDoc(profileId, kind) { const w = window.open("", "_blank");
  try { const { url } = await api("admin-document-url", "POST", { profileId, kind }); if (!url) { w?.close(); return toast("No document uploaded.", "bad"); } if (w) { w.opener = null; w.location = url; } else toast("Allow pop-ups to view documents.", "bad"); }
  catch (e) { w?.close(); toast(e.message, "bad"); } }
function verify() {
  const pend = D.profiles.filter((p) => p.identity_status === "pending" || p.vehicle_review_status === "pending");
  const sec = (p, kind) => { const status = kind === "identity" ? p.identity_status : p.vehicle_review_status, path = kind === "identity" ? p.identity_document_path : p.vehicle_document_path;
    if (status !== "pending") return null; const label = kind === "identity" ? "Identity document" : "Vehicle document";
    return el("div", { class: "item" },
      el("div", { class: "top" }, el("div", { class: "who-row" }, avatar(p.display_name), el("div", {}, el("div", { class: "who" }, `${p.display_name} · ${label}`), el("div", { class: "sub" }, `Member since ${dateOnly(p.created_at)}`))), statusPill(status)),
      el("div", { class: "actions" },
        el("button", { class: "btn primary", type: "button", disabled: !path, onclick: () => openDoc(p.id, kind) }, ic("doc"), path ? "View document" : "No document"),
        el("button", { class: "btn good", type: "button", onclick: async () => { if (await ask({ title: `Approve ${label.toLowerCase()}?`, text: `${p.display_name} is told it was approved.`, confirm: "Approve" })) act({ action: "review_verification", profileId: p.id, kind, status: "verified" }, "Approved"); } }, "Approve"),
        el("button", { class: "btn", type: "button", onclick: async () => { const v = await ask({ title: "Ask for a better document", fields: [{ key: "reason", label: "What should they fix?", long: true, required: true }], confirm: "Send request" }); if (v) act({ action: "request_documents", profileId: p.id, kind, reason: v.reason }, "Request sent"); } }, "Ask again"),
        el("button", { class: "btn danger", type: "button", onclick: async () => { const v = await ask({ title: "Reject document?", fields: [{ key: "reason", label: "Reason", long: true, required: true }], confirm: "Reject", danger: true }); if (v) act({ action: "review_verification", profileId: p.id, kind, status: "rejected", reason: v.reason }, "Rejected"); } }, "Reject"))); };
  const items = pend.flatMap((p) => [sec(p, "identity"), sec(p, "vehicle")]).filter(Boolean);
  return el("div", { class: "card" }, items.length ? items : el("div", { class: "empty" }, ic("check"), el("div", {}, "Nothing waiting for review.")));
}

/* ---------- Support ---------- */
function support() {
  const list = [...D.contacts].sort((a, b) => (a.status === "closed") - (b.status === "closed"));
  const card = (c) => { const reply = el("textarea", { placeholder: "Write a reply…" }); reply.value = c.staff_reply || "";
    const send = (status, msg) => () => { if (!reply.value.trim() && status === "in_progress") return toast("Write a reply first.", "bad"); act({ action: "contact", id: c.id, status, reply: reply.value.trim() }, msg); };
    return el("div", { class: "item" },
      el("div", { class: "top" }, el("div", { class: "who-row" }, avatar(nameOf(c.sender_id)), el("div", {}, el("div", { class: "who" }, c.subject), el("div", { class: "sub" }, `${nameOf(c.sender_id)} · ${when(c.created_at)}`))), statusPill(c.status)),
      el("div", { class: "body-box" }, c.body),
      c.status !== "closed" ? [reply, el("div", { class: "actions" }, el("button", { class: "btn primary", type: "button", onclick: send("in_progress", "Reply sent") }, "Send reply"), el("button", { class: "btn", type: "button", onclick: send("closed", "Reply & close") }, "Reply & close"))] : (c.staff_reply ? el("div", { class: "sub" }, `Reply sent: ${c.staff_reply}`) : null)); };
  return el("div", { class: "card" }, list.length ? list.map(card) : el("div", { class: "empty" }, ic("chat"), el("div", {}, "No support messages.")));
}

/* ---------- Safety ---------- */
function safety() {
  const reports = [...D.reports].sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1)).slice(0, 60);
  const rcard = (r) => el("div", { class: "item" },
    el("div", { class: "top" }, el("div", { class: "who-row" }, avatar(nameOf(r.subject_id)), el("div", {}, el("div", { class: "who" }, `${nameOf(r.reporter_id)} reported ${nameOf(r.subject_id)}`), el("div", { class: "sub" }, when(r.created_at)))), statusPill(r.status)),
    el("div", { class: "body-box" }, r.reason),
    (r.status === "open" || r.status === "reviewing") ? el("div", { class: "actions" },
      el("button", { class: "btn good", type: "button", onclick: async () => { const v = await ask({ title: "Resolve report", fields: [{ key: "reason", label: "Notes (optional)", long: true }], confirm: "Resolve" }); if (v) act({ action: "report", id: r.id, status: "resolved", reason: v.reason }, "Resolved"); } }, "Resolve"),
      el("button", { class: "btn", type: "button", onclick: async () => { const v = await ask({ title: "Dismiss report", fields: [{ key: "reason", label: "Notes (optional)", long: true }], confirm: "Dismiss" }); if (v) act({ action: "report", id: r.id, status: "dismissed", reason: v.reason }, "Dismissed"); } }, "Dismiss"),
      el("button", { class: "btn danger", type: "button", onclick: () => suspend(r.subject_id) }, ic("ban"), "Suspend")) : null);
  const appeals = D.appeals.slice(0, 40);
  const acard = (a) => el("div", { class: "item" },
    el("div", { class: "top" }, el("div", { class: "who-row" }, avatar(nameOf(a.requester_id)), el("div", {}, el("div", { class: "who" }, `Appeal from ${nameOf(a.requester_id)}`), el("div", { class: "sub" }, when(a.created_at)))), statusPill(a.status)),
    el("div", { class: "body-box" }, a.reason),
    (a.status === "open" || a.status === "reviewing") && P.get(a.profile_id)?.account_status === "suspended" ? el("div", { class: "actions" }, el("button", { class: "btn good", type: "button", onclick: () => restore(a.profile_id) }, "Restore account")) : null);
  return el("div", {}, el("div", { class: "card" }, reports.length ? reports.map(rcard) : el("div", { class: "empty" }, ic("check"), el("div", {}, "No reports."))),
    el("div", { class: "section-title" }, "Appeals"), el("div", { class: "card" }, appeals.length ? appeals.map(acard) : el("div", { class: "empty" }, ic("check"), el("div", {}, "No appeals."))));
}
async function suspend(id) { const v = await ask({ title: `Suspend ${nameOf(id)}?`, text: "They can’t book or offer rides while suspended, and are told this reason. You can restore them later.", fields: [{ key: "reason", label: "Reason", long: true, required: true }], confirm: "Suspend", danger: true }); if (v) act({ action: "block", profileId: id, reason: v.reason }, "Account suspended"); }
async function restore(id) { if (await ask({ title: `Restore ${nameOf(id)}?`, text: "They can sign in and use RideAlong again.", confirm: "Restore" })) act({ action: "restore_account", profileId: id }, "Account restored"); }
async function ban(id) { const v = await ask({ title: `Permanently ban ${nameOf(id)}?`, text: "They can never sign in again with this email. This is the strongest action.", fields: [{ key: "reason", label: "Reason", long: true, required: true }, { key: "c", label: "Type BAN to confirm", mustEqual: "BAN" }], confirm: "Ban permanently", danger: true }); if (v) act({ action: "permanent_ban", profileId: id, reason: v.reason }, "Account banned"); }

/* ---------- Members ---------- */
function memberSearch() { const s = el("input", { type: "search", placeholder: "Search members", "aria-label": "Search members" }); s.value = memberQuery; s.addEventListener("input", () => { memberQuery = s.value; const host = document.getElementById("mtable"); if (host) drawMembers(host); }); return s; }
function drawMembers(host) {
  const q = memberQuery.trim().toLowerCase();
  const rows = D.profiles.filter((p) => { const au = AU.get(p.id); return !q || p.display_name.toLowerCase().includes(q) || (au?.email || "").toLowerCase().includes(q); }).slice(0, 300);
  host.replaceChildren(el("table", {}, el("thead", {}, el("tr", {}, ["Member", "Identity", "Vehicle", "Account", "Last sign-in", ""].map((h) => el("th", {}, h)))),
    el("tbody", {}, rows.length ? rows.map((p) => { const au = AU.get(p.id) || {};
      return el("tr", {}, el("td", {}, el("button", { class: "who-row", style: "border:0;background:none;cursor:pointer;padding:0", onclick: () => openMember(p.id) }, avatar(p.display_name, true), el("div", { style: "text-align:left" }, el("div", { class: "who", style: "font-size:13.5px" }, p.display_name), el("div", { class: "sub" }, au.email || "—")))),
        el("td", {}, statusPill(p.identity_status)), el("td", {}, p.vehicle_review_status ? statusPill(p.vehicle_review_status) : el("span", { class: "faint" }, "—")),
        el("td", {}, statusPill(p.account_status || "active")), el("td", { class: "sub" }, au.last_sign_in_at ? ago(au.last_sign_in_at) : "never"),
        el("td", { class: "r" }, el("button", { class: "btn small", type: "button", onclick: () => openMember(p.id) }, "View"))); }) : el("tr", {}, el("td", { colspan: "6", class: "empty" }, "No members match.")))));
}
function members() { const host = el("div", { class: "table-wrap", id: "mtable" }); drawMembers(host); return el("div", {}, el("div", { class: "sub", style: "margin-bottom:12px" }, `${D.profiles.length} accounts`), host, drawerId ? memberDrawer() : null); }
function openMember(id) { drawerId = id; renderShell(); }
function closeDrawer() { drawerId = null; renderShell(); }
function memberDrawer() {
  const p = P.get(drawerId); if (!p) return null; const au = AU.get(drawerId) || {};
  const theirBookings = D.bookings.filter((b) => b.rider_id === drawerId);
  const theirPayments = D.payments.filter((x) => theirBookings.some((b) => b.id === x.booking_id));
  const spent = theirPayments.filter((x) => x.status === "captured").reduce((a, x) => a + x.rider_total_cents, 0);
  return el("div", {}, el("div", { class: "drawer-bg", onclick: closeDrawer }),
    el("div", { class: "drawer" },
      el("div", { style: "display:flex;justify-content:space-between;align-items:flex-start" }, el("div", { class: "who-row" }, avatar(p.display_name), el("div", {}, el("h2", {}, p.display_name), el("div", { class: "sub" }, au.email || "—"))), el("button", { class: "btn small", type: "button", onclick: closeDrawer }, "Close")),
      el("div", { class: "section-title" }, "Account"),
      el("dl", { class: "kv" }, el("dt", {}, "Identity"), el("dd", {}, statusPill(p.identity_status)), el("dt", {}, "Vehicle"), el("dd", {}, p.vehicle_review_status ? statusPill(p.vehicle_review_status) : "—"), el("dt", {}, "Status"), el("dd", {}, statusPill(p.account_status || "active")),
        el("dt", {}, "Email confirmed"), el("dd", {}, au.email_confirmed ? "Yes" : "No"), el("dt", {}, "Joined"), el("dd", {}, dateOnly(p.created_at)), el("dt", {}, "Last sign-in"), el("dd", {}, when(au.last_sign_in_at)),
        el("dt", {}, "Bookings"), el("dd", {}, String(theirBookings.length)), el("dt", {}, "Spent (captured)"), el("dd", { class: "num" }, money(spent))),
      el("div", { class: "section-title" }, "Trust signals"),
      (function(){ const t = trustSignals(p.id); return el("dl", { class: "kv" },
        el("dt", {}, "Rating"), el("dd", {}, t.avg == null ? "No reviews yet" : `${t.avg.toFixed(1)} ★ (${t.reviewCount})`),
        el("dt", {}, "Completed trips"), el("dd", {}, String(t.completed)),
        el("dt", {}, "Cancellations"), el("dd", {}, String(t.cancelled)),
        el("dt", {}, "Reports against"), el("dd", {}, t.reportsAgainst ? pill(String(t.reportsAgainst), "bad") : "0")); })(),
      el("div", { class: "section-title" }, "Documents"),
      el("div", { class: "actions" }, el("button", { class: "btn", type: "button", disabled: !p.identity_document_path, onclick: () => openDoc(p.id, "identity") }, ic("doc"), "Identity"), el("button", { class: "btn", type: "button", disabled: !p.vehicle_document_path, onclick: () => openDoc(p.id, "vehicle") }, ic("doc"), "Vehicle")),
      el("div", { class: "section-title" }, "Actions"),
      el("div", { class: "actions" },
        p.account_status === "suspended" ? el("button", { class: "btn good", type: "button", onclick: () => restore(p.id) }, "Restore") : el("button", { class: "btn danger", type: "button", onclick: () => suspend(p.id) }, "Suspend"),
        el("button", { class: "btn danger", type: "button", onclick: () => ban(p.id) }, ic("ban"), "Ban"),
        el("button", { class: "btn", type: "button", onclick: async () => { await act({ action: "women_only_eligibility", profileId: p.id, eligible: !p.women_only_eligible }, "Updated"); } }, p.women_only_eligible ? "Remove women-only" : "Allow women-only"))));
}


/* ---------- trust signals ---------- */
function trustSignals(memberId) {
  const asSubjectReviews = D.reviews.filter((r) => r.subject_id === memberId);
  const avg = asSubjectReviews.length ? (asSubjectReviews.reduce((a, r) => a + r.rating, 0) / asSubjectReviews.length) : null;
  const myBookings = D.bookings.filter((b) => b.rider_id === memberId);
  const completed = myBookings.filter((b) => b.status === "completed").length;
  const cancelled = myBookings.filter((b) => b.status === "cancelled").length;
  const reportsAgainst = D.reports.filter((r) => r.subject_id === memberId).length;
  return { avg, reviewCount: asSubjectReviews.length, completed, cancelled, bookings: myBookings.length, reportsAgainst };
}
const eventsFor = (bid) => (D.bookingEvents || []).filter((e) => e.booking_id === bid).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

/* ---------- Bookings lookup ---------- */
let bookingQuery = "", bookingSel = null;
function bookingSearch() { const s = el("input", { type: "search", placeholder: "Search route, member or status", "aria-label": "Search bookings" }); s.value = bookingQuery; s.addEventListener("input", () => { bookingQuery = s.value; const h = document.getElementById("btable"); if (h) drawBookings(h); }); return s; }
function drawBookings(host) {
  const q = bookingQuery.trim().toLowerCase();
  const rows = D.bookings.filter((b) => { const hay = `${nameOf(b.rider_id)} ${routeOf(b.id)} ${b.status} ${b.payment_mode || ""}`.toLowerCase(); return !q || hay.includes(q); }).slice(0, 300);
  host.replaceChildren(el("table", {}, el("thead", {}, el("tr", {}, ["Trip", "Rider", "Departs", "Seats", "Payment", "Status", ""].map((h) => el("th", {}, h)))),
    el("tbody", {}, rows.length ? rows.map((b) => { const r = rideOf(b.id);
      return el("tr", {}, el("td", { class: "wrap" }, routeOf(b.id)), el("td", {}, nameOf(b.rider_id)), el("td", { class: "sub" }, r ? when(r.departure_at) : "—"), el("td", { class: "num" }, String(b.seats)), el("td", {}, b.payment_mode === "direct" ? "Fee only" : (b.payment_mode || "—")), el("td", {}, statusPill(b.status)), el("td", { class: "r" }, el("button", { class: "btn small", type: "button", onclick: () => { bookingSel = b.id; renderShell(); } }, "History"))); }) : el("tr", {}, el("td", { colspan: "7", class: "empty" }, "No bookings match.")))));
}
function bookings() { const host = el("div", { class: "table-wrap", id: "btable" }); drawBookings(host); return el("div", {}, el("div", { class: "sub", style: "margin-bottom:12px" }, `${D.bookings.length} bookings`), host, bookingSel ? bookingDrawer() : null); }
function bookingDrawer() {
  const b = B.get(bookingSel); if (!b) return null; const r = rideOf(bookingSel); const pay = PAYBK.get(bookingSel); const evs = eventsFor(bookingSel);
  return el("div", {}, el("div", { class: "drawer-bg", onclick: () => { bookingSel = null; renderShell(); } }),
    el("div", { class: "drawer" },
      el("div", { style: "display:flex;justify-content:space-between;align-items:flex-start" }, el("div", {}, el("h2", {}, routeOf(bookingSel)), el("div", { class: "sub" }, r ? when(r.departure_at) : "")), el("button", { class: "btn small", type: "button", onclick: () => { bookingSel = null; renderShell(); } }, "Close")),
      el("div", { class: "section-title" }, "Booking"),
      el("dl", { class: "kv" }, el("dt", {}, "Rider"), el("dd", {}, nameOf(b.rider_id)), el("dt", {}, "Driver"), el("dd", {}, nameOf(r?.driver_id)), el("dt", {}, "Status"), el("dd", {}, statusPill(b.status)), el("dt", {}, "Seats"), el("dd", {}, String(b.seats)), el("dt", {}, "Payment mode"), el("dd", {}, b.payment_mode === "direct" ? "Fee only" : (b.payment_mode || "—")), el("dt", {}, "Booked"), el("dd", {}, when(b.created_at))),
      pay ? [el("div", { class: "section-title" }, "Payment"), el("dl", { class: "kv" }, el("dt", {}, "Total"), el("dd", { class: "num" }, money(pay.rider_total_cents)), el("dt", {}, "RideAlong fee"), el("dd", { class: "num" }, money(pay.ridealong_fee_cents)), el("dt", {}, "Driver"), el("dd", { class: "num" }, money(pay.driver_amount_cents)), el("dt", {}, "State"), el("dd", {}, statusPill(pay.status)), el("dt", {}, "Stripe ref"), el("dd", { class: "small", style: "word-break:break-all;font-family:ui-monospace,monospace" }, pay.provider_payment_id || "—"))] : null,
      el("div", { class: "section-title" }, "Event history"),
      evs.length ? el("div", { class: "feed" }, [...evs].reverse().map((e) => el("div", { class: "event" }, el("div", { class: "ic" }, ic("clock")), el("div", { class: "txt" }, el("div", { class: "t" }, `${e.from_status || "—"} → ${e.to_status}`), e.reason ? el("div", { class: "d" }, e.reason) : null), el("div", { class: "when" }, ago(e.created_at))))) : el("div", { class: "sub" }, "No recorded events for this booking."),
      el("div", { class: "section-title" }, "Chat"),
      D.messages.some((m) => m.booking_id === bookingSel) ? el("button", { class: "btn", type: "button", onclick: () => { chatSel = b.id; bookingSel = null; view = "chats"; renderShell(); } }, ic("message"), "Open conversation") : el("div", { class: "sub" }, "No messages.")));
}

/* ---------- Payouts queue ---------- */
function payoutsView() {
  const accounts = new Map((D.payoutAccounts || []).map((a) => [a.id, a]));
  const failed = D.payouts.filter((p) => p.status === "failed");
  const awaiting = D.payouts.filter((p) => p.status !== "paid" && p.status !== "failed");
  const tbl = (rows, empty) => { const body = rows.length ? rows : [el("tr", {}, el("td", { colspan: "6", class: "empty" }, empty))];
    return el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["Requested", "Driver", "Amount", "Method", "Status", "Reference"].map((h) => el("th", {}, h)))), el("tbody", {}, body))); };
  const row = (p) => el("tr", {}, el("td", { class: "sub" }, when(p.requested_at)), el("td", {}, nameOf(p.driver_id)), el("td", { class: "num" }, money(p.amount_cents)), el("td", {}, p.method || "standard"), el("td", {}, statusPill(p.status)), el("td", { class: "small", style: "font-family:ui-monospace,monospace" }, p.provider_transfer_id || (p.card_last4 ? `card ••${p.card_last4}` : "—")));
  const readyRows = (D.payoutAccounts || []).map((a) => el("tr", {}, el("td", {}, nameOf(a.id)), el("td", {}, a.onboarding_complete ? pill("Ready", "good") : pill("Incomplete", "warn")), el("td", {}, a.has_payout_card ? `Debit ••${a.card_last4 || "?"}` : "Bank only"), el("td", {}, a.has_connected_account ? "Yes" : "No")));
  return el("div", {},
    failed.length ? el("div", { class: "banner bad" }, ic("alert"), `${failed.length} driver payout(s) failed — investigate in Stripe → Connect.`) : null,
    el("div", { class: "section-title" }, `Awaiting payout (${awaiting.length})`), tbl(awaiting.map(row), "No payouts awaiting."),
    failed.length ? [el("div", { class: "section-title" }, "Failed payouts"), tbl(failed.map(row), "None")] : null,
    el("div", { class: "section-title" }, "Payout accounts"),
    el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["Driver", "Onboarding", "Payout method", "Connected"].map((h) => el("th", {}, h)))), el("tbody", {}, readyRows.length ? readyRows : [el("tr", {}, el("td", { colspan: "4", class: "empty" }, "No drivers have set up payouts yet."))]))));
}

/* ---------- Chats ---------- */
function chats() {
  const byBooking = new Map();
  for (const m of D.messages) { if (!byBooking.has(m.booking_id)) byBooking.set(m.booking_id, []); byBooking.get(m.booking_id).push(m); }
  const list = [...byBooking.entries()].sort((a, b) => new Date(b[1][0].created_at) - new Date(a[1][0].created_at));
  if (!list.length) return el("div", { class: "card empty" }, ic("message"), el("div", {}, "No messages yet."));
  if (!chatSel || !byBooking.has(chatSel)) chatSel = list[0][0];
  const listEl = el("div", { class: "card chat-list" }, list.slice(0, 80).map(([bid, msgs]) => el("button", { type: "button", "aria-current": bid === chatSel ? "true" : "false", onclick: () => { chatSel = bid; renderShell(); } }, avatar(nameOf(B.get(bid)?.rider_id), true), el("div", { style: "min-width:0" }, el("div", { class: "n" }, routeOf(bid)), el("div", { class: "sub" }, `${nameOf(B.get(bid)?.rider_id)} · ${msgs.length} msg`)))));
  const msgs = [...byBooking.get(chatSel)].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const ride = rideOf(chatSel); const driverId = ride?.driver_id; const riderId = B.get(chatSel)?.rider_id;
  const panel = el("div", { class: "card chat-panel" },
    el("div", { class: "chat-head" }, el("div", { class: "who" }, routeOf(chatSel)), el("div", { class: "sub" }, `${nameOf(riderId)} (rider) · ${nameOf(driverId)} (driver)`)),
    el("div", { class: "chat-scroll" }, msgs.length ? msgs.map((m) => { const mine = m.sender_id === driverId;
      return el("div", { class: `bubble-row ${mine ? "right" : "left"}` }, el("div", { class: "bubble" }, el("div", { class: "meta" }, `${nameOf(m.sender_id)} · ${when(m.created_at)}`), el("div", {}, m.body))); }) : el("div", { class: "who-hint" }, "No messages in this conversation.")));
  return el("div", { class: "chat-grid" }, listEl, panel);
}

/* ---------- Money ---------- */
function moneyView() {
  const pays = D.payments.slice(0, 200), payouts = D.payouts.slice(0, 120);
  const tbl = (cols, rows, empty) => {
    const body = rows.length ? rows : [el("tr", {}, el("td", { colspan: String(cols.length), class: "empty" }, empty))];
    return el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, cols.map((c) => el("th", { class: c.r ? "r" : "" }, c.h)))), el("tbody", {}, body)));
  };
  return el("div", {},
    el("div", { class: "section-title" }, "Card payments"),
    tbl([{ h: "Date" }, { h: "Rider" }, { h: "Trip" }, { h: "Mode" }, { h: "Total", r: 1 }, { h: "Fee", r: 1 }, { h: "Driver", r: 1 }, { h: "Status" }],
      pays.map((p) => el("tr", {}, el("td", { class: "sub" }, when(p.created_at)), el("td", {}, nameOf(B.get(p.booking_id)?.rider_id)), el("td", {}, routeOf(p.booking_id)), el("td", {}, p.mode === "direct" ? "Fee only" : "In-app"), el("td", { class: "r num" }, money(p.rider_total_cents)), el("td", { class: "r num" }, money(p.ridealong_fee_cents)), el("td", { class: "r num" }, money(p.driver_amount_cents)), el("td", {}, statusPill(p.status)))), "No payments yet."),
    el("div", { class: "section-title" }, "Driver payouts"),
    tbl([{ h: "Requested" }, { h: "Driver" }, { h: "Amount", r: 1 }, { h: "Fee", r: 1 }, { h: "Status" }, { h: "Paid" }],
      payouts.map((p) => el("tr", {}, el("td", { class: "sub" }, when(p.requested_at)), el("td", {}, nameOf(p.driver_id)), el("td", { class: "r num" }, money(p.amount_cents)), el("td", { class: "r num" }, money(p.withdrawal_fee_cents)), el("td", {}, statusPill(p.status)), el("td", { class: "sub" }, when(p.paid_at)))), "No payouts yet."));
}

/* ---------- Activity (360) ---------- */
function activityEvents() {
  const out = [];
  for (const a of D.audit || []) {
    const staff = a.action.startsWith("staff_"); const sys = !staff;
    let tone = "info", title = a.action.replace(/^staff_/, "").replaceAll("_", " ");
    if (/dispute|payout_problem|permanent_ban|block|reject/.test(a.action)) tone = "bad";
    else if (/refund|restore|verif|approve|snapshot/.test(a.action)) tone = "good";
    else if (/crash|request_documents/.test(a.action)) tone = "warn";
    const who = a.actor_id ? nameOf(a.actor_id) : (a.metadata?.by || "System");
    const target = a.entity_id && P.get(a.entity_id) ? ` · ${nameOf(a.entity_id)}` : "";
    const detail = [a.metadata?.status && `→ ${a.metadata.status}`, a.metadata?.reason, a.metadata?.detail, a.metadata?.amount_cents != null && money(a.metadata.amount_cents)].filter(Boolean).join(" · ");
    out.push({ cat: staff ? "changes" : "system", tone, icon: staff ? "shield" : "server", title: `${title}${target}`, sub: `${who}${detail ? " — " + detail : ""}`, at: a.created_at });
  }
  for (const u of D.authUsers || []) if (u.last_sign_in_at) out.push({ cat: "logins", tone: "info", icon: "login", title: `${(P.get(u.id)?.display_name) || u.email} signed in`, sub: u.email, at: u.last_sign_in_at });
  for (const e of D.analytics || []) out.push({ cat: "app", tone: "info", icon: "activity", title: e.event.replaceAll("_", " "), sub: `${nameOf(e.user_id)}${e.props && Object.keys(e.props).length ? " · " + Object.entries(e.props).map(([k, v]) => `${k}: ${v}`).join(", ") : ""}`, at: e.created_at });
  return out.sort((a, b) => new Date(b.at) - new Date(a.at));
}
function activity() {
  const all = activityEvents();
  const FILTERS = [["all", "Everything"], ["logins", "Logins"], ["changes", "Staff changes"], ["app", "App events"], ["system", "System"]];
  const shown = all.filter((e) => actFilter === "all" || e.cat === actFilter).slice(0, 250);
  const filters = el("div", { class: "filters" }, FILTERS.map(([k, l]) => el("button", { class: "chip", type: "button", "aria-pressed": actFilter === k ? "true" : "false", onclick: () => { actFilter = k; renderShell(); } }, l)));
  const feed = el("div", { class: "card pad" }, shown.length ? el("div", { class: "feed" }, shown.map((e) => el("div", { class: `event is-${e.tone}` }, el("div", { class: "ic" }, ic(e.icon)), el("div", { class: "txt" }, el("div", { class: "t" }, e.title), el("div", { class: "d" }, e.sub)), el("div", { class: "when" }, ago(e.at))))) : el("div", { class: "empty" }, ic("activity"), el("div", {}, "No activity in this filter yet.")));
  return el("div", {}, filters, feed);
}

/* ---------- System ---------- */
function system() {
  const mc = D.moneyCheck;
  const banner = !mc ? el("div", { class: "banner warn" }, ic("clock"), "The nightly money check hasn’t run yet. It runs at 2:30am Brisbane time.")
    : mc.issue_count === 0 ? el("div", { class: "banner good" }, ic("check"), `Money check: Stripe and the database agree · ${ago(mc.ran_at)}.`)
      : el("div", { class: "banner bad" }, ic("alert"), `Money check found ${mc.issue_count} difference(s) · ${ago(mc.ran_at)}.`);
  return el("div", {}, banner,
    mc ? el("div", { class: "card pad" }, el("h2", {}, "Last money check"), el("dl", { class: "kv" },
      el("dt", {}, "Ran"), el("dd", {}, when(mc.ran_at)), el("dt", {}, "Payments checked"), el("dd", { class: "num" }, mc.payments_checked), el("dt", {}, "Payouts checked"), el("dd", { class: "num" }, mc.payouts_checked),
      el("dt", {}, "Stripe balance"), el("dd", { class: "num" }, mc.stripe_balance_cents == null ? "—" : money(mc.stripe_balance_cents)), el("dt", {}, "Owed to drivers"), el("dd", { class: "num" }, mc.owed_to_drivers_cents == null ? "—" : money(mc.owed_to_drivers_cents))),
      (mc.issues || []).length ? el("div", { style: "margin-top:12px" }, mc.issues.map((i) => el("p", { style: "margin:6px 0" }, pill(i.severity, i.severity === "critical" ? "bad" : "warn"), " ", el("strong", {}, i.kind.replaceAll("_", " ")), " — ", i.detail))) : null) : null,
    el("div", { class: "section-title" }, "Database snapshot"),
    el("div", { class: "card pad" }, hoursAgo(D.lastBackupAt) < 30 ? el("p", {}, pill("OK", "good"), ` Last nightly snapshot ${ago(D.lastBackupAt)}.`) : el("p", {}, pill("Overdue", "bad"), ` Last snapshot ${ago(D.lastBackupAt)}.`)),
    el("div", { class: "section-title" }, `App crashes — ${D.crashCount7d} this week`),
    D.crashes.length ? el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["When", "Type", "Version", "iOS", "Device", "Summary"].map((h) => el("th", {}, h)))),
      el("tbody", {}, D.crashes.map((x) => el("tr", {}, el("td", { class: "sub" }, when(x.created_at)), el("td", {}, pill(x.kind.replaceAll("_", " "), x.kind === "crash" ? "bad" : "warn")), el("td", {}, `${x.app_version || "?"} (${x.build || "?"})`), el("td", {}, x.os_version || "—"), el("td", {}, x.device_model || "—"), el("td", { class: "wrap" }, x.summary || "—")))))) : el("div", { class: "card empty" }, ic("check"), el("div", {}, "No crash reports.")));
}

/* ---------- idle + boot ---------- */
let lastActive = Date.now();
for (const ev of ["mousemove", "keydown", "click", "touchstart"]) addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true });
setInterval(() => { if (D && !trusted() && Date.now() - lastActive > 20 * 60 * 1000) signOut("Signed out after 20 minutes of inactivity."); }, 30000);
(async () => { const { data: { session } } = await sb.auth.getSession(); session ? afterLogin() : showLogin(); })();
