"use strict";
/* RideAlong staff console. Talks to the same server functions as the app's Staff centre, so every rule
   (staff-only, two-step sign-in, refund logic) is enforced on the server, not in this page.
   All user-supplied text is inserted with textContent only, never as HTML. */
const SB_URL = "https://mkeebusqmkazqnpmaoil.supabase.co";
const SB_KEY = "sb_publishable_R9CSMrPJFZCU-ZBDmOoYdw_Ncq-5Bg-";
const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
const root = document.getElementById("root");
const IDLE_MS = 20 * 60 * 1000;

/* ---------- small helpers ---------- */
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const money = (c) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format((c || 0) / 100);
const when = (x) => x ? new Date(x).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—";
const hoursAgo = (x) => x ? (Date.now() - new Date(x).getTime()) / 3600000 : Infinity;
const ago = (x) => { const h = hoursAgo(x); return h === Infinity ? "never" : h < 1 ? "under an hour ago" : h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`; };
function pill(text, tone) { return el("span", { class: `pill ${tone || ""}` }, text); }
const TONES = { open: "warn", pending: "warn", in_progress: "warn", reviewing: "warn", requires_action: "warn", requested: "warn", payment_pending: "warn",
  verified: "good", approved: "good", captured: "good", paid: "good", closed: "good", resolved: "good", active: "good", accepted: "good", completed: "good",
  rejected: "bad", declined: "bad", suspended: "bad", failed: "bad", disputed: "bad", refunded: "grey", dismissed: "grey", cancelled: "grey" };
const statusPill = (s) => pill(String(s ?? "unknown").replaceAll("_", " "), TONES[s] || "");
let toastTimer;
function toast(msg, bad) { const t = document.getElementById("toast"); t.textContent = msg; t.className = bad ? "bad" : ""; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 7000 : 3500); }

/** Modal question. Resolves to null if cancelled, else an object of the field values. */
function ask({ title, text, fields = [], confirm = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById("dialog");
    const inputs = fields.map((f) => {
      const input = f.long ? el("textarea", { id: `f_${f.key}`, placeholder: f.placeholder || "" }) : el("input", { type: "text", id: `f_${f.key}`, placeholder: f.placeholder || "", autocomplete: "off" });
      return [el("label", { for: `f_${f.key}` }, f.label), input];
    });
    const err = el("div", { class: "err", hidden: true });
    const ok = el("button", { class: `btn ${danger ? "danger" : "primary"}`, type: "button" }, confirm);
    const cancel = el("button", { class: "btn", type: "button" }, "Cancel");
    let done = false;
    const finish = (v) => { if (done) return; done = true; dlg.close(); resolve(v); };
    ok.addEventListener("click", () => {
      const values = {};
      for (const f of fields) {
        const v = dlg.querySelector(`#f_${f.key}`).value.trim();
        if (f.required && !v) { err.textContent = `${f.label} is required.`; err.hidden = false; return; }
        if (f.mustEqual && v !== f.mustEqual) { err.textContent = `Type ${f.mustEqual} exactly to continue.`; err.hidden = false; return; }
        values[f.key] = v;
      }
      finish(values);
    });
    cancel.addEventListener("click", () => finish(null));
    dlg.addEventListener("cancel", () => finish(null), { once: true });
    dlg.replaceChildren(...[el("h2", {}, title), text ? el("p", { class: "muted" }, text) : null, ...inputs.flat(), err, el("div", { class: "dlg-actions" }, cancel, ok)].filter(Boolean));
    dlg.showModal();
  });
}

