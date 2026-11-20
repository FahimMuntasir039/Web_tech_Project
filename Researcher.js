import { dashboardUser, getUsers, initDashboard } from './App.js';
import { createId, getData, getFile, logActivity, removeData, removeFile, saveData, saveFile } from './Storage.js';

if (initDashboard('researcher')) {
    initResearcherCrudResource({
        containerId: 'researcherProjects',
        key: 'projects',
        singular: 'project',
        plural: 'Projects'
    });
    initResearcherCrudResource({
        containerId: 'researcherDocuments',
        key: 'documents',
        singular: 'document',
        plural: 'Documents'
    });
    initResearcherCrudResource({
        containerId: 'researcherTasks',
        key: 'tasks',
        singular: 'task',
        plural: 'Tasks'
    });
    initResearcherCrudResource({
        containerId: 'researcherNotes',
        key: 'notes',
        singular: 'note',
        plural: 'Notes'
    });
    initResearcherCrudResource({
        containerId: 'researcherCitations',
        key: 'citations',
        singular: 'citation',
        plural: 'Citations'
    });

    updateUpcomingDeadlines();
    initCollaboratorInvites();
    renderProjectInvitations();
    window.addEventListener('researcher:records-changed', updateUpcomingDeadlines);
    window.addEventListener('researcher:records-changed', renderProjectInvitations);
    window.addEventListener('storage', renderProjectInvitations);
}

function projectOptions() {
    const projects = getResearcherRecords('projects');
    const options = [];

    for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        options.push({ value: project.id, label: project.title });
    }

    return options;
}

function supervisorOptions() {
    const users = getUsers();
    const options = [];
    for (let index = 0; index < users.length; index += 1) {
        if (users[index].role === 'supervisor' && users[index].status !== 'Inactive') {
            options.push({
                value: users[index].id,
                label: users[index].name + ' (' + users[index].email + ')'
            });
        }
    }
    return options;
}

function assigneeOptions(projectId) {
    const options = [{ value: dashboardUser.id, label: 'Me (' + dashboardUser.name + ')' }];
    const project = getResearcherRecords('projects').find(function (item) {
        return item.id === projectId;
    });
    if (!project) {
        return options;
    }
    const invites = getCollaboratorInvites(project);
    for (let index = 0; index < invites.length; index += 1) {
        if (invites[index].status === 'Accepted') {
            options.push({
                value: invites[index].id,
                label: invites[index].name + ' (' + invites[index].email + ')'
            });
        }
    }
    return options;
}

function getAllProjectRecordsForCollaborator() {
    const users = getUsers();
    const projects = [];
    for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
        const owner = users[userIndex];
        if (owner.role !== 'researcher' || owner.status === 'Inactive') {
            continue;
        }
        const ownedProjects = getRecordsForUser(owner.id, 'projects');
        for (let projectIndex = 0; projectIndex < ownedProjects.length; projectIndex += 1) {
            projects.push({
                ownerId: owner.id,
                ownerName: owner.name,
                project: ownedProjects[projectIndex]
            });
        }
    }
    return projects;
}

function getRecordsForUser(userId, key) {
    const collection = 'user:' + userId + ':' + key;
    const storedIds = getData(collection + ':ids');
    if (!storedIds) {
        return [];
    }
    const ids = storedIds.split('\n');
    const records = [];
    for (let index = 0; index < ids.length; index += 1) {
        if (!ids[index]) {
            continue;
        }
        const recordPrefix = collection + ':' + ids[index] + ':';
        const fields = getData(recordPrefix + 'fields');
        if (!fields) {
            continue;
        }
        const record = { id: ids[index] };
        const fieldNames = fields.split('\n');
        for (let fieldIndex = 0; fieldIndex < fieldNames.length; fieldIndex += 1) {
            const value = getData(recordPrefix + fieldNames[fieldIndex]);
            if (value !== null) {
                record[fieldNames[fieldIndex]] = value;
            }
        }
        records.push(record);
    }
    return records;
}

