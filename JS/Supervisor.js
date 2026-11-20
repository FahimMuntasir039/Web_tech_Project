import { dashboardUser, getUsers, initDashboard } from './App.js';
import { createId, getData, getFile, logActivity, removeData, saveData, saveFile } from './Storage.js';

let supervisorFileUrls = [];

if (initDashboard('supervisor')) {
    initSupervisorCrud({
        containerId: 'supervisorFeedback',
        key: 'feedback',
        singular: 'feedback entry',
        plural: 'Feedback entries'
    });
    initSupervisorCrud({
        containerId: 'supervisorMilestones',
        key: 'milestones',
        singular: 'milestone',
        plural: 'Milestones'
    });
    initSupervisorCrud({
        containerId: 'supervisorMeetings',
        key: 'meetings',
        singular: 'meeting',
        plural: 'Meetings'
    });
    renderSupervisorProjects();
    renderSupervisorExternalReview();
    renderSupervisedDocuments();
    initExternalReviewForm();
    window.addEventListener('storage', function () {
        renderSupervisorProjects();
        renderSupervisorExternalReview();
        renderSupervisedDocuments();
    });
}

function getAssignedProjects() {
    const users = getUsers();
    const projects = [];
    for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
        const researcher = users[userIndex];
        if (researcher.role !== 'researcher' || researcher.status === 'Inactive') {
            continue;
        }

        const researcherProjects = getRecordsForUser(researcher.id, 'projects');
        const researcherTasks = getRecordsForUser(researcher.id, 'tasks');
        for (let projectIndex = 0; projectIndex < researcherProjects.length; projectIndex += 1) {
            const project = researcherProjects[projectIndex];
            if (project.supervisorId !== dashboardUser.id) {
                continue;
            }
            project.researcherId = researcher.id;
            project.researcherName = researcher.name;
            project.tasks = [];
            for (let taskIndex = 0; taskIndex < researcherTasks.length; taskIndex += 1) {
                if (researcherTasks[taskIndex].projectId === project.id) {
                    project.tasks.push(researcherTasks[taskIndex]);
                }
            }
            projects.push(project);
        }
    }
    return projects;
}

function getSupervisedProjects() {
    const assignedProjects = getAssignedProjects();
    const approvedProjects = [];
    for (let index = 0; index < assignedProjects.length; index += 1) {
        if (assignedProjects[index].approvalStatus === 'Approved') {
            approvedProjects.push(assignedProjects[index]);
        }
    }
    return approvedProjects;
}

function updateProjectReview(project, fields) {
    const collection = 'user:' + project.researcherId + ':projects';
    const recordPrefix = collection + ':' + project.id + ':';
    const storedFields = getData(recordPrefix + 'fields');
    if (!storedFields) {
        throw new Error('The project no longer exists.');
    }

    const fieldNames = storedFields.split('\n');
    for (const fieldName of Object.keys(fields)) {
        if (fieldNames.indexOf(fieldName) === -1) {
            fieldNames.push(fieldName);
        }
        saveData(recordPrefix + fieldName, String(fields[fieldName]));
    }
    saveData(recordPrefix + 'fields', fieldNames.join('\n'));
}

function setProjectForReview(project, folderName, fileIds) {
    if (project.approvalStatus !== 'Approved') {
        throw new Error('Only approved projects can be sent for review.');
    }
    const currentProjects = getRecordsForUser(project.researcherId, 'projects');
    let currentProject = null;
    for (let index = 0; index < currentProjects.length; index += 1) {
        if (currentProjects[index].id === project.id) {
            currentProject = currentProjects[index];
            break;
        }
    }
    if (!currentProject || currentProject.approvalStatus !== 'Approved') {
        throw new Error('This project is no longer approved.');
    }
    if (currentProject.reviewStatus && currentProject.reviewStatus !== 'Not submitted') {
        throw new Error('This project has already been submitted or accepted for review.');
    }

    updateProjectReview(project, {
        reviewStatus: 'Available for review',
        reviewSubmittedAt: new Date().toISOString(),
        reviewFolderName: folderName,
        reviewFileIds: fileIds.join('\n')
    });
}