/* ---------- server calls ---------- */
async function api(path, method, body) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("You are signed out.");
  const r = await fetch(`${SB_URL}/functions/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${session.access_token}`, apikey: SB_KEY, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

/* ---------- state ---------- */
let D = null, view = "overview", memberQuery = "", P = new Map(), B = new Map(), PAYBK = new Map();
function index() {
  P = new Map(D.profiles.map((x) => [x.id, x]));
  B = new Map(D.bookings.map((x) => [x.id, x]));
  PAYBK = new Map();
  for (const p of D.payments) if (!PAYBK.has(p.booking_id) || p.status === "captured") PAYBK.set(p.booking_id, p);
}
const nameOf = (id) => P.get(id)?.display_name || "Unknown member";
const rideOf = (bid) => { const r = B.get(bid)?.rides; return Array.isArray(r) ? r[0] : r; };
const routeOf = (bid) => { const r = rideOf(bid); return r ? `${r.pickup_name} → ${r.dropoff_name}` : "Unknown trip"; };
const tripLine = (bid) => { const r = rideOf(bid); return r ? `${routeOf(bid)} · ${when(r.departure_at)}` : "Unknown trip"; };
async function reload() { D = await api("admin-dashboard", "GET"); index(); renderShell(); }

/* ---------- sign-in, two-step, enrolment ---------- */
function authScreen(...content) { root.replaceChildren(el("div", { class: "auth" }, el("div", { class: "auth-card" }, el("div", { class: "brand-row" }, el("div", { class: "logo" }, "R"), "RideAlong Staff"), content))); }
function showLogin(message) {
  D = null;
  const email = el("input", { type: "email", id: "email", autocomplete: "username", required: true });
  const pass = el("input", { type: "password", id: "pass", autocomplete: "current-password", required: true });
  const err = el("div", { class: "err", hidden: !message }, message || "");
  const go = el("button", { class: "btn primary block", type: "submit" }, "Sign in");
  const form = el("form", {}, el("label", { for: "email" }, "Email"), email, el("label", { for: "pass" }, "Password"), pass, err, go);
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); go.disabled = true; err.hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    go.disabled = false;
    if (error) { err.textContent = "That email or password didn’t work."; err.hidden = false; return; }
    afterLogin();
  });
  authScreen(el("h1", {}, "Sign in"), el("p", { class: "muted" }, "Staff only. Use your RideAlong staff account."), form);
  email.focus();
}
async function signOut(message) { await sb.auth.signOut(); showLogin(message); }
async function afterLogin() {
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") return startConsole();
  const { data: factors } = await sb.auth.mfa.listFactors();
  const verified = factors?.totp?.[0];
  return verified ? showCode(verified.id) : showEnroll();
}
function showCode(factorId) {
  const code = el("input", { type: "text", id: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", placeholder: "123456" });
  const err = el("div", { class: "err", hidden: true });
  const go = el("button", { class: "btn primary block", type: "submit" }, "Verify");
  const form = el("form", {}, el("label", { for: "code" }, "6-digit code"), code, err, go);
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); go.disabled = true; err.hidden = true;
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.value.replace(/\D/g, "") });
    go.disabled = false;
    if (error) { err.textContent = "That code didn’t work. Check your authenticator app and try again."; err.hidden = false; return; }
    startConsole();
  });
  authScreen(el("h1", {}, "Two-step sign-in"), el("p", { class: "muted" }, "Open your authenticator app and enter the code for RideAlong."), form,
    el("p", { class: "small" }, el("button", { class: "link", type: "button", onclick: () => signOut() }, "Use a different account")));
  code.focus();
}
async function showEnroll() {
  authScreen(el("h1", {}, "Set up two-step sign-in"), el("p", { class: "muted" }, "Preparing…"));
  const { data: all } = await sb.auth.mfa.listFactors();
  for (const f of all?.all ?? []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });   // clear half-finished attempts
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", issuer: "RideAlong", friendlyName: `RideAlong staff ${Date.now()}` });
  if (error || !data) {
    return authScreen(el("h1", {}, "Couldn’t start setup"), el("div", { class: "err" }, error?.message || "Unknown error"),
      el("p", { class: "muted" }, "If this says two-step is disabled, turn on TOTP in Supabase: Authentication → Sign In / Providers → Multi-Factor."),
      el("p", { class: "small" }, el("button", { class: "link", type: "button", onclick: () => signOut() }, "Sign out")));
  }
  const code = el("input", { type: "text", id: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", placeholder: "123456" });
  const err = el("div", { class: "err", hidden: true });
  const go = el("button", { class: "btn primary block", type: "submit" }, "Verify and continue");
  const form = el("form", {}, el("label", { for: "code" }, "6-digit code from the app"), code, err, go);
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); go.disabled = true; err.hidden = true;
    const { error: verr } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: code.value.replace(/\D/g, "") });
    go.disabled = false;
    if (verr) { err.textContent = "That code didn’t work. Check the code in your app and try again."; err.hidden = false; return; }
    startConsole();
  });
  authScreen(el("h1", {}, "Set up two-step sign-in"),
    el("p", { class: "muted" }, "1. On your phone, open an authenticator app (Apple Passwords, Google Authenticator, 1Password…) and scan this code."),
    el("img", { class: "qr", alt: "Two-step setup QR code", src: data.totp.qr_code }),
    el("p", { class: "muted small" }, "Can’t scan? Enter this setup key instead. Keep it somewhere safe as your backup:"), el("div", { class: "secret" }, data.totp.secret),
    el("p", { class: "muted" }, "2. Type the 6-digit code it shows."), form);
  code.focus();
}