function getCollaboratorInvites(project) {
    const ids = project.collaboratorIds ? project.collaboratorIds.split('\n').filter(Boolean) : [];
    const emails = project.collaboratorEmails ? project.collaboratorEmails.split('\n') : [];
    const statuses = project.collaboratorStatuses ? project.collaboratorStatuses.split('\n') : [];
    return ids.map(function (id, index) {
        const user = getUsers().find(function (candidate) {
            return candidate.id === id;
        });
        return {
            id: id,
            email: emails[index] || (user ? user.email : ''),
            name: user ? user.name : emails[index] || 'Researcher',
            status: statuses[index] || 'Pending'
        };
    });
}

function initCollaboratorInvites() {
    const search = document.getElementById('projects-collaboratorSearch');
    const addButton = document.getElementById('projects-addCollaborator');
    const idField = document.getElementById('projects-collaboratorIds');
    const emailField = document.getElementById('projects-collaboratorEmails');
    const statusField = document.getElementById('projects-collaboratorStatuses');
    const projectIdField = document.getElementById('projects-collaboratorProjectId');
    if (!search || !addButton || !idField || !emailField || !statusField || !projectIdField) {
        return;
    }

    const selected = [];

    function renderSelected() {
        const ids = [];
        const emails = [];
        const statuses = [];
        for (let index = 0; index < selected.length; index += 1) {
            ids.push(selected[index].id);
            emails.push(selected[index].email);
            statuses.push(selected[index].status);
        }
        idField.value = ids.join('\n');
        emailField.value = emails.join('\n');
        statusField.value = statuses.join('\n');
    }

    addButton.addEventListener('click', function () {
        const email = search.value.trim().toLowerCase();
        if (!email) {
            window.alert('Enter a collaborator email.');
            return;
        }
        const user = getUsers().find(function (candidate) {
            return candidate.role === 'researcher' &&
                candidate.status !== 'Inactive' &&
                candidate.email.toLowerCase() === email &&
                candidate.id !== dashboardUser.id;
        });
        if (!user) {
            window.alert('No active researcher account uses that email.');
            return;
        }
        if (selected.some(function (candidate) { return candidate.id === user.id; })) {
            window.alert('This researcher is already invited.');
            return;
        }
        if (idField.value) {
            const existingIds = idField.value.split('\n').filter(Boolean);
            const existingEmails = emailField.value.split('\n');
            const existingStatuses = statusField.value.split('\n');
            for (let index = 0; index < existingIds.length; index += 1) {
                if (!selected.some(function (candidate) { return candidate.id === existingIds[index]; })) {
                    selected.push({
                        id: existingIds[index],
                        email: existingEmails[index] || '',
                        name: '',
                        status: existingStatuses[index] || 'Pending'
                    });
                }
            }
        }
        selected.push({ id: user.id, email: user.email, name: user.name, status: 'Pending' });
        search.value = '';
        renderSelected();

        if (projectIdField.value) {
            const project = getResearcherRecords('projects').find(function (item) {
                return item.id === projectIdField.value;
            });
            if (project) {
                const collection = getResearcherCollection('projects');
                const record = Object.assign({}, project);
                record.collaboratorIds = idField.value;
                record.collaboratorEmails = emailField.value;
                record.collaboratorStatuses = statusField.value;
                saveResearcherRecord(collection, record);
                renderProjectInvitations();
                window.dispatchEvent(new Event('researcher:records-changed'));
            }
        }
    });

    window.addEventListener('storage', function () {
        renderSelected();
    });
}

function renderProjectInvitations() {
    const container = document.getElementById('researcherProjectInvitations');
    if (!container) {
        return;
    }
    const invitations = [];
    const allProjects = getAllProjectRecordsForCollaborator();
    for (let index = 0; index < allProjects.length; index += 1) {
        const entry = allProjects[index];
        const invites = getCollaboratorInvites(entry.project);
        for (let inviteIndex = 0; inviteIndex < invites.length; inviteIndex += 1) {
            if (invites[inviteIndex].id === dashboardUser.id) {
                invitations.push({
                    ownerId: entry.ownerId,
                    ownerName: entry.ownerName,
                    project: entry.project,
                    status: invites[inviteIndex].status
                });
            }
        }
    }
    container.replaceChildren();
    if (invitations.length === 0) {
        container.textContent = 'No project invitations.';
        return;
    }
    for (let index = 0; index < invitations.length; index += 1) {
        const invitation = invitations[index];
        const card = document.createElement('div');
        card.className = 'card-panel';
        const title = document.createElement('h3');
        title.textContent = invitation.project.title;
        const details = document.createElement('p');
        details.textContent = 'Project owner: ' + invitation.ownerName +
            ' | Status: ' + invitation.status;
        card.appendChild(title);
        card.appendChild(details);
        if (invitation.status === 'Pending') {
            const acceptButton = document.createElement('button');
            acceptButton.type = 'button';
            acceptButton.className = 'btn-primary btn-small';
            acceptButton.textContent = 'Accept invitation';
            acceptButton.addEventListener('click', function () {
                acceptProjectInvitation(invitation);
            });
            card.appendChild(acceptButton);
        }
        container.appendChild(card);
    }
}