function updateProjectApproval(project, approvalStatus) {
    const collection = 'user:' + project.researcherId + ':projects';
    const recordPrefix = collection + ':' + project.id + ':';
    const storedFields = getData(recordPrefix + 'fields');
    if (!storedFields) {
        throw new Error('The project no longer exists.');
    }

    const currentProject = getRecordsForUser(project.researcherId, 'projects');
    let assignedProject = null;
    for (let index = 0; index < currentProject.length; index += 1) {
        if (currentProject[index].id === project.id) {
            assignedProject = currentProject[index];
            break;
        }
    }
    if (!assignedProject || assignedProject.supervisorId !== dashboardUser.id ||
        (assignedProject.approvalStatus && assignedProject.approvalStatus !== 'Pending')) {
        throw new Error('This project is no longer waiting for your approval.');
    }

    const fields = storedFields.split('\n');
    if (fields.indexOf('approvalStatus') === -1) {
        fields.push('approvalStatus');
        saveData(recordPrefix + 'fields', fields.join('\n'));
    }
    saveData(recordPrefix + 'approvalStatus', approvalStatus);
}

function renderSupervisorProjects() {
    const container = document.getElementById('supervisorProjectApprovals');
    const message = document.getElementById('supervisorProjectApprovalMessage');
    if (!container || !dashboardUser) {
        return;
    }
    message.textContent = '';

    const projects = getAssignedProjects();
    if (projects.length === 0) {
        container.textContent = 'No researcher project proposals have been assigned to you yet.';
        return;
    }

    const table = document.createElement('table');
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    const headings = ['Project', 'Researcher', 'Domain', 'Description', 'Objectives', 'Target date', 'Approval status', 'Tasks completed', 'Progress', 'Actions'];
    for (let index = 0; index < headings.length; index += 1) {
        const cell = document.createElement('th');
        cell.textContent = headings[index];
        header.appendChild(cell);
    }
    head.appendChild(header);
    table.appendChild(head);

    const body = document.createElement('tbody');
    for (let index = 0; index < projects.length; index += 1) {
        const project = projects[index];
        const row = document.createElement('tr');
        const approvalStatus = project.approvalStatus || 'Pending';
        let completedTasks = 0;
        for (let taskIndex = 0; taskIndex < project.tasks.length; taskIndex += 1) {
            if (project.tasks[taskIndex].status === 'Completed') {
                completedTasks += 1;
            }
        }
        let progress = '—';
        let taskCount = '—';
        if (approvalStatus === 'Approved') {
            taskCount = completedTasks + ' / ' + project.tasks.length;
            progress = (project.tasks.length > 0
                ? Math.round((completedTasks / project.tasks.length) * 100)
                : 0) + '%';
        }
        const values = [
            project.title,
            project.researcherName,
            project.domain,
            project.description,
            project.objectives,
            project.endDate,
            approvalStatus,
            taskCount,
            progress
        ];
        for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
            const cell = document.createElement('td');
            cell.textContent = values[valueIndex] || '';
            row.appendChild(cell);
        }

        const actions = document.createElement('td');
        actions.className = 'table-actions';
        if (approvalStatus === 'Pending') {
            const approveButton = document.createElement('button');
            approveButton.type = 'button';
            approveButton.className = 'btn-primary btn-small';
            approveButton.textContent = 'Approve';
            approveButton.addEventListener('click', function () {
                setProjectApproval(project, 'Approved');
            });

            const rejectButton = document.createElement('button');
            rejectButton.type = 'button';
            rejectButton.className = 'btn-danger btn-small';
            rejectButton.textContent = 'Reject';
            rejectButton.addEventListener('click', function () {
                setProjectApproval(project, 'Rejected');
            });

            actions.appendChild(approveButton);
            actions.appendChild(rejectButton);
        } else {
            actions.textContent = '—';
        }
        row.appendChild(actions);
        body.appendChild(row);
    }
    table.appendChild(body);
    container.replaceChildren(table);
}

