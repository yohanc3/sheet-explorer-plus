const state = {
  classes: [], submissions: [], mode: "assignment", classId: "", assignment: "", student: "",
  query: "", dateFrom: "", dateTo: "", queue: [], selectedIndex: -1, cells: [], loadingToken: 0,
  importing: false, syncing: false, syncError: "", syncedAt: "",
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const toast = (message, error = false) => {
  const element = $("#toast"); element.textContent = message; element.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.className = "toast", 3200);
};

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

function nameParts(name) {
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  const parts = name.trim().toLowerCase().split(/\s+/).map(part => part.replace(/[.,]/g, ""));
  const last = [...parts].reverse().find(part => !suffixes.has(part)) || "";
  return { first: parts[0] || "", last };
}
function namesMatch(roster, submitted) {
  const a = nameParts(roster), b = nameParts(submitted);
  if (!a.first || !a.last || !b.first || !b.last) return roster.trim().toLowerCase() === submitted.trim().toLowerCase();
  return (a.first.includes(b.first) || b.first.includes(a.first)) && (a.last.includes(b.last) || b.last.includes(a.last));
}
function selectedClass() { return state.classes.find(item => String(item.id) === String(state.classId)); }
function inSelectedClass(submission) {
  const klass = selectedClass();
  return !klass || klass.students.some(student => namesMatch(student.name, submission.full_name));
}
function rosterPosition(submission) {
  const klass = selectedClass();
  if (!klass) return Number.MAX_SAFE_INTEGER;
  const index = klass.students.findIndex(student => namesMatch(student.name, submission.full_name));
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function unique(values) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function fillSelect(element, values, placeholder, selected) {
  element.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + values.map(value => `<option${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
}
function formatTimestamp(value) {
  if (!value) return "Submission";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"}).format(parsed);
}
function renderFilters() {
  const classSelect = $("#class-filter");
  classSelect.innerHTML = `<option value="">All students</option>` + state.classes.map(item => `<option value="${item.id}"${String(item.id) === String(state.classId) ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  fillSelect($("#assignment-filter"), unique(state.submissions.map(item => item.title)), "Choose an assignment", state.assignment);
  fillSelect($("#student-filter"), unique(state.submissions.filter(inSelectedClass).map(item => item.full_name)), "Choose a student", state.student);
  $("#assignment-wrap").hidden = state.mode !== "assignment";
  $("#student-wrap").hidden = state.mode !== "student";
  document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === state.mode));
}

function showWorkspaceMessage(step, icon, title, message, actions = "") {
  $("#notebook-view").hidden = true;
  $("#empty-state").hidden = false;
  $("#empty-step").textContent = step;
  $("#empty-icon").textContent = icon;
  $("#empty-title").textContent = title;
  $("#empty-message").textContent = message;
  $("#empty-actions").innerHTML = actions;
}

function updateWorkspaceState() {
  const assignmentMissing = state.mode === "assignment" && !state.assignment;
  const studentMissing = state.mode === "student" && !state.student;
  if (state.syncing && !state.submissions.length) {
    showWorkspaceMessage("Master submissions", "↻", "Loading latest submissions", "Downloading the public master Google Sheet.");
  } else if (!state.submissions.length && state.syncError) {
    showWorkspaceMessage("Refresh failed", "!", "Could not load submissions", state.syncError, `<button class="button primary" data-sync>Try again</button> <button class="button secondary" data-import>Import .xlsx instead</button>`);
  } else if (!state.submissions.length) {
    showWorkspaceMessage("No submissions", "—", "The master sheet is empty", "Refresh the public Google Sheet or import an .xlsx file instead.", `<button class="button primary" data-sync>Refresh submissions</button> <button class="button secondary" data-import>Import .xlsx instead</button>`);
  } else if (assignmentMissing) {
    showWorkspaceMessage("Choose scope", "01", "Choose an assignment", "Select an assignment in the left panel to build its grading queue.");
  } else if (studentMissing) {
    showWorkspaceMessage("Choose scope", "01", "Choose a student", "Select a student in the left panel to see all of their submitted assignments.");
  } else if (!state.queue.length) {
    showWorkspaceMessage("No results", "—", "No submissions match", "Try another class, date range, or search term.", `<button class="button secondary" data-clear-filters>Clear filters</button>`);
  } else if (state.selectedIndex < 0) {
    const subject = state.mode === "assignment" ? "student" : "assignment";
    showWorkspaceMessage("Step 2 of 3", "02", `Select a ${subject}`, `${state.queue.length} submission${state.queue.length === 1 ? " is" : "s are"} ready in the queue.`);
  }
}

function clearSelection() {
  state.selectedIndex = -1;
  state.cells = [];
  state.loadingToken += 1;
  $("#notebook-view").hidden = true;
  $("#empty-state").hidden = false;
}

function buildQueue() {
  let items = state.submissions.filter(inSelectedClass);
  if (state.dateFrom) items = items.filter(item => !item.timestamp || item.timestamp.slice(0, 10) >= state.dateFrom);
  if (state.dateTo) items = items.filter(item => !item.timestamp || item.timestamp.slice(0, 10) <= state.dateTo);
  if (state.mode === "assignment") {
    items = state.assignment ? items.filter(item => item.title === state.assignment) : [];
    const latest = new Map();
    for (const item of items) if (!latest.has(item.full_name)) latest.set(item.full_name, item);
    items = [...latest.values()].sort((a, b) => rosterPosition(a) - rosterPosition(b) || a.full_name.localeCompare(b.full_name));
  } else {
    items = state.student ? items.filter(item => item.full_name === state.student) : [];
    items.sort((a, b) => a.title.localeCompare(b.title) || String(b.timestamp).localeCompare(String(a.timestamp)));
  }
  if (state.query) {
    const query = state.query.toLowerCase();
    items = items.filter(item => `${item.full_name} ${item.title}`.toLowerCase().includes(query));
  }
  state.queue = items;
  $("#submission-count").textContent = items.length;
  $("#queue").innerHTML = items.length ? items.map((item, index) => `
    <button class="queue-item${index === state.selectedIndex ? " active" : ""}" data-index="${index}">
      <span class="queue-name">${escapeHtml(state.mode === "assignment" ? item.full_name : item.title)}</span>
      <span class="queue-meta">${escapeHtml(state.mode === "assignment" ? formatTimestamp(item.timestamp) : item.full_name)}</span>
    </button>`).join("") : `<div class="queue-empty">${!state.submissions.length ? "Import a workbook to create the queue." : (state.mode === "assignment" && !state.assignment) ? "Choose an assignment above." : (state.mode === "student" && !state.student) ? "Choose a student above." : "No matching submissions."}</div>`;
  updateWorkspaceState();
}

function render() {
  renderFilters();
  buildQueue();
  renderClassManager();
  const assignments = unique(state.submissions.map(item => item.title));
  $("#workbook-summary").classList.toggle("ready", state.submissions.length > 0);
  $("#workbook-summary").lastChild.textContent = state.syncing
    ? "Refreshing master sheet…"
    : state.submissions.length
      ? `${state.submissions.length} submissions · ${assignments.length} assignments${state.syncedAt ? " · Updated just now" : ""}`
      : "No submissions loaded";
}

function sourceText(source) { return Array.isArray(source) ? source.join("") : (source || ""); }
function simpleMarkdown(text) {
  return escapeHtml(text).split("\n").map(line => {
    if (/^### /.test(line)) return `<h3>${line.slice(4)}</h3>`;
    if (/^## /.test(line)) return `<h2>${line.slice(3)}</h2>`;
    if (/^# /.test(line)) return `<h1>${line.slice(2)}</h1>`;
    if (/^[-*] /.test(line)) return `<div>• ${line.slice(2)}</div>`;
    return line ? `<div>${line.replace(/`([^`]+)`/g, "<code>$1</code>")}</div>` : "<br>";
  }).join("");
}
function savedOutputHtml(outputs = []) {
  return outputs.map(output => {
    if (output.output_type === "stream") { const text = Array.isArray(output.text) ? output.text.join("") : (output.text || ""); return `<pre class="saved-output">${escapeHtml(text)}</pre>`; }
    if (output.output_type === "error") return `<pre class="saved-output">${escapeHtml(`${output.ename || "Error"}: ${output.evalue || ""}\n${(output.traceback || []).join("\n")}`)}</pre>`;
    const image = output.data?.["image/png"];
    const html = output.data?.["text/html"];
    const plain = output.data?.["text/plain"];
    if (image) return `<div class="saved-output-html"><img class="output-image" alt="Saved notebook output" src="data:image/png;base64,${Array.isArray(image) ? image.join("") : image}"></div>`;
    if (html) { const markup = Array.isArray(html) ? html.join("") : html; return `<div class="saved-output-html"><iframe class="saved-html-frame" sandbox title="Saved HTML output" srcdoc="${escapeHtml(markup)}"></iframe></div>`; }
    const text = Array.isArray(plain) ? plain.join("") : (plain || ""); return text ? `<pre class="saved-output">${escapeHtml(text)}</pre>` : "";
  }).join("");
}
function visibleCells() {
  let cells = $("#show-all").checked ? state.cells : state.cells.slice(0, Math.max(0, state.cells.length - 2));
  if ($("#quick-grade").checked) {
    let code, markdown;
    cells.forEach((cell, index) => { if (cell.cell_type === "code") code = index; if (cell.cell_type === "markdown") markdown = index; });
    const indexes = [code, markdown].filter(value => value !== undefined).sort((a, b) => a - b);
    cells = indexes.map(index => cells[index]);
  }
  return cells;
}
function renderCells() {
  const cells = visibleCells();
  $("#cells").innerHTML = cells.length ? cells.map((cell, index) => {
    const content = sourceText(cell.source); const output = savedOutputHtml(cell.outputs);
    return `<article class="cell ${cell.cell_type}">
      <div class="cell-header"><span>${escapeHtml(cell.cell_type)}</span>${cell.cell_type === "code" ? `<button class="button secondary run-code" data-cell="${index}">Run</button>` : ""}</div>
      <div class="cell-body">${cell.cell_type === "code" ? `<pre><code>${escapeHtml(content)}</code></pre>` : simpleMarkdown(content)}</div>
      ${output ? `<details><summary class="cell-header">Student output</summary>${output}</details>` : ""}
      <div class="runtime-output" data-output="${index}"></div>
    </article>`;
  }).join("") : `<div class="empty-state"><p>No visible notebook cells.</p></div>`;
}

async function selectSubmission(index) {
  state.selectedIndex = index; buildQueue();
  const item = state.queue[index]; if (!item) return;
  $("#empty-state").hidden = true; $("#notebook-view").hidden = false; $("#cells").innerHTML = "";
  $("#student-name").textContent = item.full_name; $("#assignment-title").textContent = item.title;
  $("#submission-meta").textContent = [formatTimestamp(item.timestamp), item.time].filter(Boolean).join(" · ");
  const details = [["Difficulty", item.difficulty], ["Confidence", item.confident], ["Needs work", item.needswork], ["Suggestions", item.suggestions], ["Corrections", item.corrections], ["Locals", item.locals]];
  $("#submission-details").innerHTML = details.filter(([, value]) => value).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  $("#open-colab").href = item.share || "#"; $("#position").textContent = `${index + 1} of ${state.queue.length}`;
  $("#previous").disabled = index <= 0; $("#next").disabled = index >= state.queue.length - 1;
  const token = ++state.loadingToken; setStatus("Loading notebook…");
  try {
    const resolved = await api("/api/resolve-notebook", {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({url: item.share})});
    const notebook = await api(`/api/notebook/${encodeURIComponent(resolved.file_id)}`);
    if (token !== state.loadingToken) return;
    state.cells = notebook.cells || []; setStatus(""); renderCells();
    if ($("#quick-grade").checked) runAllVisibleCode();
  } catch (error) { if (token === state.loadingToken) setStatus(error.message, true); }
}
function setStatus(message, error = false) { const el = $("#notebook-status"); el.textContent = message; el.className = `status${error ? " error" : ""}`; }
function navigate(offset) { const index = state.selectedIndex + offset; if (index >= 0 && index < state.queue.length) selectSubmission(index); }

async function runCode(button) {
  const index = Number(button.dataset.cell), cell = visibleCells()[index]; if (!cell) return;
  const output = document.querySelector(`[data-output="${index}"]`); button.disabled = true; button.textContent = "Running…";
  output.innerHTML = `<pre class="execution-output">Running with local Python…</pre>`;
  try {
    const result = await api("/api/execute-python", {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({code: sourceText(cell.source)})});
    output.innerHTML = `<pre class="execution-output">${escapeHtml(result.output || result.error || "Completed with no text output.")}</pre>` + (result.plots || []).map(plot => `<img class="output-image" alt="Python plot" src="data:image/png;base64,${plot}">`).join("");
  } catch (error) { output.innerHTML = `<pre class="execution-output">${escapeHtml(error.message)}</pre>`; }
  finally { button.disabled = false; button.textContent = "Run"; }
}
function runAllVisibleCode() { document.querySelectorAll(".run-code").forEach(button => runCode(button)); }

function renderClassManager() {
  $("#class-list").innerHTML = state.classes.length ? state.classes.map(klass => `
    <section class="class-card" data-class="${klass.id}">
      <div class="class-card-header"><h3>${escapeHtml(klass.name)}</h3><div><button class="button secondary rename-class">Rename</button> <button class="button danger delete-class">Delete class</button></div></div>
      <ul class="student-list">${klass.students.map(student => `<li><span>${escapeHtml(student.name)}</span><span><button class="rename-student" data-student="${student.id}" data-name="${escapeHtml(student.name)}">Rename</button><button class="delete-student" data-student="${student.id}" aria-label="Remove ${escapeHtml(student.name)}">Remove</button></span></li>`).join("") || `<li class="meta">No students yet.</li>`}</ul>
      <form class="inline-form add-student">
        <div class="student-picker"><input name="name" required autocomplete="off" role="combobox" aria-expanded="false" placeholder="Search workbook names…"><div class="student-suggestions" hidden></div></div>
        <button class="button secondary">Add student</button>
      </form>
    </section>`).join("") : `<p class="meta">No classes yet. Add one above, then build its roster.</p>`;
}
async function refresh() {
  const data = await api("/api/state");
  state.classes = data.classes;
  state.submissions = data.submissions;
  const assignments = unique(state.submissions.map(item => item.title));
  if (!assignments.includes(state.assignment)) state.assignment = assignments[0] || "";
  const students = unique(state.submissions.filter(inSelectedClass).map(item => item.full_name));
  if (state.student && !students.includes(state.student)) state.student = "";
  render();
}

function fuzzyScore(candidate, query) {
  const value = candidate.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const needle = query.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
  if (!needle) return 100;
  if (value === needle) return 0;
  if (value.startsWith(needle)) return 5;
  if (value.includes(needle)) return 10 + value.indexOf(needle);
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.every(token => value.includes(token))) return 25;
  let position = 0;
  for (const character of needle) { position = value.indexOf(character, position); if (position < 0) return Infinity; position += 1; }
  return 50 + value.length - needle.length;
}

function showStudentSuggestions(input) {
  const card = input.closest("[data-class]");
  const klass = state.classes.find(item => String(item.id) === card.dataset.class);
  const names = unique(state.submissions.map(item => item.full_name)).filter(name => !klass.students.some(student => namesMatch(student.name, name)));
  const matches = names.map(name => ({name, score: fuzzyScore(name, input.value)})).filter(item => Number.isFinite(item.score)).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  const suggestions = input.parentElement.querySelector(".student-suggestions");
  suggestions.innerHTML = matches.length ? matches.map(item => {
    const count = state.submissions.filter(submission => submission.full_name === item.name).length;
    return `<button type="button" class="student-suggestion" data-name="${escapeHtml(item.name)}"><span>${escapeHtml(item.name)}</span><small>${count} submission${count === 1 ? "" : "s"}</small></button>`;
  }).join("") : `<div class="suggestion-empty">${state.submissions.length ? "No matching workbook names. You can add this name manually." : "Import a workbook to see student suggestions."}</div>`;
  suggestions.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function setImportProgress(visible, percent = 0, message = "Uploading workbook…", processing = false) {
  const progress = $("#import-progress");
  progress.hidden = !visible;
  progress.classList.toggle("processing", processing);
  $("#import-progress-bar").style.width = processing ? "" : `${percent}%`;
  $("#import-progress-text").textContent = message;
  $("#import-trigger").disabled = visible;
  $("#sync-trigger").disabled = visible;
}

async function syncMasterSheet() {
  if (state.importing) return;
  state.importing = true;
  state.syncing = true;
  state.syncError = "";
  setImportProgress(true, 0, "Downloading latest submissions…", true);
  render();
  try {
    const result = await api("/api/sync-master", {method: "POST"});
    state.syncedAt = result.synced_at || "now";
    clearSelection();
    await refresh();
    toast(result.message);
  } catch (error) {
    state.syncError = error.message;
    await refresh();
    toast(state.submissions.length ? `${error.message} Showing the last saved submissions.` : error.message, true);
  } finally {
    state.importing = false;
    state.syncing = false;
    setImportProgress(false);
    render();
  }
}

function importWorkbook(file) {
  if (!file || state.importing) return;
  state.importing = true;
  setImportProgress(true, 2, `Uploading ${file.name}…`);
  const body = new FormData(); body.append("file", file);
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/import");
  xhr.responseType = "json";
  xhr.upload.addEventListener("progress", event => { if (event.lengthComputable) setImportProgress(true, Math.max(2, Math.round((event.loaded / event.total) * 100)), `Uploading ${file.name}…`); });
  xhr.upload.addEventListener("load", () => setImportProgress(true, 100, "Reading workbook and building the queue…", true));
  xhr.addEventListener("load", async () => {
    try {
      if (xhr.status < 200 || xhr.status >= 300) throw new Error(xhr.response?.error || `Import failed (${xhr.status})`);
      state.assignment = ""; state.student = ""; state.syncedAt = ""; state.syncError = ""; clearSelection();
      await refresh(); toast(xhr.response.message);
    } catch (error) { toast(error.message, true); }
    finally { state.importing = false; setImportProgress(false); }
  });
  xhr.addEventListener("error", () => { state.importing = false; setImportProgress(false); toast("The workbook upload was interrupted.", true); });
  xhr.send(body);
}

$("#workbook").addEventListener("change", async event => {
  importWorkbook(event.target.files[0]); event.target.value = "";
});
$("#sync-trigger").addEventListener("click", syncMasterSheet);
$("#import-trigger").addEventListener("click", () => $("#workbook").click());
document.addEventListener("click", event => { if (event.target.closest("[data-sync]")) syncMasterSheet(); if (event.target.closest("[data-import]")) $("#workbook").click(); if (event.target.closest("[data-clear-filters]")) { state.query = ""; state.dateFrom = ""; state.dateTo = ""; $("#search").value = ""; $("#date-from").value = ""; $("#date-to").value = ""; clearSelection(); buildQueue(); } if (!event.target.closest(".student-picker")) document.querySelectorAll(".student-suggestions").forEach(element => element.hidden = true); });
document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => { state.mode = button.dataset.mode; clearSelection(); render(); }));
$("#class-filter").addEventListener("change", event => { state.classId = event.target.value; clearSelection(); render(); });
$("#assignment-filter").addEventListener("change", event => { state.assignment = event.target.value; clearSelection(); buildQueue(); });
$("#student-filter").addEventListener("change", event => { state.student = event.target.value; clearSelection(); buildQueue(); });
$("#search").addEventListener("input", event => { state.query = event.target.value; clearSelection(); buildQueue(); });
$("#date-from").addEventListener("change", event => { state.dateFrom = event.target.value; clearSelection(); buildQueue(); });
$("#date-to").addEventListener("change", event => { state.dateTo = event.target.value; clearSelection(); buildQueue(); });
$("#queue").addEventListener("click", event => { const button = event.target.closest("[data-index]"); if (button) selectSubmission(Number(button.dataset.index)); });
$("#previous").addEventListener("click", () => navigate(-1)); $("#next").addEventListener("click", () => navigate(1));
$("#show-all").addEventListener("change", renderCells); $("#quick-grade").addEventListener("change", () => { renderCells(); if ($("#quick-grade").checked) runAllVisibleCode(); });
$("#cells").addEventListener("click", event => { const button = event.target.closest(".run-code"); if (button) runCode(button); });
document.addEventListener("keydown", event => { if (!$("#quick-grade").checked || ["INPUT","SELECT","TEXTAREA"].includes(event.target.tagName)) return; if (event.key === "ArrowLeft") navigate(-1); if (event.key === "ArrowRight") navigate(1); });

const dialog = $("#classes-dialog"); $("#manage-classes").addEventListener("click", () => dialog.showModal()); $("[data-close]").addEventListener("click", () => dialog.close());
$("#new-class").addEventListener("submit", async event => { event.preventDefault(); const name = new FormData(event.target).get("name"); try { await api("/api/classes", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name})}); event.target.reset(); await refresh(); } catch(error) { toast(error.message, true); } });
$("#class-list").addEventListener("submit", async event => { if (!event.target.matches(".add-student")) return; event.preventDefault(); const classId = event.target.closest("[data-class]").dataset.class; const name = new FormData(event.target).get("name"); try { await api(`/api/classes/${classId}/students`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name})}); await refresh(); } catch(error) { toast(error.message, true); } });
$("#class-list").addEventListener("input", event => { if (event.target.matches(".student-picker input")) showStudentSuggestions(event.target); });
$("#class-list").addEventListener("focusin", event => { if (event.target.matches(".student-picker input")) showStudentSuggestions(event.target); });
$("#class-list").addEventListener("click", async event => {
  const card = event.target.closest("[data-class]"); if (!card) return;
  try {
    const suggestion = event.target.closest(".student-suggestion");
    if (suggestion) { const input = suggestion.closest(".student-picker").querySelector("input"); input.value = suggestion.dataset.name; suggestion.parentElement.hidden = true; input.setAttribute("aria-expanded", "false"); input.focus(); return; }
    if (event.target.matches(".rename-class")) { const name = prompt("Class name", event.target.closest(".class-card-header").querySelector("h3").textContent); if (!name) return; await api(`/api/classes/${card.dataset.class}`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name})}); }
    else if (event.target.matches(".rename-student")) { const name = prompt("Student’s full name", event.target.dataset.name); if (!name) return; await api(`/api/students/${event.target.dataset.student}`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name})}); }
    else if (event.target.matches(".delete-student")) { if (!confirm("Remove this student from the class?")) return; await api(`/api/students/${event.target.dataset.student}`, {method:"DELETE"}); }
    else if (event.target.matches(".delete-class")) { if (!confirm("Delete this class and its roster? Submissions will not be deleted.")) return; await api(`/api/classes/${card.dataset.class}`, {method:"DELETE"}); if (String(state.classId) === card.dataset.class) state.classId = ""; }
    else return;
    await refresh();
  } catch(error) { toast(error.message, true); }
});

async function initialize() {
  try { await refresh(); }
  catch (error) { toast(error.message, true); }
  await syncMasterSheet();
}

initialize();