/* ---------- console shell ---------- */
async function startConsole() {
  try { D = await api("admin-dashboard", "GET"); index(); renderShell(); }
  catch (e) {
    if (e.message === "mfa_required") return afterLogin();
    if (e.message === "Staff access required") return signOut("This account isn’t a RideAlong staff account.");
    authScreen(el("h1", {}, "Couldn’t load"), el("div", { class: "err" }, e.message), el("p", { class: "small" }, el("button", { class: "link", type: "button", onclick: () => startConsole() }, "Try again"), " · ", el("button", { class: "link", type: "button", onclick: () => signOut() }, "Sign out")));
  }
}
const open = (s) => s === "open";
function counts() {
  return {
    refunds: D.refunds.filter((r) => open(r.status)).length,
    verify: D.profiles.filter((p) => p.identity_status === "pending" || p.vehicle_review_status === "pending").length,
    support: D.contacts.filter((c) => c.status !== "closed").length,
    safety: D.reports.filter((r) => r.status === "open" || r.status === "reviewing").length + D.appeals.filter((a) => a.status === "open" || a.status === "reviewing").length,
  };
}
const VIEWS = [
  ["overview", "Overview"], ["refunds", "Refunds", "refunds"], ["verify", "Verifications", "verify"], ["support", "Support", "support"], ["safety", "Safety", "safety"],
  ["--", "Records"], ["members", "Members"], ["chats", "Chats"], ["money", "Money"], ["system", "System health"],
];
function renderShell() {
  const c = counts();
  const nav = el("nav", { class: "nav", "aria-label": "Staff sections" }, VIEWS.map(([key, label, cnt]) =>
    key === "--" ? el("div", { class: "nav-sep" }, label)
      : el("button", { type: "button", "aria-current": view === key ? "page" : false, onclick: () => { view = key; renderShell(); window.scrollTo(0, 0); } }, el("span", {}, label), cnt && c[cnt] ? el("span", { class: "badge" }, c[cnt]) : null)));
  const side = el("aside", { class: "side" }, el("div", { class: "brand-row" }, el("div", { class: "logo" }, "R"), "RideAlong Staff"), nav,
    el("div", { class: "side-foot" }, el("button", { class: "link", type: "button", onclick: async () => { try { await reload(); toast("Refreshed"); } catch (e) { toast(e.message, true); } } }, "Refresh data"), " · ", el("button", { class: "link", type: "button", onclick: () => signOut() }, "Sign out")));
  const builders = { overview, refunds, verify, support, safety, members, chats, money: moneyView, system };
  root.replaceChildren(el("div", { class: "shell" }, side, el("main", { class: "main" }, builders[view]())));
}
const head = (title, sub, tools) => el("div", { class: "head" }, el("div", {}, el("h1", {}, title), sub ? el("div", { class: "muted" }, sub) : null), tools ? el("div", { class: "tools" }, tools) : null);
const empty = (t) => el("div", { class: "card empty" }, t);
async function act(body, okMsg) { try { await api("admin-action", "POST", body); toast(okMsg); await reload(); } catch (e) { toast(e.message, true); } }
const go = (v) => () => { view = v; renderShell(); };