function initExternalReviewForm() {
    const form = document.getElementById('externalReviewForm');
    const projectSelect = document.getElementById('externalReviewProject');
    const folderInput = document.getElementById('externalReviewFolder');
    const message = document.getElementById('supervisorExternalReviewMessage');
    if (!form || !projectSelect || !folderInput || !dashboardUser) {
        return;
    }

    function refreshProjectOptions() {
        const selectedValue = projectSelect.value;
        projectSelect.replaceChildren();
        const projects = getAssignedProjects().filter(function (project) {
            return project.approvalStatus === 'Approved' &&
                (!project.reviewStatus || project.reviewStatus === 'Not submitted');
        });
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = projects.length ? 'Choose an approved project' : 'No approved projects available';
        projectSelect.appendChild(placeholder);
        for (let index = 0; index < projects.length; index += 1) {
            const option = document.createElement('option');
            option.value = projects[index].researcherId + ':' + projects[index].id;
            option.textContent = projects[index].title + ' — ' + projects[index].researcherName;
            projectSelect.appendChild(option);
        }
        if (selectedValue) {
            projectSelect.value = selectedValue;
        }
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const selection = projectSelect.value;
        if (!selection) {
            message.textContent = 'Choose an approved project.';
            return;
        }
        if (!folderInput.files || folderInput.files.length === 0) {
            message.textContent = 'Select a project folder.';
            return;
        }

        const separatorIndex = selection.indexOf(':');
        const researcherId = selection.slice(0, separatorIndex);
        const projectId = selection.slice(separatorIndex + 1);
        const projects = getAssignedProjects();
        let project = null;
        for (let index = 0; index < projects.length; index += 1) {
            if (projects[index].researcherId === researcherId && projects[index].id === projectId) {
                project = projects[index];
                break;
            }
        }
        if (!project) {
            message.textContent = 'The selected project is no longer available.';
            return;
        }

        const firstFile = folderInput.files[0];
        const relativePath = firstFile.webkitRelativePath || firstFile.name;
        const folderName = relativePath.split('/')[0] || 'Selected project folder';
        const fileIds = [];
        try {
            for (let index = 0; index < folderInput.files.length; index += 1) {
                const file = folderInput.files[index];
                const fileId = createId('review-file');
                await saveFile(fileId, file);
                fileIds.push(fileId);
                saveData('rcp-review-file:' + fileId + ':name', file.name);
                saveData('rcp-review-file:' + fileId + ':path',
                    file.webkitRelativePath || file.name);
            }
            setProjectForReview(project, folderName, fileIds);
            logActivity(dashboardUser, 'Set project folder for review',
                project.title + ' — ' + folderName);
        } catch (error) {
            console.error('The project folder could not be submitted.', error);
            message.textContent = error.message || 'The project folder could not be submitted.';
            return;
        }

        message.textContent = 'Project folder submitted for external review.';
        form.reset();
        refreshProjectOptions();
        renderSupervisorExternalReview();
        renderSupervisorProjects();
        window.dispatchEvent(new Event('supervisor:records-changed'));
    });

    window.addEventListener('supervisor:records-changed', refreshProjectOptions);
    window.addEventListener('storage', refreshProjectOptions);
    refreshProjectOptions();
}

function renderSupervisorExternalReview() {
    const container = document.getElementById('supervisorExternalReview');
    const message = document.getElementById('supervisorExternalReviewMessage');
    if (!container || !dashboardUser) {
        return;
    }

    const projects = getAssignedProjects();
    if (projects.length === 0) {
        container.textContent = 'No projects are assigned to you yet.';
        return;
    }

    const table = document.createElement('table');
    const header = document.createElement('tr');
    const headings = ['Project', 'Researcher', 'Approval', 'Project folder', 'Review status', 'Reviewer', 'Verdict', 'Action'];
    for (let index = 0; index < headings.length; index += 1) {
        const heading = document.createElement('th');
        heading.textContent = headings[index];
        header.appendChild(heading);
    }
    const head = document.createElement('thead');
    head.appendChild(header);
    table.appendChild(head);

    const body = document.createElement('tbody');
    for (let index = 0; index < projects.length; index += 1) {
        const project = projects[index];
        const approvalStatus = project.approvalStatus || 'Pending';
        const reviewStatus = project.reviewStatus || 'Not submitted';
        const values = [
            project.title,
            project.researcherName,
            approvalStatus,
            project.reviewFolderName || 'Not selected',
            reviewStatus,
            project.reviewerName || 'Not accepted',
            project.verdict || 'Pending'
        ];
        const row = document.createElement('tr');
        for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
            const cell = document.createElement('td');
            cell.textContent = values[valueIndex];
            row.appendChild(cell);
        }
        const actionCell = document.createElement('td');
        actionCell.className = 'table-actions';
        if (approvalStatus === 'Approved' && reviewStatus === 'Available for review') {
            actionCell.textContent = 'Waiting for reviewer';
        } else if (approvalStatus === 'Approved' && reviewStatus === 'Accepted') {
            actionCell.textContent = 'Accepted';
        } else if (approvalStatus === 'Approved' && reviewStatus === 'Reviewed') {
            actionCell.textContent = 'Reviewed';
        } else {
            actionCell.textContent = '—';
        }
        row.appendChild(actionCell);
        body.appendChild(row);
    }
    table.appendChild(body);
    container.replaceChildren(table);
}

