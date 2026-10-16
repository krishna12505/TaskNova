
const API_URL = "http://127.0.0.1:5000/api/tasks";

const taskList = document.getElementById("task-list");
const taskForm = document.getElementById("task-form");
const taskFormSection = document.getElementById("task-form-section");
const addTaskButton = document.getElementById("add-task-button");
const cancelTaskButton = document.getElementById("cancel-task-button");
const searchInput = document.getElementById("search-input");
const priorityFilter = document.getElementById("priority-filter");
const messageBox = document.getElementById("message");
const formError = document.getElementById("form-error");
const saveTaskButton = document.getElementById("save-task-button");

let tasks = [];
let currentFilter = "all";
let editingTaskId = null;
let messageTimer;

function showMessage(message, isError = false) {
    clearTimeout(messageTimer);
    messageBox.textContent = message;
    messageBox.classList.toggle("error-message", isError);

    messageTimer = setTimeout(() => {
        messageBox.textContent = "";
        messageBox.classList.remove("error-message");
    }, 4000);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function isOverdue(task) {
    return task.status === "Pending" &&
        task.deadline &&
        task.deadline < new Date().toLocaleDateString("en-CA");
}

async function requestAPI(url, options = {}) {
    let response;

    try {
        response = await fetch(url, {
            ...options,
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...options.headers
            }
        });
    } catch {
        throw new Error(
            "Cannot connect to Flask. Make sure the backend server is running."
        );
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
    }

    return data;
}
function formatAssignedDate(createdAt) {
    if (!createdAt) {
        return "Date unavailable";
    }

    // SQLite CURRENT_TIMESTAMP format:
    // YYYY-MM-DD HH:MM:SS (UTC)
    const date = new Date(createdAt.replace(" ", "T") + "Z");

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata"
    });
}

async function loadTasks() {
    taskList.innerHTML = '<p class="loading-message">Loading tasks...</p>';

    try {
        tasks = await requestAPI(API_URL);
        updateStatistics();
        renderTasks();
    } catch (error) {
        taskList.innerHTML = "";

        const errorElement = document.createElement("p");
        errorElement.className = "empty-state";
        errorElement.textContent = error.message;
        taskList.appendChild(errorElement);
    }
}

function updateStatistics() {
    document.getElementById("total-count").textContent = tasks.length;

    document.getElementById("pending-count").textContent =
        tasks.filter(task => task.status === "Pending").length;

    document.getElementById("completed-count").textContent =
        tasks.filter(task => task.status === "Completed").length;

    document.getElementById("overdue-count").textContent =
        tasks.filter(isOverdue).length;
}

function renderTasks() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    const selectedPriority = priorityFilter.value;

    const filteredTasks = tasks.filter(task => {
        const matchesStatus =
            currentFilter === "all" || task.status === currentFilter;

        const matchesSearch =
            task.title.toLowerCase().includes(searchTerm) ||
            (task.description || "").toLowerCase().includes(searchTerm);

        const matchesPriority =
            selectedPriority === "all" ||
            task.priority === selectedPriority;

        return matchesStatus && matchesSearch && matchesPriority;
    });

    taskList.replaceChildren();

    if (filteredTasks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = tasks.length === 0
            ? "No tasks yet. Click + Add New Task to get started."
            : "No tasks match your search or filters.";
        taskList.appendChild(empty);
        return;
    }

    filteredTasks.forEach(task => {
        const card = document.createElement("article");
        card.className = `task-card ${task.status === "Completed" ? "is-completed" : ""}`;

        const priorityClass = {
            High: "priority-high",
            Medium: "priority-medium",
            Low: "priority-low"
        }[task.priority] || "priority-medium";

        const statusClass = task.status === "Completed"
            ? "status-completed"
            : "status-pending";

       const assignedDateHTML = `
                    <span class="task-deadline">
                        Assigned: ${escapeHTML(formatAssignedDate(task.created_at))}
                    </span>
                `;

      const deadlineHTML = task.deadline
        ? `<span class="task-deadline">Deadline: ${escapeHTML(task.deadline)}</span>`
        : '<span class="task-deadline">No deadline</span>';
        const overdueHTML = isOverdue(task)
            ? '<span class="overdue-label">Overdue</span>'
            : "";

        card.innerHTML = `
            <div class="task-main">
                <h3 class="task-title">${escapeHTML(task.title)}</h3>
                <p class="task-description">${escapeHTML(task.description || "No description provided.")}</p>

                <div class="task-meta">
                    <span class="task-badge ${priorityClass}">${escapeHTML(task.priority)}</span>
                    <span class="task-badge ${statusClass}">${escapeHTML(task.status)}</span>
                    ${assignedDateHTML}
                    ${deadlineHTML}
                    ${overdueHTML}
                </div>
            </div>

            <div class="task-actions">
                <button type="button" data-action="toggle" data-id="${task.id}">
                    ${task.status === "Completed" ? "Reopen" : "Complete"}
                </button>
                <button type="button" data-action="edit" data-id="${task.id}">
                    Edit
                </button>
                <button type="button" class="delete-button" data-action="delete" data-id="${task.id}">
                    Delete
                </button>
            </div>
        `;

        taskList.appendChild(card);
    });
}