function acceptProjectInvitation(invitation) {
    const collection = 'user:' + invitation.ownerId + ':projects';
    const recordPrefix = collection + ':' + invitation.project.id + ':';
    const storedFields = getData(recordPrefix + 'fields');
    if (!storedFields) {
        return;
    }
    const project = getRecordsForUser(invitation.ownerId, 'projects').find(function (item) {
        return item.id === invitation.project.id;
    });
    if (!project) {
        return;
    }
    const ids = project.collaboratorIds.split('\n');
    const statuses = project.collaboratorStatuses ?
        project.collaboratorStatuses.split('\n') : [];
    for (let index = 0; index < ids.length; index += 1) {
        if (ids[index] === dashboardUser.id) {
            statuses[index] = 'Accepted';
        }
    }
    saveData(recordPrefix + 'collaboratorStatuses', statuses.join('\n'));
    let fields = storedFields.split('\n');
    if (fields.indexOf('collaboratorStatuses') === -1) {
        fields.push('collaboratorStatuses');
        saveData(recordPrefix + 'fields', fields.join('\n'));
    }
    logActivity(dashboardUser, 'Accepted project invitation', project.title);
    renderProjectInvitations();
    window.dispatchEvent(new Event('researcher:records-changed'));
}

function updateUpcomingDeadlines() {
    const projects = getResearcherRecords('projects');
    const tasks = getResearcherRecords('tasks');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastUpcomingDate = new Date(today.getTime());
    lastUpcomingDate.setDate(lastUpcomingDate.getDate() + 7);
    const deadlines = [];

    for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        if (project.endDate && new Date(project.endDate + 'T00:00:00') <= lastUpcomingDate) {
            deadlines.push({
                title: project.title,
                projectTitle: project.title,
                date: project.endDate,
                type: 'Project deadline'
            });
        }
    }
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (task.dueDate && task.status !== 'Completed') {
            const dueDate = new Date(task.dueDate + 'T00:00:00');
            if (dueDate <= lastUpcomingDate) {
                let projectName = 'Project unavailable';
                for (let projectIndex = 0; projectIndex < projects.length; projectIndex++) {
                    if (projects[projectIndex].id === task.projectId) {
                        projectName = projects[projectIndex].title;
                        break;
                    }
                }
                deadlines.push({
                    title: task.title,
                    projectTitle: projectName,
                    date: task.dueDate,
                    type: 'Task deadline'
                });
            }
        }
    }

    deadlines.sort(function (firstDeadline, secondDeadline) {
        if (firstDeadline.date < secondDeadline.date) {
            return -1;
        }
        if (firstDeadline.date > secondDeadline.date) {
            return 1;
        }
        return 0;
    });

    const deadlineList = document.getElementById('deadlineList');
    deadlineList.replaceChildren();
    if (deadlines.length === 0) {
        const item = document.createElement('li');
        item.textContent = 'No project or task deadlines are due within the next 7 days or overdue.';
        deadlineList.appendChild(item);
    } else {
        for (let i = 0; i < deadlines.length; i++) {
            const deadline = deadlines[i];
            const item = document.createElement('li');
            item.textContent = deadline.type + ': ' + deadline.title;
            if (deadline.type === 'Task deadline') {
                item.textContent += ' — ' + deadline.projectTitle;
            }
            item.textContent += ' — due ' + deadline.date;
            if (deadline.date < formatDate(today)) {
                item.textContent += ' (overdue)';
            }
            deadlineList.appendChild(item);
        }
    }
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
}

function getResearcherCollection(key) {
    return 'user:' + dashboardUser.id + ':' + key;
}