function setProjectApproval(project, approvalStatus) {
    try {
        updateProjectApproval(project, approvalStatus);
    } catch (error) {
        console.error('The project approval could not be saved.', error);
        const message = document.getElementById('supervisorProjectApprovalMessage');
        message.textContent = error.message || 'The project approval could not be saved.';
        return;
    }

    try {
        logActivity(
            dashboardUser,
            approvalStatus === 'Approved' ? 'Approved researcher project' : 'Rejected researcher project',
            project.title + ' — ' + project.researcherName
        );
    } catch (error) {
        console.error('The activity history could not be updated.', error);
    }

    renderSupervisorProjects();
    renderSupervisorExternalReview();
    renderSupervisedDocuments();
    window.dispatchEvent(new Event('supervisor:records-changed'));
    const message = document.getElementById('supervisorProjectApprovalMessage');
    message.textContent = 'Project ' + approvalStatus.toLowerCase() + '.';
}

function supervisedProjectOptions() {
    const projects = getSupervisedProjects();
    const options = [];
    for (let index = 0; index < projects.length; index += 1) {
        options.push({
            value: projects[index].researcherId + ':' + projects[index].id,
            label: projects[index].title + ' — ' + projects[index].researcherName
        });
    }
    return options;
}

function supervisedDocumentOptions() {
    const documents = getSupervisedDocuments();
    const options = [];
    for (let index = 0; index < documents.length; index += 1) {
        options.push({
            value: documents[index].researcherId + ':' + documents[index].id,
            label: documents[index].title + ' (' + documents[index].version + ') — ' + documents[index].projectTitle
        });
    }
    return options;
}

function getSupervisedDocuments() {
    const projects = getSupervisedProjects();
    const supervisedDocuments = [];
    for (let projectIndex = 0; projectIndex < projects.length; projectIndex += 1) {
        const project = projects[projectIndex];
        const documents = getRecordsForUser(project.researcherId, 'documents');
        for (let documentIndex = 0; documentIndex < documents.length; documentIndex += 1) {
            if (documents[documentIndex].projectId === project.id) {
                documents[documentIndex].researcherId = project.researcherId;
                documents[documentIndex].researcherName = project.researcherName;
                documents[documentIndex].projectTitle = project.title;
                supervisedDocuments.push(documents[documentIndex]);
            }
        }
    }
    return supervisedDocuments;
}

function renderSupervisedDocuments() {
    const container = document.getElementById('supervisorDocuments');
    const status = document.getElementById('supervisorDocumentStatus');
    if (!container || !dashboardUser) {
        return;
    }
    status.textContent = '';
    for (let index = 0; index < supervisorFileUrls.length; index += 1) {
        URL.revokeObjectURL(supervisorFileUrls[index]);
    }
    supervisorFileUrls = [];

    const documents = getSupervisedDocuments();
    if (documents.length === 0) {
        container.textContent = 'No documents have been uploaded to your supervised projects yet.';
        return;
    }

    const table = document.createElement('table');
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    const headings = ['Document', 'Version', 'Project', 'Researcher', 'File'];
    for (let index = 0; index < headings.length; index += 1) {
        const cell = document.createElement('th');
        cell.textContent = headings[index];
        header.appendChild(cell);
    }
    head.appendChild(header);
    table.appendChild(head);

    const body = document.createElement('tbody');
    for (let index = 0; index < documents.length; index += 1) {
        const documentRecord = documents[index];
        const row = document.createElement('tr');
        const values = [
            documentRecord.title,
            documentRecord.version,
            documentRecord.projectTitle,
            documentRecord.researcherName
        ];
        for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
            const cell = document.createElement('td');
            cell.textContent = values[valueIndex] || '';
            row.appendChild(cell);
        }
        const fileCell = document.createElement('td');
        if (!documentRecord.fileName) {
            fileCell.textContent = 'No file';
        } else {
            fileCell.textContent = 'Loading file...';
            getFile(documentRecord.id).then(function (file) {
                if (!container.contains(row)) {
                    return;
                }
                if (!file) {
                    fileCell.textContent = 'File unavailable';
                    return;
                }
                const url = URL.createObjectURL(file);
                supervisorFileUrls.push(url);
                const link = document.createElement('a');
                link.href = url;
                link.download = documentRecord.fileName;
                link.textContent = 'Download ' + documentRecord.fileName;
                fileCell.replaceChildren(link);
            }).catch(function (error) {
                console.error('The supervised document could not be opened.', error);
                if (container.contains(row)) {
                    fileCell.textContent = 'File unavailable';
                    status.textContent = 'The supervised document could not be opened.';
                }
            });
        }
        row.appendChild(fileCell);
        body.appendChild(row);
    }
    table.appendChild(body);
    container.replaceChildren(table);
}