/* ---------- Overview ---------- */
function overview() {
  const c = counts();
  const stat = (n, label, target, hotIfAny) => el("button", { class: `card stat ${n && hotIfAny ? "hot" : (!n ? "ok" : "")}`, type: "button", onclick: go(target) }, el("div", { class: "n" }, n), el("div", { class: "l" }, label));
  const since = Date.now() - 30 * 86400000;
  const recent = D.payments.filter((p) => new Date(p.created_at) >= since);
  const taken = recent.filter((p) => p.status === "captured" || p.status === "disputed");
  const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);
  const paidOut = D.payouts.filter((p) => p.status === "paid" && new Date(p.paid_at || p.requested_at) >= since);
  const mc = D.moneyCheck;
  const health = [];
  health.push(mc ? (mc.issue_count === 0 ? ["good", `Money check: all clear (${ago(mc.ran_at)})`] : ["bad", `Money check found ${mc.issue_count} difference(s)`]) : ["warn", "Money check has not run yet"]);
  health.push(hoursAgo(D.lastBackupAt) < 30 ? ["good", `Database snapshot: ${ago(D.lastBackupAt)}`] : ["bad", `Database snapshot is overdue (${ago(D.lastBackupAt)})`]);
  health.push(D.crashCount7d === 0 ? ["good", "No app crashes in the last 7 days"] : ["warn", `${D.crashCount7d} app crash report(s) in the last 7 days`]);
  return el("div", {}, head("Overview", "What needs you right now."),
    el("div", { class: "grid cols-5" }, stat(c.refunds, "Refunds waiting", "refunds", true), stat(c.verify, "Verifications", "verify", true), stat(c.support, "Support open", "support", true), stat(c.safety, "Safety items", "safety", true)),
    el("div", { class: "section-title" }, "Last 30 days"),
    el("div", { class: "grid cols-2" },
      el("div", { class: "card" }, el("h2", {}, "Money"), el("dl", { class: "kv" },
        el("dt", {}, "Card payments taken"), el("dd", { class: "num" }, `${taken.length} · ${money(sum(taken, "rider_total_cents"))}`),
        el("dt", {}, "RideAlong fees"), el("dd", { class: "num" }, money(sum(taken, "ridealong_fee_cents"))),
        el("dt", {}, "Owed to drivers"), el("dd", { class: "num" }, money(sum(taken, "driver_amount_cents"))),
        el("dt", {}, "Driver payouts sent"), el("dd", { class: "num" }, `${paidOut.length} · ${money(sum(paidOut, "amount_cents"))}`),
        el("dt", {}, "Refunded"), el("dd", { class: "num" }, String(recent.filter((p) => p.status === "refunded").length)))),
      el("div", { class: "card" }, el("h2", {}, "System health"), health.map(([t, m]) => el("p", {}, pill(t === "good" ? "OK" : t === "warn" ? "Check" : "Act", t), " ", m)),
        el("button", { class: "btn small", type: "button", onclick: go("system") }, "Details"))));
}

/* ---------- Refunds ---------- */
function refunds() {
  const openOnes = D.refunds.filter((r) => open(r.status)), done = D.refunds.filter((r) => !open(r.status)).slice(0, 25);
  const card = (r, actionable) => {
    const pay = PAYBK.get(r.booking_id);
    return el("div", { class: "item" },
      el("div", { class: "top" }, el("div", {}, el("div", { class: "who" }, nameOf(r.requester_id)), el("div", { class: "muted" }, tripLine(r.booking_id))), el("div", {}, statusPill(r.status), " ", pay ? el("strong", { class: "num" }, money(pay.rider_total_cents)) : null)),
      el("div", { class: "body" }, r.reason || "No reason given."), el("div", { class: "muted small" }, `Requested ${when(r.created_at)}${r.staff_reason ? ` · Staff note: ${r.staff_reason}` : ""}`),
      actionable ? el("div", { class: "actions" },
        el("button", { class: "btn good", type: "button", onclick: async () => {
          const v = await ask({ title: "Approve this refund?", text: `${money(pay?.rider_total_cents)} goes back to ${nameOf(r.requester_id)}’s card through Stripe right now. This can’t be undone.`, fields: [{ key: "reason", label: "Note (optional)", long: true }], confirm: "Approve and refund" });
          if (v) act({ action: "refund", id: r.id, status: "approved", reason: v.reason }, "Refund approved and sent to Stripe");
        } }, "Approve refund"),
        el("button", { class: "btn danger", type: "button", onclick: async () => {
          const v = await ask({ title: "Decline this refund?", text: "The member is told this reason.", fields: [{ key: "reason", label: "Reason", long: true, required: true }], confirm: "Decline", danger: true });
          if (v) act({ action: "refund", id: r.id, status: "declined", reason: v.reason }, "Refund declined");
        } }, "Decline")) : null);
  };
  return el("div", {}, head("Refunds", "Nothing is refunded until you approve it here."),
    el("div", { class: "card" }, openOnes.length ? openOnes.map((r) => card(r, true)) : el("div", { class: "empty" }, "No refunds waiting. 🎉".replace(" 🎉", ""))),
    done.length ? [el("div", { class: "section-title" }, "Recently decided"), el("div", { class: "card" }, done.map((r) => card(r, false)))] : null);
}