function getResearcherRecords(key) {
    if (key === 'projects') {
        const recordsById = {};
        const ownRecords = getResearcherRecordsByCollection(key);
        for (let index = 0; index < ownRecords.length; index += 1) {
            recordsById[ownRecords[index].id] = ownRecords[index];
        }
        const allProjects = getAllProjectRecordsForCollaborator();
        for (let projectIndex = 0; projectIndex < allProjects.length; projectIndex += 1) {
            const entry = allProjects[projectIndex];
            if (entry.ownerId === dashboardUser.id) {
                continue;
            }
            const invites = getCollaboratorInvites(entry.project);
            const accepted = invites.some(function (invite) {
                return invite.id === dashboardUser.id && invite.status === 'Accepted';
            });
            if (!accepted) {
                continue;
            }
            const sharedProject = Object.assign({}, entry.project);
            sharedProject.id = entry.ownerId + ':' + entry.project.id;
            sharedProject.ownerProjectId = entry.project.id;
            sharedProject.ownerId = entry.ownerId;
            sharedProject.ownerName = entry.ownerName;
            sharedProject.isSharedProject = 'true';
            recordsById[sharedProject.id] = sharedProject;
        }
        return Object.values(recordsById);
    }
    if (key === 'tasks') {
        const recordsById = {};
        const ownRecords = getResearcherRecordsByCollection(key);
        for (let index = 0; index < ownRecords.length; index += 1) {
            recordsById[ownRecords[index].id] = ownRecords[index];
        }
        const allProjects = getAllProjectRecordsForCollaborator();
        for (let projectIndex = 0; projectIndex < allProjects.length; projectIndex += 1) {
            const entry = allProjects[projectIndex];
            const project = entry.project;
            const invites = getCollaboratorInvites(project);
            const accepted = invites.some(function (invite) {
                return invite.id === dashboardUser.id && invite.status === 'Accepted';
            });
            if (!accepted) {
                continue;
            }
            const ownerTasks = getRecordsForUser(entry.ownerId, 'tasks');
            for (let taskIndex = 0; taskIndex < ownerTasks.length; taskIndex += 1) {
                const task = ownerTasks[taskIndex];
                if (task.projectId === project.id && task.assigneeId === dashboardUser.id) {
                    task.ownerId = entry.ownerId;
                    task.ownerName = entry.ownerName;
                    recordsById[entry.ownerId + ':' + task.id] = task;
                }
            }
        }
        return Object.values(recordsById);
    }
    return getResearcherRecordsByCollection(key);
}

function getResearcherRecordsByCollection(key) {
    const collection = getResearcherCollection(key);
    const storedIds = getData(collection + ':ids');
    if (!storedIds) {
        return [];
    }

    const ids = storedIds.split('\n');
    const records = [];
    for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        if (!id) {
            continue;
        }

        const storedFields = getData(collection + ':' + id + ':fields');
        if (!storedFields) {
            continue;
        }

        const record = { id: id };
        const fields = storedFields.split('\n');
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
            const field = fields[fieldIndex];
            const value = getData(collection + ':' + id + ':' + field);
            if (value !== null) {
                record[field] = value;
            }
        }
        records.push(record);
    }

    return records;
}

function saveResearcherRecord(collection, record) {
    const recordPrefix = collection + ':' + record.id + ':';
    const oldFields = getData(recordPrefix + 'fields');
    const keys = Object.keys(record);
    const fields = [];

    for (let index = 0; index < keys.length; index += 1) {
        if (keys[index] !== 'id') {
            fields.push(keys[index]);
        }
    }

    if (oldFields) {
        const previousFields = oldFields.split('\n');
        for (let index = 0; index < previousFields.length; index += 1) {
            if (fields.indexOf(previousFields[index]) === -1) {
                removeData(recordPrefix + previousFields[index]);
            }
        }
    }

    for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        const value = record[field];
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
            throw new TypeError('Research records must contain simple text or numeric values.');
        }
        saveData(recordPrefix + field, String(value));
    }
    saveData(recordPrefix + 'fields', fields.join('\n'));

    const storedIds = getData(collection + ':ids');
    let ids = [];
    if (storedIds) {
        ids = storedIds.split('\n');
    }
    if (ids.indexOf(record.id) === -1) {
        ids.push(record.id);
        saveData(collection + ':ids', ids.join('\n'));
    }
}
function deleteResearcherRecord(collection, id) {
    const recordPrefix = collection + ':' + id + ':';
    const storedFields = getData(recordPrefix + 'fields');
    if (storedFields) {
        const fields = storedFields.split('\n');
        for (let index = 0; index < fields.length; index += 1) {
            removeData(recordPrefix + fields[index]);
        }
        removeData(recordPrefix + 'fields');
    }

    const storedIds = getData(collection + ':ids');
    if (!storedIds) {
        return;
    }

    const ids = storedIds.split('\n');
    const remainingIds = [];
    for (let index = 0; index < ids.length; index += 1) {
        if (ids[index] && ids[index] !== id) {
            remainingIds.push(ids[index]);
        }
    }

    if (remainingIds.length > 0) {
        saveData(collection + ':ids', remainingIds.join('\n'));
    } else {
        removeData(collection + ':ids');
    }
}

