/* =========================================================
   To-Do List App
   Vanilla JS — state stored in localStorage
   ========================================================= */

// ---------- Constants & DOM references ----------
const STORAGE_KEY = 'todo.tasks.v1';
const THEME_KEY = 'todo.theme.v1';

const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const prioritySelect = document.getElementById('prioritySelect');
const dueDateInput = document.getElementById('dueDateInput');
const charCount = document.getElementById('charCount');

const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const taskCounter = document.getElementById('taskCounter');

const filterButtons = document.querySelectorAll('.filter-btn');
const searchInput = document.getElementById('searchInput');

const clearCompletedBtn = document.getElementById('clearCompletedBtn');
const deleteAllBtn = document.getElementById('deleteAllBtn');

const themeToggle = document.getElementById('themeToggle');

const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');

// ---------- localStorage helpers ----------
// Some browsers block localStorage entirely when a page is opened directly
// from disk (file://) instead of served over http(s) — it's treated as an
// "opaque origin" and throws a SecurityError. We guard every access so a
// blocked storage API degrades gracefully (tasks just won't persist) instead
// of throwing an uncaught error that stops the rest of script.js — including
// the button/form event listeners — from ever running.
let storageAvailable = true;

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    storageAvailable = false;
    console.warn(
      'localStorage is unavailable (common when opening this file directly ' +
      'from disk). Tasks will still work this session but won\'t be saved ' +
      'after you close the page. Serve the folder from a local web server ' +
      'to enable saving.',
      err
    );
    return [];
  }
}

function saveTasks() {
  if (!storageAvailable) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    storageAvailable = false;
    console.warn('Could not save tasks to localStorage.', err);
  }
}

// ---------- App state ----------
let tasks = loadTasks();          // array of task objects
let currentFilter = 'all';        // 'all' | 'active' | 'completed'
let searchTerm = '';
let draggedTaskId = null;
let pendingConfirmAction = null;  // function to run if user confirms

// ---------- Task factory ----------
function createTask(text, priority, dueDate) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    text: text,
    completed: false,
    priority: priority || 'medium',
    dueDate: dueDate || '',
    createdAt: new Date().toISOString(),
  };
}

// ---------- Rendering ----------
function render() {
  // Filter by active/completed/all
  let visibleTasks = tasks.filter((task) => {
    if (currentFilter === 'active') return !task.completed;
    if (currentFilter === 'completed') return task.completed;
    return true;
  });

  // Apply search term
  if (searchTerm.trim() !== '') {
    const term = searchTerm.trim().toLowerCase();
    visibleTasks = visibleTasks.filter((task) =>
      task.text.toLowerCase().includes(term)
    );
  }

  taskList.innerHTML = '';

  visibleTasks.forEach((task) => {
    taskList.appendChild(buildTaskElement(task));
  });

  const hasAnyTasks = tasks.length > 0;
  const showEmpty = visibleTasks.length === 0;
  emptyState.classList.toggle('show', showEmpty);
  emptyState.textContent = hasAnyTasks
    ? 'No tasks match your current filter/search.'
    : 'No tasks yet. Add one above to get started!';

  updateCounter();
}

function buildTaskElement(task) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.completed ? ' completed' : '');
  li.dataset.id = task.id;
  li.draggable = true;

  // Priority dot
  const dot = document.createElement('span');
  dot.className = 'priority-dot priority-' + task.priority;
  li.appendChild(dot);

  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.setAttribute('aria-label', 'Mark task completed');
  checkbox.addEventListener('change', () => toggleComplete(task.id));
  li.appendChild(checkbox);

  // Main content (text + meta)
  const main = document.createElement('div');
  main.className = 'task-main';

  const textSpan = document.createElement('span');
  textSpan.className = 'task-text';
  textSpan.textContent = task.text;
  main.appendChild(textSpan);

  const meta = document.createElement('div');
  meta.className = 'task-meta';
  meta.appendChild(makeMetaSpan('Created ' + formatDate(task.createdAt)));
  if (task.dueDate) {
    meta.appendChild(makeMetaSpan('Due ' + task.dueDate));
  }
  main.appendChild(meta);

  li.appendChild(main);

  // Actions: edit + delete
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'edit-btn';
  editBtn.title = 'Edit task';
  editBtn.textContent = '✏️';
  editBtn.addEventListener('click', () => startEditing(textSpan, task));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-btn';
  deleteBtn.title = 'Delete task';
  deleteBtn.textContent = '🗑️';
  deleteBtn.addEventListener('click', () => confirmDeleteTask(task.id));
  actions.appendChild(deleteBtn);

  li.appendChild(actions);

  // Drag and drop reordering
  li.addEventListener('dragstart', () => {
    draggedTaskId = task.id;
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => {
    draggedTaskId = null;
    li.classList.remove('dragging');
  });
  li.addEventListener('dragover', (e) => e.preventDefault());
  li.addEventListener('drop', () => reorderTasks(draggedTaskId, task.id));

  return li;
}

