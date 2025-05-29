document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const taskInput = document.getElementById('task-input');
    const addTaskBtn = document.getElementById('add-task-btn');
    const taskList = document.getElementById('task-list');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    const enableNotificationsBtn = document.getElementById('enable-notifications');
    const notificationPermission = document.querySelector('.notification-permission');

    // Current filter
    let currentFilter = 'all';

    // Initialize the app
    init();

    // Event Listeners
    addTaskBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addTask();
    });

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentFilter = button.dataset.filter;
            renderTasks();
        });
    });

    exportBtn.addEventListener('click', exportTasks);
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', importTasks);
    enableNotificationsBtn.addEventListener('click', requestNotificationPermission);

    // Check for notification permission
    checkNotificationPermission();

    // Initialize the app
    function init() {
        // Check for missed tasks at midnight
        checkMissedTasks();
        
        // Set up daily check for missed tasks
        setInterval(checkMissedTasks, 60000); // Check every minute
        
        // Load tasks from localStorage
        renderTasks();
        
        // Register service worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js').then(registration => {
                    console.log('ServiceWorker registration successful');
                }).catch(err => {
                    console.log('ServiceWorker registration failed: ', err);
                });
            });
        }
    }

    // Add a new task
    function addTask() {
        const taskText = taskInput.value.trim();
        if (taskText === '') return;

        const tasks = getTasks();
        const newTask = {
            id: Date.now(),
            text: taskText,
            completed: false,
            createdAt: new Date().toISOString(),
            lastCompleted: null,
            streak: 0,
            history: []
        };

        tasks.push(newTask);
        saveTasks(tasks);
        taskInput.value = '';
        renderTasks();
    }

    // Render tasks based on current filter
    function renderTasks() {
        const tasks = getTasks();
        taskList.innerHTML = '';

        if (tasks.length === 0) {
            taskList.innerHTML = '<p class="no-tasks">No tasks found. Add a task to get started!</p>';
            return;
        }

        const filteredTasks = tasks.filter(task => {
            if (currentFilter === 'all') return true;
            if (currentFilter === 'completed') return task.completed;
            if (currentFilter === 'pending') return !task.completed;
            return true;
        });

        filteredTasks.forEach(task => {
            const taskItem = document.createElement('div');
            taskItem.className = `task-item ${task.completed ? 'completed' : 'pending'}`;
            taskItem.dataset.id = task.id;

            const dueText = getDueText(task);
            const streakIcon = getStreakIcon(task.streak);

            taskItem.innerHTML = `
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                <span class="task-text ${task.completed ? 'completed' : ''}">${task.text}</span>
                <span class="task-due">${dueText}</span>
                <span class="task-streak">
                    <span class="streak-icon">${streakIcon}</span>
                    ${task.streak > 0 ? task.streak + ' days' : 'No streak'}
                </span>
                <div class="task-actions">
                    <button class="edit-btn" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            `;

            const checkbox = taskItem.querySelector('.task-checkbox');
            const editBtn = taskItem.querySelector('.edit-btn');
            const deleteBtn = taskItem.querySelector('.delete-btn');

            checkbox.addEventListener('change', () => toggleTaskCompletion(task.id));
            editBtn.addEventListener('click', () => editTask(task.id));
            deleteBtn.addEventListener('click', () => deleteTask(task.id));

            taskList.appendChild(taskItem);
        });
    }

    // Toggle task completion status
    function toggleTaskCompletion(taskId) {
        const tasks = getTasks();
        const taskIndex = tasks.findIndex(task => task.id === taskId);
        
        if (taskIndex === -1) return;

        const task = tasks[taskIndex];
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        
        if (!task.completed) {
            // Marking as completed
            task.completed = true;
            task.lastCompleted = new Date().toISOString();
            
            // Check if this is consecutive completion
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            if (task.history.includes(yesterdayStr)) {
                task.streak += 1;
            } else {
                // Check if it's the first completion or if streak was broken
                if (task.streak === 0) {
                    task.streak = 1;
                }
            }
            
            // Add today to history
            const todayStr = now.toISOString().split('T')[0];
            if (!task.history.includes(todayStr)) {
                task.history.push(todayStr);
            }
        } else {
            // Marking as incomplete
            task.completed = false;
        }
        
        saveTasks(tasks);
        renderTasks();
    }

    // Edit a task
    function editTask(taskId) {
        const tasks = getTasks();
        const task = tasks.find(task => task.id === taskId);
        
        if (!task) return;
        
        const newText = prompt('Edit your task:', task.text);
        if (newText !== null && newText.trim() !== '') {
            task.text = newText.trim();
            saveTasks(tasks);
            renderTasks();
        }
    }

    // Delete a task
    function deleteTask(taskId) {
        if (confirm('Are you sure you want to delete this task?')) {
            const tasks = getTasks().filter(task => task.id !== taskId);
            saveTasks(tasks);
            renderTasks();
        }
    }

    // Get tasks from localStorage
    function getTasks() {
        const tasksJSON = localStorage.getItem('tasks');
        return tasksJSON ? JSON.parse(tasksJSON) : [];
    }

    // Save tasks to localStorage
    function saveTasks(tasks) {
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    // Export tasks as JSON file
    function exportTasks() {
        const tasks = getTasks();
        const dataStr = JSON.stringify(tasks, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `tasks-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }

    // Import tasks from JSON file
    function importTasks(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedTasks = JSON.parse(e.target.result);
                if (Array.isArray(importedTasks)) {
                    if (confirm(`Import ${importedTasks.length} tasks? This will replace your current tasks.`)) {
                        saveTasks(importedTasks);
                        renderTasks();
                    }
                } else {
                    alert('Invalid file format. Please import a valid JSON file.');
                }
            } catch (error) {
                alert('Error parsing JSON file. Please check the file format.');
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    }

    // Check for missed tasks at midnight
    function checkMissedTasks() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        
        // Check once a day around midnight (between 23:55 and 00:05)
        if ((hours === 23 && minutes >= 55) || (hours === 0 && minutes <= 5)) {
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            const tasks = getTasks();
            let updated = false;
            
            tasks.forEach(task => {
                if (!task.completed && task.history.length > 0) {
                    // Check if task wasn't completed yesterday
                    if (!task.history.includes(yesterdayStr)) {
                        // Reset streak if more than 1 miss in the last 7 days
                        const lastWeek = new Date(now);
                        lastWeek.setDate(lastWeek.getDate() - 7);
                        
                        const missedDays = task.history.filter(date => {
                            const dateObj = new Date(date);
                            return dateObj >= lastWeek && !task.history.includes(date);
                        });
                        
                        if (missedDays.length > 1) {
                            task.streak = 0;
                            updated = true;
                        }
                    }
                }
            });
            
            if (updated) {
                saveTasks(tasks);
                renderTasks();
            }
            
            // Send notification for pending tasks
            if (Notification.permission === 'granted') {
                const pendingTasks = tasks.filter(task => !task.completed);
                if (pendingTasks.length > 0) {
                    new Notification('Pending Tasks Reminder', {
                        body: `You have ${pendingTasks.length} pending task(s) to complete today!`,
                        icon: '/icons/icon-192x192.png'
                    });
                }
            }
        }
    }

    // Check notification permission
    function checkNotificationPermission() {
        if (Notification.permission === 'default') {
            notificationPermission.style.display = 'block';
        } else {
            notificationPermission.style.display = 'none';
        }
    }

    // Request notification permission
    function requestNotificationPermission() {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                notificationPermission.style.display = 'none';
                // Show a welcome notification
                new Notification('Notifications Enabled', {
                    body: 'You will now receive reminders for your pending tasks!',
                    icon: '/icons/icon-192x192.png'
                });
            }
        });
    }

    // Get due text for a task
    function getDueText(task) {
        if (task.completed) {
            const lastCompleted = new Date(task.lastCompleted);
            return `Completed: ${lastCompleted.toLocaleDateString()}`;
        } else {
            const created = new Date(task.createdAt);
            return `Added: ${created.toLocaleDateString()}`;
        }
    }

    // Get streak icon based on streak count
    function getStreakIcon(streak) {
        if (streak >= 7) return '🔥🔥';
        if (streak >= 3) return '🔥';
        if (streak > 0) return '⭐';
        return '❌';
    }
});