function openTaskForm(task = null) {
    editingTaskId = task ? task.id : null;
    taskForm.reset();
    formError.textContent = "";

    document.getElementById("form-title").textContent =
        task ? "Edit Task" : "Create New Task";

    saveTaskButton.textContent = task ? "Update Task" : "Save Task";

        
    if (task) {
        taskForm.elements.title.value = task.title;
        taskForm.elements.description.value = task.description || "";
        taskForm.elements.deadline.value = task.deadline || "";
        taskForm.elements.priority.value = task.priority || "Medium";
        taskForm.elements.status.value = task.status || "Pending";
    } else {
        taskForm.elements.priority.value = "Medium";
        taskForm.elements.status.value = "Pending";
    }


    taskFormSection.hidden = false;
    taskFormSection.scrollIntoView({ behavior: "smooth", block: "start" });
    taskForm.elements.title.focus();
}

function closeTaskForm() {
    taskFormSection.hidden = true;
    taskForm.reset();
    editingTaskId = null;
    formError.textContent = "";
}

addTaskButton.addEventListener("click", () => openTaskForm());
cancelTaskButton.addEventListener("click", closeTaskForm);

taskForm.addEventListener("submit", async event => {
    event.preventDefault();
    formError.textContent = "";

    const title = taskForm.elements.title.value.trim();

    if (!title) {
        formError.textContent = "Please enter a task title.";
        taskForm.elements.title.focus();
        return;
    }

    
    const taskData = {
        title,
        description: taskForm.elements.description.value.trim(),
        deadline: taskForm.elements.deadline.value || null,
        priority: taskForm.elements.priority.value,
        status: taskForm.elements.status.value
    };


    if (editingTaskId !== null) {
        const existingTask = tasks.find(task => task.id === editingTaskId);

        taskData.status = existingTask?.status || "Pending";
    }

    saveTaskButton.disabled = true;
    saveTaskButton.textContent = "Saving...";

    try {
        if (editingTaskId !== null) {
            await requestAPI(`${API_URL}/${editingTaskId}`, {
                method: "PUT",
                body: JSON.stringify(taskData)
            });

            showMessage("Task updated successfully.");
        } else {
            await requestAPI(API_URL, {
                method: "POST",
                body: JSON.stringify(taskData)
            });

            showMessage("Task created successfully.");
        }

        closeTaskForm();
        await loadTasks();
    } catch (error) {
        formError.textContent = error.message;
    } finally {
        saveTaskButton.disabled = false;
        saveTaskButton.textContent =
            editingTaskId !== null ? "Update Task" : "Save Task";
    }
});

taskList.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const taskId = Number(button.dataset.id);
    const action = button.dataset.action;
    const task = tasks.find(item => item.id === taskId);

    if (!task) return;

    try {
        if (action === "edit") {
            openTaskForm(task);
            return;
        }

        if (action === "delete") {
            if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) {
                return;
            }

            await requestAPI(`${API_URL}/${taskId}`, {
                method: "DELETE"
            });

            showMessage("Task deleted successfully.");
        }

        if (action === "toggle") {
            const newStatus = task.status === "Completed"
                ? "Pending"
                : "Completed";

            await requestAPI(`${API_URL}/${taskId}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status: newStatus })
            });

            showMessage(`Task marked ${newStatus.toLowerCase()}.`);
        }

        await loadTasks();
    } catch (error) {
        showMessage(error.message, true);
    }
});

function setFilter(filter) {
    currentFilter = filter;

    document.querySelectorAll("[data-filter]").forEach(element => {
        const isActive = element.dataset.filter === filter;

        if (element.classList.contains("filter-button")) {
            element.classList.toggle("active", isActive);
        }

        if (element.classList.contains("nav-link")) {
            element.classList.toggle("active", isActive);
        }
    });

    renderTasks();
}

document.querySelectorAll("[data-filter]").forEach(element => {
    element.addEventListener("click", event => {
        event.preventDefault();
        setFilter(element.dataset.filter);
    });
});

searchInput.addEventListener("input", renderTasks);
priorityFilter.addEventListener("change", renderTasks);

loadTasks();

// ========================================
// LIGHT / DARK THEME TOGGLE
// ========================================

const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const themeLabel = document.getElementById("theme-label");

function applyTheme(theme) {
    const isDark = theme === "dark";

    document.body.classList.toggle("dark-theme", isDark);

    themeIcon.textContent = isDark ? "☀️" : "🌙";
    themeLabel.textContent = isDark ? "Light Mode" : "Dark Mode";

    themeToggle.setAttribute(
        "aria-label",
        isDark ? "Switch to light theme" : "Switch to dark theme"
    );
}

let savedTheme = "light";

try {
    savedTheme = localStorage.getItem("taskflow-theme") || "light";
} catch {
    savedTheme = "light";
}

applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark-theme");
    const newTheme = isDark ? "light" : "dark";

    applyTheme(newTheme);

    try {
        localStorage.setItem("taskflow-theme", newTheme);
    } catch {
        // Theme still works for the current page session.
    }
});