/* ---------- Verifications ---------- */
async function openDocument(profileId, kind) {
  const w = window.open("", "_blank");
  try { const { url } = await api("admin-document-url", "POST", { profileId, kind }); if (!url) { w?.close(); return toast("No document was uploaded.", true); } if (w) { w.opener = null; w.location = url; } else toast("Allow pop-ups to view documents.", true); }
  catch (e) { w?.close(); toast(e.message, true); }
}
function verify() {
  const pend = D.profiles.filter((p) => p.identity_status === "pending" || p.vehicle_review_status === "pending");
  const section = (p, kind) => {
    const status = kind === "identity" ? p.identity_status : p.vehicle_review_status, path = kind === "identity" ? p.identity_document_path : p.vehicle_document_path;
    if (status !== "pending") return null;
    const label = kind === "identity" ? "Identity document" : "Vehicle document";
    return el("div", { class: "item" },
      el("div", { class: "top" }, el("div", {}, el("div", { class: "who" }, `${p.display_name} · ${label}`), el("div", { class: "muted small" }, `Member since ${when(p.created_at)}`)), statusPill(status)),
      el("div", { class: "actions" },
        el("button", { class: "btn primary", type: "button", disabled: !path, onclick: () => openDocument(p.id, kind) }, path ? "View document" : "No document uploaded"),
        el("button", { class: "btn good", type: "button", onclick: async () => { if (await ask({ title: `Approve ${label.toLowerCase()}?`, text: `${p.display_name} will be told it was approved.`, confirm: "Approve" })) act({ action: "review_verification", profileId: p.id, kind, status: "verified" }, "Approved"); } }, "Approve"),
        el("button", { class: "btn", type: "button", onclick: async () => { const v = await ask({ title: "Ask for a better document", text: "The member is asked to upload it again.", fields: [{ key: "reason", label: "What should they fix?", long: true, required: true }], confirm: "Send request" }); if (v) act({ action: "request_documents", profileId: p.id, kind, reason: v.reason }, "Request sent"); } }, "Ask for a new one"),
        el("button", { class: "btn danger", type: "button", onclick: async () => { const v = await ask({ title: "Reject document?", text: "The member is told this reason.", fields: [{ key: "reason", label: "Reason", long: true, required: true }], confirm: "Reject", danger: true }); if (v) act({ action: "review_verification", profileId: p.id, kind, status: "rejected", reason: v.reason }, "Rejected"); } }, "Reject")));
  };
  const items = pend.flatMap((p) => [section(p, "identity"), section(p, "vehicle")]).filter(Boolean);
  return el("div", {}, head("Verifications", "Identity and vehicle documents waiting for review."), el("div", { class: "card" }, items.length ? items : el("div", { class: "empty" }, "Nothing waiting for review.")));
}

/* ---------- Support ---------- */
function support() {
  const list = [...D.contacts].sort((a, b) => (a.status === "closed") - (b.status === "closed"));
  const card = (c) => {
    const reply = el("textarea", { placeholder: "Write a reply…" }); reply.value = c.staff_reply || "";
    const send = (status, msg) => () => { if (!reply.value.trim() && status === "in_progress") return toast("Write a reply first.", true); act({ action: "contact", id: c.id, status, reply: reply.value.trim() }, msg); };
    return el("div", { class: "item" },
      el("div", { class: "top" }, el("div", {}, el("div", { class: "who" }, c.subject), el("div", { class: "muted" }, `${nameOf(c.sender_id)} · ${when(c.created_at)}`)), statusPill(c.status)),
      el("div", { class: "body" }, c.body),
      c.status !== "closed" ? [reply, el("div", { class: "actions" }, el("button", { class: "btn primary", type: "button", onclick: send("in_progress", "Reply sent") }, "Send reply"), el("button", { class: "btn", type: "button", onclick: send("closed", "Closed") }, "Reply and close"))] : (c.staff_reply ? el("div", { class: "muted small" }, `Reply sent: ${c.staff_reply}`) : null));
  };
  return el("div", {}, head("Support", "Messages from members using Contact us."), el("div", { class: "card" }, list.length ? list.map(card) : el("div", { class: "empty" }, "No support messages.")));
}