function initResearcherCrudResource(config) {
    const container = document.getElementById(config.containerId);
    const form = container ? container.querySelector('form') : null;
    if (!container || !form || !dashboardUser) {
        return;
    }

    const collection = getResearcherCollection(config.key);
    let editingId = null;
    const controls = {};
    const fields = [];
    const fileUrls = [];
    const controlsInForm = form.querySelectorAll('input[name], select[name], textarea[name]');
    const submit = form.querySelector('button[type="submit"]');
    const cancel = form.querySelector('[data-cancel-edit]');
    const message = container.querySelector('.crud-message');
    const headerRow = container.querySelector('[data-table-headers]');
    const body = container.querySelector('tbody');

    for (let index = 0; index < controlsInForm.length; index += 1) {
        const control = controlsInForm[index];
        if (control.type === 'hidden') {
            continue;
        }
        const label = form.querySelector('label[for="' + control.id + '"]');
        if (!label || !control.getAttribute('aria-describedby')) {
            throw new Error('Researcher form fields need an HTML label and error span.');
        }
        fields.push(control);
        controls[control.name] = control;

        const heading = document.createElement('th');
        heading.textContent = label.textContent;
        headerRow.appendChild(heading);
    }

    if (config.key === 'projects') {
        const approvalHeader = document.createElement('th');
        approvalHeader.textContent = 'Approval status';
        headerRow.appendChild(approvalHeader);
    }

    const actionHeader = document.createElement('th');
    actionHeader.textContent = 'Actions';
    headerRow.appendChild(actionHeader);

    function refreshProjectOptions() {
        for (let index = 0; index < fields.length; index += 1) {
            const select = fields[index];
            if (select.tagName !== 'SELECT' || !select.dataset.options) {
                continue;
            }

            const selectedValue = select.value;
            const placeholder = select.querySelector('option[value=""]');
            const placeholderText = placeholder ? placeholder.textContent : '';
            select.replaceChildren();
            if (placeholderText) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = placeholderText;
                select.appendChild(emptyOption);
            }

            let options = [];
            if (select.dataset.options === 'projects') {
                options = projectOptions();
            } else if (select.dataset.options === 'supervisors') {
                options = supervisorOptions();
            } else if (select.dataset.options === 'assignees') {
                const projectSelect = container.querySelector('[name="projectId"]');
                options = assigneeOptions(projectSelect ? projectSelect.value : '');
            }
            for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
                const option = document.createElement('option');
                option.value = options[optionIndex].value;
                option.textContent = options[optionIndex].label;
                select.appendChild(option);
            }

            let selectedValueExists = false;
            for (let optionIndex = 0; optionIndex < select.options.length; optionIndex += 1) {
                if (select.options[optionIndex].value === selectedValue) {
                    selectedValueExists = true;
                    break;
                }
            }
            if (selectedValue && selectedValueExists) {
                select.value = selectedValue;
            } else if (select.required && options.length > 0) {
                select.value = options[0].value;
            } else if (selectedValueExists) {
                select.value = selectedValue;
            } else {
                select.selectedIndex = 0;
            }
        }
    }

    function clearFieldError(control) {
        const errorElement = document.getElementById(control.getAttribute('aria-describedby'));
        errorElement.textContent = '';
        errorElement.hidden = true;
        control.removeAttribute('aria-invalid');
    }

    function setFieldError(control, text) {
        const errorElement = document.getElementById(control.getAttribute('aria-describedby'));
        errorElement.textContent = text;
        errorElement.hidden = !text;
        if (text) {
            control.setAttribute('aria-invalid', 'true');
        } else {
            control.removeAttribute('aria-invalid');
        }
    }

    function clearAllFieldErrors() {
        for (let index = 0; index < fields.length; index += 1) {
            clearFieldError(fields[index]);
        }
    }

    function validationMessage(control) {
        if (control.validity.valueMissing) {
            return 'Complete this field.';
        }
        if (control.validity.typeMismatch) {
            return control.type === 'url' ? 'Enter a valid URL.' : 'Enter a valid value.';
        }
        if (control.validity.rangeUnderflow || control.validity.rangeOverflow) {
            return 'Enter a value between ' + control.min + ' and ' + control.max + '.';
        }
        return 'Enter a valid value.';
    }

    function validateForm() {
        clearAllFieldErrors();
        const invalidFields = [];
        for (let index = 0; index < fields.length; index += 1) {
            const control = fields[index];
            if (control.type === 'file' && editingId) {
                continue;
            }
            if (!control.validity.valid) {
                invalidFields.push({
                    control: control,
                    message: validationMessage(control)
                });
            }
        }

        const collaboratorField = controls.collaboratorEmails;
        if (collaboratorField && collaboratorField.value.trim()) {
            const emails = collaboratorField.value.split(',');
            for (let index = 0; index < emails.length; index += 1) {
                if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(emails[index].trim())) {
                    invalidFields.push({
                        control: collaboratorField,
                        message: 'Enter valid collaborator emails separated by commas.'
                    });
                    break;
                }
            }
        }

        for (let index = 0; index < invalidFields.length; index += 1) {
            setFieldError(invalidFields[index].control, invalidFields[index].message);
        }
        if (invalidFields.length > 0) {
            invalidFields[0].control.focus();
            return false;
        }
        return true;
    }

    function resetForm() {
        form.reset();
        editingId = null;
        for (let index = 0; index < fields.length; index += 1) {
            fields[index].disabled = false;
        }
        submit.textContent = 'Add ' + config.singular;
        cancel.classList.add('hidden');
        clearAllFieldErrors();
    }

    function render() {
        const records = getResearcherRecords(config.key);
        for (let index = 0; index < fileUrls.length; index += 1) {
            URL.revokeObjectURL(fileUrls[index]);
        }
        fileUrls.length = 0;
        body.replaceChildren();

        if (records.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = fields.length + 1;
            if (config.key === 'projects') {
                cell.colSpan += 1;
            }
            cell.className = 'empty-state';
            cell.textContent = 'No ' + config.plural.toLowerCase() + ' yet. Add one using the form above.';
            row.appendChild(cell);
            body.appendChild(row);
            return;
        }

        for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
            const record = records[recordIndex];
            const row = document.createElement('tr');
            for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
                const field = fields[fieldIndex];
                const cell = document.createElement('td');
                const value = record[field.name] || '';
                if (field.type === 'file') {
                    if (record.fileName) {
                        cell.textContent = 'Loading file...';
                        getFile(record.id).then(function (file) {
                            if (!body.contains(row)) {
                                return;
                            }
                            if (!file) {
                                cell.textContent = 'File unavailable';
                                return;
                            }
                            const url = URL.createObjectURL(file);
                            fileUrls.push(url);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = record.fileName;
                            link.textContent = 'Download ' + record.fileName;
                            cell.replaceChildren(link);
                        }).catch(function (error) {
                            console.error('The uploaded file could not be opened.', error);
                            if (body.contains(row)) {
                                cell.textContent = 'File unavailable';
                            }
                        });
                    } else {
                        cell.textContent = 'No file';
                    }
                } else if (field.tagName === 'SELECT') {
                    const options = field.options;
                    let displayValue = value;
                    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
                        if (options[optionIndex].value === value) {
                            displayValue = options[optionIndex].textContent;
                            break;
                        }
                    }
                    cell.textContent = displayValue;
                } else {
                    cell.textContent = value;
                }
                row.appendChild(cell);
            }

            if (config.key === 'projects') {
                const approvalCell = document.createElement('td');
                approvalCell.textContent = record.approvalStatus || (record.supervisorId ? 'Pending' : 'Not assigned');
                row.appendChild(approvalCell);
            }

            const actions = document.createElement('td');
            actions.className = 'table-actions';
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn-secondary btn-small';
            editButton.textContent = 'Edit';
            editButton.addEventListener('click', function () {
                if (config.key === 'projects' && record.isSharedProject === 'true') {
                    window.alert('This project belongs to ' + record.ownerName + '. It is shared with you as an accepted collaborator.');
                    return;
                }
                editingId = record.id;
                for (let index = 0; index < fields.length; index += 1) {
                    const field = fields[index];
                    if (field.type !== 'file') {
                        controls[field.name].value = record[field.name] || '';
                    }
                }
                if (config.key === 'projects') {
                    const ids = document.getElementById('projects-collaboratorIds');
                    const emails = document.getElementById('projects-collaboratorEmails');
                    const statuses = document.getElementById('projects-collaboratorStatuses');
                    const projectIdField = document.getElementById('projects-collaboratorProjectId');
                    if (ids) ids.value = record.collaboratorIds || '';
                    if (emails) emails.value = record.collaboratorEmails || '';
                    if (statuses) statuses.value = record.collaboratorStatuses || '';
                    if (projectIdField) projectIdField.value = record.id;
                }
                clearAllFieldErrors();
                submit.textContent = 'Save changes';
                cancel.classList.remove('hidden');
            });

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn-danger btn-small';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', async function () {
                if (config.key === 'projects' && record.isSharedProject === 'true') {
                    window.alert('Only the project owner can delete this project.');
                    return;
                }
                if (!window.confirm('Delete this ' + config.singular + '?')) {
                    return;
                }
                try {
                    if (config.key === 'documents') {
                        await removeFile(record.id);
                    }
                    deleteResearcherRecord(collection, record.id);
                } catch (error) {
                    console.error('The ' + config.singular + ' could not be deleted.', error);
                    message.textContent = 'The ' + config.singular + ' could not be deleted.';
                    return;
                }
                try {
                    logActivity(dashboardUser, 'Deleted ' + config.singular, record.title || record.fileName || record.id);
                } catch (error) {
                    console.error('The activity history could not be updated.', error);
                }
                if (editingId === record.id) {
                    resetForm();
                }
                message.textContent = config.singular + ' deleted.';
                render();
                window.dispatchEvent(new Event('researcher:records-changed'));
            });

            actions.appendChild(editButton);
            if (!(config.key === 'tasks' && record.ownerId && record.ownerId !== dashboardUser.id)) {
                actions.appendChild(deleteButton);
            } else {
                const assignedLabel = document.createElement('span');
                assignedLabel.textContent = 'Status updates only';
                actions.appendChild(assignedLabel);
            }
            row.appendChild(actions);
            body.appendChild(row);
        }
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!validateForm()) {
            return;
        }
        const record = {};
        const fileInput = controls.file;
        const selectedFile = fileInput && fileInput.files.length > 0 ? fileInput.files[0] : null;
        let previousRecord = null;
        if (editingId) {
            const records = getResearcherRecords(config.key);
            for (let index = 0; index < records.length; index += 1) {
                if (records[index].id === editingId) {
                    previousRecord = records[index];
                    break;
                }
            }
        }

        for (let index = 0; index < fields.length; index += 1) {
            const field = fields[index];
            if (field.type !== 'file') {
                record[field.name] = field.value.trim();
            }
        }
        if (config.key === 'projects') {
            const collaboratorIds = document.getElementById('projects-collaboratorIds');
            const collaboratorEmails = document.getElementById('projects-collaboratorEmails');
            const collaboratorStatuses = document.getElementById('projects-collaboratorStatuses');
            if (collaboratorIds) record.collaboratorIds = collaboratorIds.value.trim();
            if (collaboratorEmails) record.collaboratorEmails = collaboratorEmails.value.trim();
            if (collaboratorStatuses) record.collaboratorStatuses = collaboratorStatuses.value.trim();
            if (previousRecord) {
                record.approvalStatus = previousRecord.approvalStatus || (record.supervisorId ? 'Pending' : 'Not assigned');
                const reviewFields = [
                    'reviewStatus', 'reviewSubmittedAt', 'reviewerId', 'reviewerName',
                    'acceptedAt', 'verdict', 'reviewComments', 'reviewSubmittedAt',
                    'originalityScore', 'methodologyScore', 'clarityScore',
                    'reviewFolderName', 'reviewFileIds'
                ];
                for (let reviewIndex = 0; reviewIndex < reviewFields.length; reviewIndex += 1) {
                    const fieldName = reviewFields[reviewIndex];
                    if (previousRecord[fieldName] !== undefined) {
                        record[fieldName] = previousRecord[fieldName];
                    }
                }
            } else {
                record.approvalStatus = record.supervisorId ? 'Pending' : 'Not assigned';
            }
        }
        if (config.key === 'tasks') {
            if (!record.assigneeId) {
                record.assigneeId = dashboardUser.id;
            }
            const assignee = getUsers().find(function (user) {
                return user.id === record.assigneeId;
            });
            record.assigneeName = assignee ? assignee.name : dashboardUser.name;
        }

        if (editingId) {
            record.id = editingId;
        } else {
            record.id = createId(config.key);
        }
        if (selectedFile) {
            record.fileName = selectedFile.name;
            record.fileType = selectedFile.type;
            record.fileSize = String(selectedFile.size);
        } else if (previousRecord) {
            record.fileName = previousRecord.fileName || '';
            record.fileType = previousRecord.fileType || '';
            record.fileSize = previousRecord.fileSize || '';
        }

        try {
            const targetCollection = previousRecord && previousRecord.ownerId
                ? 'user:' + previousRecord.ownerId + ':tasks'
                : collection;
            if (previousRecord && previousRecord.ownerId) {
                if (previousRecord.assigneeId !== dashboardUser.id) {
                    throw new Error('Only the assigned collaborator can change this task status.');
                }
                const statusOnlyRecord = {};
                const statusFields = Object.keys(previousRecord);
                for (let fieldIndex = 0; fieldIndex < statusFields.length; fieldIndex += 1) {
                    statusOnlyRecord[statusFields[fieldIndex]] = previousRecord[statusFields[fieldIndex]];
                }
                statusOnlyRecord.status = record.status;
                saveResearcherRecord(targetCollection, statusOnlyRecord);
            } else {
                saveResearcherRecord(collection, record);
            }
            if (selectedFile) {
                await saveFile(record.id, selectedFile);
            }
        } catch (error) {
            console.error('The ' + config.singular + ' could not be saved.', error);
            if (previousRecord) {
                const rollbackCollection = previousRecord.ownerId
                    ? 'user:' + previousRecord.ownerId + ':' + config.key
                    : collection;
                saveResearcherRecord(rollbackCollection, previousRecord);
            } else {
                deleteResearcherRecord(collection, record.id);
            }
            message.textContent = config.key === 'documents'
                ? 'The file could not be stored. Check browser storage and try again.'
                : 'The ' + config.singular + ' could not be saved.';
            return;
        }

        try {
            logActivity(
                dashboardUser,
                (editingId ? 'Updated ' : 'Created ') + config.singular,
                record.title || record.fileName || record.id
            );
        } catch (error) {
            console.error('The activity history could not be updated.', error);
        }
        if (editingId) {
            message.textContent = config.singular + ' updated.';
        } else {
            message.textContent = config.singular + ' added.';
        }
        resetForm();
        render();
        window.dispatchEvent(new Event('researcher:records-changed'));
    });

    cancel.addEventListener('click', function () {
        resetForm();
        message.textContent = '';
    });

    form.addEventListener('input', function (event) {
        if (event.target.matches('input[name], select[name], textarea[name]')) {
            clearFieldError(event.target);
        }
    });
    form.addEventListener('change', function (event) {
        if (event.target.matches('input[name], select[name], textarea[name]')) {
            clearFieldError(event.target);
            if (event.target.name === 'projectId') {
                refreshProjectOptions();
            }
        }
    });

    window.addEventListener('researcher:records-changed', refreshProjectOptions);
    window.addEventListener('storage', function () {
        if (config.key === 'projects') {
            render();
        }
        refreshProjectOptions();
    });
    refreshProjectOptions();
    render();
}
