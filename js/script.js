/* =========================================================
   THE DAILY LEDGER — script.js
   Vanilla JS to-do list with localStorage persistence.
   ========================================================= */

// ---------- Constants ----------
const STORAGE_KEY = "dailyLedger.tasks";
const MAX_CHARS = 120;

// ---------- DOM references ----------
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const charCounter = document.getElementById("charCounter");
const taskList = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const taskCounter = document.getElementById("taskCounter");
const filterButtons = document.querySelectorAll(".filter-btn");
const searchInput = document.getElementById("searchInput");
const clearCompletedBtn = document.getElementById("clearCompletedBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const startDateEl = document.getElementById("startDate");

const dialogOverlay = document.getElementById("confirmDialog");
const dialogTitle = document.getElementById("dialogTitle");
const dialogMessage = document.getElementById("dialogMessage");
const dialogCancel = document.getElementById("dialogCancel");
const dialogConfirm = document.getElementById("dialogConfirm");

// ---------- App state ----------
let tasks = loadTasks();          // array of task objects
let currentFilter = "all";        // "all" | "active" | "completed"
let searchQuery = "";             // live search text
let draggedTaskId = null;         // id of task currently being dragged

// ---------- Persistence ----------

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Could not read saved tasks, starting fresh.", err);
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// ---------- Helpers ----------

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Core task operations ----------

function addTask(text) {
  const trimmed = text.trim();
  if (trimmed === "") return; // prevent empty tasks

  const newTask = {
    id: generateId(),
    text: trimmed,
    completed: false,
    createdAt: new Date().toISOString(),
  };

  tasks.push(newTask);
  saveTasks();
  render();
}

function toggleComplete(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();
  render();
}

function deleteTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  showConfirm(
    "Delete this task?",
    `"${task.text}" will be removed for good.`,
    () => {
      tasks = tasks.filter((t) => t.id !== id);
      saveTasks();
      render();
    }
  );
}

function saveEdit(id, newText) {
  const trimmed = newText.trim();
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  // If the user cleared the text, treat it as a delete-worthy no-op:
  // keep the original text rather than allowing an empty task.
  task.text = trimmed === "" ? task.text : trimmed;
  saveTasks();
  render();
}

function clearCompleted() {
  const completedCount = tasks.filter((t) => t.completed).length;
  if (completedCount === 0) return;

  showConfirm(
    "Clear completed tasks?",
    `${completedCount} completed task${completedCount === 1 ? "" : "s"} will be removed.`,
    () => {
      tasks = tasks.filter((t) => !t.completed);
      saveTasks();
      render();
    }
  );
}

function deleteAllTasks() {
  if (tasks.length === 0) return;

  showConfirm(
    "Delete all tasks?",
    "This clears your entire ledger. This cannot be undone.",
    () => {
      tasks = [];
      saveTasks();
      render();
    }
  );
}

function reorderTasks(draggedId, targetId) {
  const fromIndex = tasks.findIndex((t) => t.id === draggedId);
  const toIndex = tasks.findIndex((t) => t.id === targetId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

  const [moved] = tasks.splice(fromIndex, 1);
  tasks.splice(toIndex, 0, moved);
  saveTasks();
  render();
}

// ---------- Confirmation dialog ----------

let pendingConfirmAction = null;

function showConfirm(title, message, onConfirm) {
  dialogTitle.textContent = title;
  dialogMessage.textContent = message;
  pendingConfirmAction = onConfirm;
  dialogOverlay.hidden = false;
  dialogConfirm.focus();
}

function hideConfirm() {
  dialogOverlay.hidden = true;
  pendingConfirmAction = null;
}

dialogConfirm.addEventListener("click", () => {
  if (typeof pendingConfirmAction === "function") pendingConfirmAction();
  hideConfirm();
});
dialogCancel.addEventListener("click", hideConfirm);
dialogOverlay.addEventListener("click", (e) => {
  if (e.target === dialogOverlay) hideConfirm();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !dialogOverlay.hidden) hideConfirm();
});

// ---------- Rendering ----------

function getVisibleTasks() {
  return tasks
    .filter((task) => {
      if (currentFilter === "active") return !task.completed;
      if (currentFilter === "completed") return task.completed;
      return true; // "all"
    })
    .filter((task) => {
      if (searchQuery === "") return true;
      return task.text.toLowerCase().includes(searchQuery.toLowerCase());
    });
}

function render() {
  const visibleTasks = getVisibleTasks();
  taskList.innerHTML = "";

  visibleTasks.forEach((task) => {
    taskList.appendChild(buildTaskElement(task));
  });

  emptyState.hidden = tasks.length !== 0;
  if (tasks.length !== 0 && visibleTasks.length === 0) {
    emptyState.hidden = false;
    emptyState.querySelector("span").textContent =
      searchQuery !== "" ? "No entries match your search." : "Nothing in this view yet.";
  } else if (tasks.length === 0) {
    emptyState.querySelector("span").textContent = "Add your first entry above.";
  }

  updateCounter();
}