/* ---------- Safety ---------- */
function safety() {
  const reports = [...D.reports].sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1)).slice(0, 60);
  const rcard = (r) => el("div", { class: "item" },
    el("div", { class: "top" }, el("div", {}, el("div", { class: "who" }, `${nameOf(r.reporter_id)} reported ${nameOf(r.subject_id)}`), el("div", { class: "muted small" }, when(r.created_at))), statusPill(r.status)),
    el("div", { class: "body" }, r.reason),
    r.status === "open" || r.status === "reviewing" ? el("div", { class: "actions" },
      el("button", { class: "btn good", type: "button", onclick: async () => { const v = await ask({ title: "Resolve report", fields: [{ key: "reason", label: "Notes (optional)", long: true }], confirm: "Resolve" }); if (v) act({ action: "report", id: r.id, status: "resolved", reason: v.reason }, "Report resolved"); } }, "Resolve"),
      el("button", { class: "btn", type: "button", onclick: async () => { const v = await ask({ title: "Dismiss report", fields: [{ key: "reason", label: "Notes (optional)", long: true }], confirm: "Dismiss" }); if (v) act({ action: "report", id: r.id, status: "dismissed", reason: v.reason }, "Report dismissed"); } }, "Dismiss"),
      el("button", { class: "btn danger", type: "button", onclick: () => suspend(r.subject_id) }, `Suspend ${nameOf(r.subject_id)}`)) : null);
  const appeals = D.appeals.slice(0, 40);
  const acard = (a) => el("div", { class: "item" },
    el("div", { class: "top" }, el("div", {}, el("div", { class: "who" }, `Appeal from ${nameOf(a.requester_id)}`), el("div", { class: "muted small" }, when(a.created_at))), statusPill(a.status)),
    el("div", { class: "body" }, a.reason),
    (a.status === "open" || a.status === "reviewing") && P.get(a.profile_id)?.account_status === "suspended" ? el("div", { class: "actions" }, el("button", { class: "btn good", type: "button", onclick: () => restore(a.profile_id) }, "Restore account")) : null);
  return el("div", {}, head("Safety", "Reports about members and appeals against suspensions."),
    el("div", { class: "card" }, reports.length ? reports.map(rcard) : el("div", { class: "empty" }, "No reports.")),
    el("div", { class: "section-title" }, "Appeals"), el("div", { class: "card" }, appeals.length ? appeals.map(acard) : el("div", { class: "empty" }, "No appeals.")));
}
async function suspend(id) { const v = await ask({ title: `Suspend ${nameOf(id)}?`, text: "They can’t book or offer rides while suspended, and are told this reason. You can restore them later.", fields: [{ key: "reason", label: "Reason", long: true, required: true }], confirm: "Suspend", danger: true }); if (v) act({ action: "block", profileId: id, reason: v.reason }, "Account suspended"); }
async function restore(id) { if (await ask({ title: `Restore ${nameOf(id)}?`, text: "They can sign in and use RideAlong again.", confirm: "Restore" })) act({ action: "restore_account", profileId: id }, "Account restored"); }
async function ban(id) { const v = await ask({ title: `Permanently ban ${nameOf(id)}?`, text: "They can never sign in again with this email. This is the strongest action.", fields: [{ key: "reason", label: "Reason", long: true, required: true }, { key: "confirm", label: "Type BAN to confirm", mustEqual: "BAN" }], confirm: "Ban permanently", danger: true }); if (v) act({ action: "permanent_ban", profileId: id, reason: v.reason }, "Account banned"); }