function makeMetaSpan(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- Counter ----------
function updateCounter() {
  const remaining = tasks.filter((task) => !task.completed).length;
  taskCounter.textContent = remaining === 1
    ? '1 task remaining'
    : remaining + ' tasks remaining';
}

// ---------- CRUD operations ----------
function addTask(text, priority, dueDate) {
  const trimmed = text.trim();
  if (trimmed === '') return; // prevent empty tasks

  const newTask = createTask(trimmed, priority, dueDate);
  tasks.unshift(newTask);
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
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
}

function updateTaskText(id, newText) {
  const trimmed = newText.trim();
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  if (trimmed === '') {
    // Don't allow an empty task; revert to original text.
    render();
    return;
  }
  task.text = trimmed;
  saveTasks();
  render();
}

function clearCompleted() {
  tasks = tasks.filter((t) => !t.completed);
  saveTasks();
  render();
}

function deleteAllTasks() {
  tasks = [];
  saveTasks();
  render();
}

function reorderTasks(draggedId, targetId) {
  if (!draggedId || draggedId === targetId) return;
  const fromIndex = tasks.findIndex((t) => t.id === draggedId);
  const toIndex = tasks.findIndex((t) => t.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;

  const [moved] = tasks.splice(fromIndex, 1);
  tasks.splice(toIndex, 0, moved);
  saveTasks();
  render();
}

// ---------- Inline editing ----------
function startEditing(textSpan, task) {
  textSpan.contentEditable = 'true';
  textSpan.focus();
  placeCaretAtEnd(textSpan);

  const finishEditing = () => {
    textSpan.contentEditable = 'false';
    updateTaskText(task.id, textSpan.textContent);
    textSpan.removeEventListener('blur', finishEditing);
    textSpan.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      textSpan.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      textSpan.textContent = task.text; // revert
      textSpan.blur();
    }
  };

  textSpan.addEventListener('blur', finishEditing);
  textSpan.addEventListener('keydown', onKeyDown);
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

// ---------- Confirmation modal ----------
function openConfirm(message, onConfirm) {
  confirmMessage.textContent = message;
  pendingConfirmAction = onConfirm;
  confirmModal.classList.remove('hidden');
}

function closeConfirm() {
  confirmModal.classList.add('hidden');
  pendingConfirmAction = null;
}

function confirmDeleteTask(id) {
  openConfirm('Delete this task?', () => deleteTask(id));
}

confirmYes.addEventListener('click', () => {
  if (pendingConfirmAction) pendingConfirmAction();
  closeConfirm();
});
confirmNo.addEventListener('click', closeConfirm);
confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) closeConfirm();
});

// ---------- Filters ----------
filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

// ---------- Search ----------
searchInput.addEventListener('input', (e) => {
  searchTerm = e.target.value;
  render();
});

// ---------- Add task form ----------
taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addTask(taskInput.value, prioritySelect.value, dueDateInput.value);
  taskInput.value = '';
  dueDateInput.value = '';
  charCount.textContent = '0';
  taskInput.focus();
});

taskInput.addEventListener('input', () => {
  charCount.textContent = taskInput.value.length.toString();
});

// ---------- Clear completed / delete all ----------
clearCompletedBtn.addEventListener('click', () => {
  const hasCompleted = tasks.some((t) => t.completed);
  if (!hasCompleted) return;
  openConfirm('Remove all completed tasks?', clearCompleted);
});

deleteAllBtn.addEventListener('click', () => {
  if (tasks.length === 0) return;
  openConfirm('Delete ALL tasks? This cannot be undone.', deleteAllTasks);
});

// ---------- Theme toggle ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (err) {
    // localStorage blocked — fall back to system preference only.
  }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (err) {
    // localStorage blocked — theme choice just won't persist.
  }
});

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  // "/" focuses the search box (like many apps), unless typing already
  if (e.key === '/' && document.activeElement !== searchInput && document.activeElement !== taskInput) {
    e.preventDefault();
    searchInput.focus();
  }
  // Ctrl/Cmd + Enter focuses the add-task input from anywhere
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    taskInput.focus();
  }
});

// ---------- Init ----------
initTheme();
render();