function buildTaskElement(task) {
  const li = document.createElement("li");
  li.className = "task-item" + (task.completed ? " is-completed" : "");
  li.dataset.id = task.id;
  li.draggable = true;

  // Checkbox
  const checkBtn = document.createElement("button");
  checkBtn.className = "task-check";
  checkBtn.setAttribute("aria-label", task.completed ? "Mark as active" : "Mark as complete");
  checkBtn.innerHTML = `
    <svg viewBox="0 0 16 16" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3,8.5 6.5,12 13,4"></polyline>
    </svg>`;
  checkBtn.addEventListener("click", () => toggleComplete(task.id));

  // Body (text + meta), swaps to an input while editing
  const body = document.createElement("div");
  body.className = "task-body";

  const textWrap = document.createElement("div");
  textWrap.className = "task-text-wrap";
  const textSpan = document.createElement("span");
  textSpan.className = "task-text";
  textSpan.textContent = task.text;
  textWrap.appendChild(textSpan);

  const meta = document.createElement("p");
  meta.className = "task-meta";
  meta.textContent = `Added ${formatDate(task.createdAt)}`;

  body.appendChild(textWrap);
  body.appendChild(meta);

  textWrap.addEventListener("dblclick", () => enterEditMode(task, li, body));

  // Actions
  const actions = document.createElement("div");
  actions.className = "task-actions";

  const editBtn = iconButton("icon-edit", "Edit task", editIconSvg());
  editBtn.addEventListener("click", () => enterEditMode(task, li, body));

  const deleteBtn = iconButton("icon-delete", "Delete task", deleteIconSvg());
  deleteBtn.addEventListener("click", () => deleteTask(task.id));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  li.appendChild(checkBtn);
  li.appendChild(body);
  li.appendChild(actions);

  // Drag-and-drop reordering
  li.addEventListener("dragstart", () => {
    draggedTaskId = task.id;
    li.classList.add("is-dragging");
  });
  li.addEventListener("dragend", () => {
    li.classList.remove("is-dragging");
    document.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
  });
  li.addEventListener("dragover", (e) => {
    e.preventDefault();
    li.classList.add("is-drop-target");
  });
  li.addEventListener("dragleave", () => li.classList.remove("is-drop-target"));
  li.addEventListener("drop", (e) => {
    e.preventDefault();
    li.classList.remove("is-drop-target");
    if (draggedTaskId && draggedTaskId !== task.id) {
      reorderTasks(draggedTaskId, task.id);
    }
    draggedTaskId = null;
  });

  return li;
}

function enterEditMode(task, li, body) {
  body.innerHTML = "";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "task-edit-input";
  input.maxLength = MAX_CHARS;
  input.value = task.text;
  body.appendChild(input);

  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  const commit = () => {
    saveEdit(task.id, input.value);
  };
  const cancel = () => {
    render();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", commit);
}

function iconButton(className, label, svgMarkup) {
  const btn = document.createElement("button");
  btn.className = `icon-btn ${className}`;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = svgMarkup;
  return btn;
}

function editIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
  </svg>`;
}

function deleteIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
    <path d="M10 11v6"></path><path d="M14 11v6"></path>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
  </svg>`;
}

function updateCounter() {
  const remaining = tasks.filter((t) => !t.completed).length;
  taskCounter.textContent = `${remaining} ${remaining === 1 ? "entry" : "entries"} remaining`;
}

// ---------- Event listeners ----------

taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask(taskInput.value);
  taskInput.value = "";
  updateCharCounter();
  taskInput.focus();
});

taskInput.addEventListener("input", updateCharCounter);

function updateCharCounter() {
  const len = taskInput.value.length;
  charCounter.textContent = `${len} / ${MAX_CHARS}`;
  charCounter.classList.toggle("is-near-limit", len >= MAX_CHARS - 15 && len < MAX_CHARS);
  charCounter.classList.toggle("is-at-limit", len >= MAX_CHARS);
}

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("is-active");
    btn.setAttribute("aria-selected", "true");
    currentFilter = btn.dataset.filter;
    render();
  });
});

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  render();
});

clearCompletedBtn.addEventListener("click", clearCompleted);
clearAllBtn.addEventListener("click", deleteAllTasks);

// ---------- Init ----------

function init() {
  startDateEl.textContent = new Date().toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  taskInput.maxLength = MAX_CHARS;
  updateCharCounter();
  render();
}

init();