/* ---------- Members ---------- */
function members() {
  const tableHost = el("div", { class: "table-wrap" });
  const draw = () => {
    const q = memberQuery.trim().toLowerCase();
    const rows = D.profiles.filter((p) => !q || p.display_name.toLowerCase().includes(q)).slice(0, 200);
    tableHost.replaceChildren(el("table", {}, el("thead", {}, el("tr", {}, ["Name", "Identity", "Vehicle", "Account", "Joined", ""].map((h) => el("th", {}, h)))),
      el("tbody", {}, rows.length ? rows.map((p) => el("tr", {},
        el("td", {}, p.display_name), el("td", {}, statusPill(p.identity_status)), el("td", {}, p.vehicle_review_status ? statusPill(p.vehicle_review_status) : el("span", { class: "muted" }, "—")),
        el("td", {}, statusPill(p.account_status || "active")), el("td", { class: "muted" }, when(p.created_at)),
        el("td", { class: "r" }, p.account_status === "suspended" ? el("button", { class: "btn small good", type: "button", onclick: () => restore(p.id) }, "Restore") : el("button", { class: "btn small", type: "button", onclick: () => suspend(p.id) }, "Suspend"), " ",
          el("button", { class: "btn small danger", type: "button", onclick: () => ban(p.id) }, "Ban")))) : el("tr", {}, el("td", { colspan: "6", class: "empty" }, "No members match.")))));
  };
  const search = el("input", { type: "search", placeholder: "Search by name", "aria-label": "Search members" }); search.value = memberQuery;
  search.addEventListener("input", () => { memberQuery = search.value; draw(); });
  draw();
  return el("div", {}, head("Members", `${D.profiles.length} accounts`, search), tableHost);
}

/* ---------- Chats ---------- */
function chats() {
  const byBooking = new Map();
  for (const m of D.messages) { if (!byBooking.has(m.booking_id)) byBooking.set(m.booking_id, []); byBooking.get(m.booking_id).push(m); }
  const host = el("div", { class: "card" }, el("div", { class: "empty" }, "Pick a conversation to read it."));
  const list = [...byBooking.entries()].sort((a, b) => new Date(b[1][0].created_at) - new Date(a[1][0].created_at));
  const show = (bid, msgs) => host.replaceChildren(el("h2", {}, routeOf(bid)), el("p", { class: "muted small" }, `${tripLine(bid)} · rider ${nameOf(B.get(bid)?.rider_id)}`),
    el("div", { class: "thread" }, [...msgs].reverse().map((m) => el("div", { class: "msg" }, el("div", { class: "muted small" }, `${nameOf(m.sender_id)} · ${when(m.created_at)}`), m.body))));
  return el("div", {}, head("Chats", "Ride conversations, newest first. Only open these to investigate a report or support request."),
    el("div", { class: "grid cols-2" }, el("div", { class: "card" }, list.length ? list.slice(0, 60).map(([bid, msgs]) => el("div", { class: "item" }, el("button", { class: "link", type: "button", onclick: () => show(bid, msgs) }, routeOf(bid)), el("div", { class: "muted small" }, `${nameOf(B.get(bid)?.rider_id)} · ${msgs.length} message(s) · ${when(msgs[0].created_at)}`))) : el("div", { class: "empty" }, "No messages.")), host));
}

/* ---------- Money ---------- */
function moneyView() {
  const payRows = D.payments.slice(0, 150), payoutRows = D.payouts.slice(0, 100);
  const tbl = (cols, rows, empty) => el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, cols.map((c, i) => el("th", { class: c.r ? "r" : "" }, c.h)))), el("tbody", {}, rows.length ? rows : el("tr", {}, el("td", { colspan: String(cols.length), class: "empty" }, empty)))));
  return el("div", {}, head("Money", "Card payments and driver payouts."),
    el("div", { class: "section-title" }, "Card payments"),
    tbl([{ h: "Date" }, { h: "Rider" }, { h: "Trip" }, { h: "Mode" }, { h: "Total", r: 1 }, { h: "RideAlong fee", r: 1 }, { h: "Driver", r: 1 }, { h: "Status" }],
      payRows.map((p) => el("tr", {}, el("td", { class: "muted" }, when(p.created_at)), el("td", {}, nameOf(B.get(p.booking_id)?.rider_id)), el("td", {}, routeOf(p.booking_id)), el("td", {}, p.mode === "direct" ? "Fee only" : "In-app"),
        el("td", { class: "r num" }, money(p.rider_total_cents)), el("td", { class: "r num" }, money(p.ridealong_fee_cents)), el("td", { class: "r num" }, money(p.driver_amount_cents)), el("td", {}, statusPill(p.status)))), "No payments yet."),
    el("div", { class: "section-title" }, "Driver payouts"),
    tbl([{ h: "Requested" }, { h: "Driver" }, { h: "Amount", r: 1 }, { h: "Fee", r: 1 }, { h: "Status" }, { h: "Paid" }],
      payoutRows.map((p) => el("tr", {}, el("td", { class: "muted" }, when(p.requested_at)), el("td", {}, nameOf(p.driver_id)), el("td", { class: "r num" }, money(p.amount_cents)), el("td", { class: "r num" }, money(p.withdrawal_fee_cents)), el("td", {}, statusPill(p.status)), el("td", { class: "muted" }, when(p.paid_at)))), "No payouts yet."));
}