function getSupervisorFieldOptions(control) {
    if (control.dataset.options === 'documents') {
        return supervisedDocumentOptions();
    }
    if (control.dataset.options === 'projects') {
        return supervisedProjectOptions();
    }
    return [];
}

function getSupervisorCollection(key) {
    return 'user:' + dashboardUser.id + ':' + key;
}

function getRecordsForUser(userId, key) {
    const collection = 'user:' + userId + ':' + key;
    const storedIds = getData(collection + ':ids');
    if (!storedIds) {
        return [];
    }

    const records = [];
    const ids = storedIds.split('\n');
    for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        if (!id) {
            continue;
        }

        const recordPrefix = collection + ':' + id + ':';
        const storedFields = getData(recordPrefix + 'fields');
        if (!storedFields) {
            continue;
        }

        const record = { id: id };
        const fields = storedFields.split('\n');
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
            const value = getData(recordPrefix + fields[fieldIndex]);
            if (value !== null) {
                record[fields[fieldIndex]] = value;
            }
        }
        records.push(record);
    }
    return records;
}

function saveSupervisorRecord(collection, record) {
    const recordPrefix = collection + ':' + record.id + ':';
    const previousFields = getData(recordPrefix + 'fields');
    const keys = Object.keys(record);
    const fields = [];
    for (let index = 0; index < keys.length; index += 1) {
        if (keys[index] !== 'id') {
            fields.push(keys[index]);
        }
    }

    if (previousFields) {
        const oldFields = previousFields.split('\n');
        for (let index = 0; index < oldFields.length; index += 1) {
            if (fields.indexOf(oldFields[index]) === -1) {
                removeData(recordPrefix + oldFields[index]);
            }
        }
    }

    for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        const value = record[field];
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
            throw new TypeError('Supervisor records must contain simple text or numeric values.');
        }
        saveData(recordPrefix + field, String(value));
    }
    saveData(recordPrefix + 'fields', fields.join('\n'));

    const storedIds = getData(collection + ':ids');
    const ids = storedIds ? storedIds.split('\n') : [];
    if (ids.indexOf(record.id) === -1) {
        ids.push(record.id);
        saveData(collection + ':ids', ids.join('\n'));
    }
}

function deleteSupervisorRecord(collection, id) {
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

function initSupervisorCrud(config) {
    const container = document.getElementById(config.containerId);
    const form = container ? container.querySelector('form') : null;
    if (!container || !form || !dashboardUser) {
        return;
    }

    const collection = getSupervisorCollection(config.key);
    const controls = {};
    const fields = [];
    let editingId = null;
    const submit = form.querySelector('button[type="submit"]');
    const cancel = form.querySelector('[data-cancel-edit]');
    const message = container.querySelector('.crud-message');
    const headerRow = container.querySelector('[data-table-headers]');
    const body = container.querySelector('tbody');
    const controlsInForm = form.querySelectorAll('input[name], select[name], textarea[name]');

    for (let index = 0; index < controlsInForm.length; index += 1) {
        const control = controlsInForm[index];
        const label = form.querySelector('label[for="' + control.id + '"]');
        if (!label || !control.getAttribute('aria-describedby')) {
            throw new Error('Supervisor form fields need an HTML label and error span.');
        }
        fields.push(control);
        controls[control.name] = control;

        const heading = document.createElement('th');
        heading.textContent = label.textContent;
        headerRow.appendChild(heading);
    }
    const actionHeader = document.createElement('th');
    actionHeader.textContent = 'Actions';
    headerRow.appendChild(actionHeader);

    function refreshOptions() {
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

            const options = getSupervisorFieldOptions(select);
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
            } else {
                select.selectedIndex = 0;
            }
        }
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
            setFieldError(fields[index], '');
        }
    }

    function validationMessage(control) {
        if (control.validity.valueMissing) {
            return 'Complete this field.';
        }
        if (control.validity.typeMismatch) {
            return 'Enter a valid value.';
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
            if (!control.validity.valid) {
                invalidFields.push({
                    control: control,
                    message: validationMessage(control)
                });
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
        submit.textContent = 'Add ' + config.singular;
        cancel.classList.add('hidden');
        clearAllFieldErrors();
    }

    function render() {
        const records = getRecordsForUser(dashboardUser.id, config.key);
        body.replaceChildren();
        if (records.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = fields.length + 1;
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
                if (field.tagName === 'SELECT') {
                    for (let optionIndex = 0; optionIndex < field.options.length; optionIndex += 1) {
                        if (field.options[optionIndex].value === value) {
                            cell.textContent = field.options[optionIndex].textContent;
                            break;
                        }
                    }
                    if (!cell.textContent) {
                        cell.textContent = value;
                    }
                } else {
                    cell.textContent = value;
                }
                row.appendChild(cell);
            }

            const actions = document.createElement('td');
            actions.className = 'table-actions';
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn-secondary btn-small';
            editButton.textContent = 'Edit';
            editButton.addEventListener('click', function () {
                editingId = record.id;
                for (let index = 0; index < fields.length; index += 1) {
                    const field = fields[index];
                    controls[field.name].value = record[field.name] || '';
                }
                clearAllFieldErrors();
                submit.textContent = 'Save changes';
                cancel.classList.remove('hidden');
            });

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn-danger btn-small';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', function () {
                if (!window.confirm('Delete this ' + config.singular + '?')) {
                    return;
                }
                deleteSupervisorRecord(collection, record.id);
                try {
                    logActivity(
                        dashboardUser,
                        'Deleted ' + config.singular,
                        record.title || record.researcher || record.agenda ||
                            record.documentTitle || record.projectTitle || record.id
                    );
                } catch (error) {
                    console.error('The activity history could not be updated.', error);
                }
                if (editingId === record.id) {
                    resetForm();
                }
                message.textContent = config.singular + ' deleted.';
                render();
                window.dispatchEvent(new Event('supervisor:records-changed'));
            });

            actions.appendChild(editButton);
            actions.appendChild(deleteButton);
            row.appendChild(actions);
            body.appendChild(row);
        }
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!validateForm()) {
            return;
        }

        const record = {};
        for (let index = 0; index < fields.length; index += 1) {
            const field = fields[index];
            record[field.name] = field.value.trim();
            if (field.tagName === 'SELECT') {
                const selectedOption = field.options[field.selectedIndex];
                if (selectedOption && field.name === 'documentRef') {
                    record.documentTitle = selectedOption.textContent;
                } else if (selectedOption && field.name === 'projectRef') {
                    record.projectTitle = selectedOption.textContent;
                }
            }
        }
        record.id = editingId || createId(config.key);

        saveSupervisorRecord(collection, record);
        try {
            logActivity(
                dashboardUser,
                (editingId ? 'Updated ' : 'Created ') + config.singular,
                record.title || record.researcher || record.agenda ||
                    record.documentTitle || record.projectTitle || record.id
            );
        } catch (error) {
            console.error('The activity history could not be updated.', error);
        }

        message.textContent = config.singular + (editingId ? ' updated.' : ' added.');
        resetForm();
        render();
        window.dispatchEvent(new Event('supervisor:records-changed'));
    });

    cancel.addEventListener('click', function () {
        resetForm();
        message.textContent = '';
    });

    form.addEventListener('input', function (event) {
        if (event.target.matches('input[name], select[name], textarea[name]')) {
            setFieldError(event.target, '');
        }
    });
    form.addEventListener('change', function (event) {
        if (event.target.matches('input[name], select[name], textarea[name]')) {
            setFieldError(event.target, '');
        }
    });

    window.addEventListener('supervisor:records-changed', refreshOptions);
    window.addEventListener('storage', refreshOptions);
    refreshOptions();
    render();
}