/* ---------- System health ---------- */
function system() {
  const mc = D.moneyCheck;
  const banner = !mc ? el("div", { class: "banner warn" }, "The nightly money check hasn’t run yet. It runs at 2:30am Brisbane time.")
    : mc.issue_count === 0 ? el("div", { class: "banner good" }, `Money check: everything matches. Stripe and the database agree (${ago(mc.ran_at)}).`)
      : el("div", { class: "banner bad" }, `Money check found ${mc.issue_count} difference(s) between Stripe and the database (${ago(mc.ran_at)}).`);
  return el("div", {}, head("System health", "Automatic checks that run overnight."), banner,
    mc ? el("div", { class: "card" }, el("h2", {}, "Last money check"), el("dl", { class: "kv" },
      el("dt", {}, "Ran"), el("dd", {}, when(mc.ran_at)), el("dt", {}, "Payments checked"), el("dd", { class: "num" }, mc.payments_checked), el("dt", {}, "Payouts checked"), el("dd", { class: "num" }, mc.payouts_checked),
      el("dt", {}, "Stripe balance"), el("dd", { class: "num" }, mc.stripe_balance_cents == null ? "—" : money(mc.stripe_balance_cents)), el("dt", {}, "Owed to drivers"), el("dd", { class: "num" }, mc.owed_to_drivers_cents == null ? "—" : money(mc.owed_to_drivers_cents))),
      (mc.issues || []).length ? el("div", { class: "item" }, (mc.issues).map((i) => el("p", {}, pill(i.severity, i.severity === "critical" ? "bad" : "warn"), " ", el("strong", {}, i.kind.replaceAll("_", " ")), " — ", i.detail, " ", el("span", { class: "muted small" }, i.ref)))) : null) : null,
    el("div", { class: "section-title" }, "Database snapshot"),
    el("div", { class: "card" }, hoursAgo(D.lastBackupAt) < 30 ? el("p", {}, pill("OK", "good"), ` Last nightly snapshot ${ago(D.lastBackupAt)}. Ask Claude to restore anything from it.`) : el("p", {}, pill("Overdue", "bad"), ` Last snapshot ${ago(D.lastBackupAt)}.`)),
    el("div", { class: "section-title" }, `App crashes (${D.crashCount7d} in the last 7 days)`),
    D.crashes.length ? el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["When", "Type", "App version", "iOS", "Device", "Summary"].map((h) => el("th", {}, h)))),
      el("tbody", {}, D.crashes.map((x) => el("tr", {}, el("td", { class: "muted" }, when(x.created_at)), el("td", {}, pill(x.kind.replaceAll("_", " "), x.kind === "crash" ? "bad" : "warn")), el("td", {}, `${x.app_version || "?"} (${x.build || "?"})`), el("td", {}, x.os_version || "—"), el("td", {}, x.device_model || "—"), el("td", { class: "wrap" }, x.summary || "—")))))) : empty("No crash reports. 👍".replace(" 👍", "")));
}

/* ---------- boot ---------- */
let lastActive = Date.now();
for (const ev of ["mousemove", "keydown", "click", "touchstart"]) addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true });
setInterval(() => { if (D && Date.now() - lastActive > IDLE_MS) signOut("You were signed out after 20 minutes of inactivity."); }, 30000);
(async () => { const { data: { session } } = await sb.auth.getSession(); session ? afterLogin() : showLogin(); })();
