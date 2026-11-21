import { dashboardUser, getUsers, initDashboard } from './App.js';
import { createId, getData, getFile, logActivity, saveData } from './Storage.js';

if (initDashboard('reviewer')) {
    initReviewerCrud({
        containerId: 'reviewerEvaluations',
        key: 'evaluations'
    });
    renderAssignedProposals();
    window.addEventListener('supervisor:records-changed', renderAssignedProposals);
    window.addEventListener('reviewer:records-changed', renderAssignedProposals);
    window.addEventListener('storage', function () {
        renderAssignedProposals();
    });
}

function getReviewerCollection(key) {
    return 'user:' + dashboardUser.id + ':' + key;
}

function getReviewerRecords(key) {
    const collection = getReviewerCollection(key);
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

function getRecordsForUser(userId, key) {
    const collection = 'user:' + userId + ':' + key;
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
            const value = getData(collection + ':' + id + ':' + fields[fieldIndex]);
            if (value !== null) {
                record[fields[fieldIndex]] = value;
            }
        }
        records.push(record);
    }
    return records;
}

function getReviewProjects() {
    const users = getUsers();
    const projects = [];

    for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
        const researcher = users[userIndex];
        if (researcher.role !== 'researcher' || researcher.status === 'Inactive') {
            continue;
        }
        const researcherProjects = getRecordsForUser(researcher.id, 'projects');
        for (let projectIndex = 0; projectIndex < researcherProjects.length; projectIndex += 1) {
            const project = researcherProjects[projectIndex];
            if (project.approvalStatus !== 'Approved') {
                continue;
            }
            if (project.reviewStatus === 'Available for review' ||
                (project.reviewStatus === 'Accepted' && project.reviewerId === dashboardUser.id) ||
                (project.reviewStatus === 'Reviewed' && project.reviewerId === dashboardUser.id)) {
                projects.push({
                    id: researcher.id + ':' + project.id,
                    supervisorId: project.supervisorId,
                    supervisorName: (function () {
                        const supervisor = getUsers().find(function (user) {
                            return user.id === project.supervisorId;
                        });
                        return supervisor ? supervisor.name : 'Unknown supervisor';
                    })(),
                    researcherId: researcher.id,
                    proposalId: project.id,
                    projectId: project.id,
                    title: project.title,
                    researcher: researcher.name,
                    domain: project.domain,
                    abstract: project.description,
                    submissionDate: project.reviewSubmittedAt ? project.reviewSubmittedAt.slice(0, 10) : '',
                    reviewStatus: project.reviewStatus,
                    reviewerId: project.reviewerId || '',
                    reviewerName: project.reviewerName || '',
                    verdict: project.verdict || '',
                    reviewFolderName: project.reviewFolderName || '',
                    reviewFileIds: project.reviewFileIds || ''
                });
            }
        }
    }
    return projects;
}

function getAssignedProposals() {
    return getReviewProjects().filter(function (project) {
        return project.reviewStatus === 'Accepted' && project.reviewerId === dashboardUser.id;
    });
}

function assignedProposalOptions() {
    const proposals = getAssignedProposals();
    const options = [];
    for (let index = 0; index < proposals.length; index += 1) {
        options.push({
            value: proposals[index].id,
            label: proposals[index].title + ' — ' + proposals[index].researcher
        });
    }
    return options;
}

function renderAssignedProposals() {
    const container = document.getElementById('reviewerAssignedProposals');
    if (!container || !dashboardUser) {
        return;
    }
    const projects = getReviewProjects();
    if (projects.length === 0) {
        container.textContent = 'No projects are available for review.';
        return;
    }

    const list = document.createElement('div');
    list.className = 'review-assignment-list';
    for (let index = 0; index < projects.length; index += 1) {
        const proposal = projects[index];
        const card = document.createElement('article');
        card.className = 'card-panel';
        const heading = document.createElement('h3');
        heading.textContent = proposal.title;
        const details = document.createElement('p');
        details.textContent = 'Researcher: ' + proposal.researcher + ' | Supervisor: ' + proposal.supervisorName +
            ' | Domain: ' + proposal.domain + ' | Submitted: ' + proposal.submissionDate;
        const abstract = document.createElement('p');
        abstract.textContent = proposal.abstract;
        const status = document.createElement('p');
        status.textContent = 'Review status: ' + proposal.reviewStatus +
            (proposal.reviewerName ? ' | Reviewer: ' + proposal.reviewerName : '') +
            (proposal.verdict ? ' | Verdict: ' + proposal.verdict : '');
        card.appendChild(heading);
        card.appendChild(details);
        card.appendChild(abstract);
        card.appendChild(status);
        if (proposal.reviewFolderName) {
            const folder = document.createElement('p');
            folder.textContent = 'Project folder: ' + proposal.reviewFolderName;
            card.appendChild(folder);
            const files = proposal.reviewFileIds ? proposal.reviewFileIds.split('\n').filter(Boolean) : [];
            for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
                const fileId = files[fileIndex];
                const link = document.createElement('button');
                link.type = 'button';
                link.className = 'btn-secondary btn-small';
                const fileName = getData('rcp-review-file:' + fileId + ':name') ||
                    getData('rcp-review-file:' + fileId + ':path') ||
                    'Download file';
                link.textContent = 'Open ' + fileName;
                link.addEventListener('click', function () {
                    getFile(fileId).then(function (file) {
                        if (!file) {
                            window.alert('This folder file is no longer available.');
                            return;
                        }
                        const url = URL.createObjectURL(file);
                        const download = document.createElement('a');
                        download.href = url;
                        download.download = fileName;
                        download.click();
                        URL.revokeObjectURL(url);
                    }).catch(function (error) {
                        console.error('The folder file could not be opened.', error);
                        window.alert('The folder file could not be opened.');
                    });
                });
                card.appendChild(link);
            }
        }
        if (proposal.reviewStatus === 'Available for review') {
            const acceptButton = document.createElement('button');
            acceptButton.type = 'button';
            acceptButton.className = 'btn-primary';
            acceptButton.textContent = 'Accept project';
            acceptButton.addEventListener('click', function () {
                acceptProjectForReview(proposal);
            });
            card.appendChild(acceptButton);
        }
        list.appendChild(card);
    }
    container.replaceChildren(list);
}

function updateProjectReviewFields(project, fields) {
    const collection = 'user:' + project.researcherId + ':projects';
    const recordPrefix = collection + ':' + project.projectId + ':';
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

function acceptProjectForReview(project) {
    const currentProjects = getRecordsForUser(project.researcherId, 'projects');
    let currentProject = null;
    for (let index = 0; index < currentProjects.length; index += 1) {
        if (currentProjects[index].id === project.projectId) {
            currentProject = currentProjects[index];
            break;
        }
    }
    if (!currentProject || currentProject.reviewStatus !== 'Available for review') {
        window.alert('Another reviewer has already accepted this project.');
        renderAssignedProposals();
        return;
    }

    try {
        updateProjectReviewFields(project, {
            reviewStatus: 'Accepted',
            reviewerId: dashboardUser.id,
            reviewerName: dashboardUser.name,
            acceptedAt: new Date().toISOString()
        });
        logActivity(dashboardUser, 'Accepted project for review', project.title);
    } catch (error) {
        console.error('The project could not be accepted.', error);
        window.alert(error.message || 'The project could not be accepted.');
        return;
    }

    renderAssignedProposals();
    window.dispatchEvent(new Event('reviewer:records-changed'));
}

function saveReviewerRecord(collection, record) {
    const recordPrefix = collection + ':' + record.id + ':';
    const keys = Object.keys(record);
    const fields = [];

    for (let index = 0; index < keys.length; index += 1) {
        if (keys[index] !== 'id') {
            fields.push(keys[index]);
        }
    }

    for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        const value = record[field];
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
            throw new TypeError('Review records must contain simple text or numeric values.');
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

function initReviewerCrud(config) {
    const container = document.getElementById(config.containerId);
    const form = container ? container.querySelector('form') : null;
    if (!container || !form || !dashboardUser) {
        return;
    }

    const collection = getReviewerCollection(config.key);
    const controls = {};
    const fields = [];
    const controlsInForm = form.querySelectorAll('input[name], select[name], textarea[name]');
    const submit = form.querySelector('button[type="submit"]');
    const message = container.querySelector('.crud-message');
    const headerRow = container.querySelector('[data-table-headers]');
    const body = container.querySelector('tbody');

    for (let index = 0; index < controlsInForm.length; index += 1) {
        const control = controlsInForm[index];
        const label = form.querySelector('label[for="' + control.id + '"]');
        if (!label || !control.getAttribute('aria-describedby')) {
            throw new Error('Reviewer form fields need an HTML label and error span.');
        }
        fields.push(control);
        controls[control.name] = control;
        const heading = document.createElement('th');
        heading.textContent = label.textContent;
        headerRow.appendChild(heading);
    }

    function getFieldOptions(control) {
        if (control.dataset.options === 'assigned-proposals') {
            return assignedProposalOptions();
        }
        return [];
    }

    function refreshAssignmentOptions() {
        for (let index = 0; index < fields.length; index += 1) {
            const control = fields[index];
            if (control.tagName !== 'SELECT' || !control.dataset.options) {
                continue;
            }
            const selectedValue = control.value;
            const placeholder = control.querySelector('option[value=""]');
            const placeholderText = placeholder ? placeholder.textContent : '';
            control.replaceChildren();
            if (placeholderText) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = placeholderText;
                control.appendChild(emptyOption);
            }
            const options = getFieldOptions(control);
            for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
                const option = document.createElement('option');
                option.value = options[optionIndex].value;
                option.textContent = options[optionIndex].label;
                control.appendChild(option);
            }
            let selectedValueExists = false;
            for (let optionIndex = 0; optionIndex < control.options.length; optionIndex += 1) {
                if (control.options[optionIndex].value === selectedValue) {
                    selectedValueExists = true;
                    break;
                }
            }
            if (selectedValue && selectedValueExists) {
                control.value = selectedValue;
            } else if (control.required && options.length > 0) {
                control.value = options[0].value;
            } else if (selectedValueExists) {
                control.value = selectedValue;
            } else {
                control.selectedIndex = 0;
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
        clearAllFieldErrors();
    }

    function render() {
        const records = getReviewerRecords(config.key);
        body.replaceChildren();
        if (records.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = fields.length;
            cell.className = 'empty-state';
            cell.textContent = getAssignedProposals().length === 0
                ? 'No evaluations yet. A supervisor must assign a proposal before you can review it.'
                : 'No evaluations yet. Add one using the form above.';
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
                    const options = field.options;
                    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
                        if (options[optionIndex].value === value) {
                            cell.textContent = options[optionIndex].textContent;
                            break;
                        }
                    }
                    if (!cell.textContent) {
                        cell.textContent = record.manuscript || value;
                    }
                } else {
                    cell.textContent = value;
                }
                row.appendChild(cell);
            }

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
        }

        const assignments = getAssignedProposals();
        let assignedProposal = null;
        for (let index = 0; index < assignments.length; index += 1) {
            if (assignments[index].id === record.proposalRef) {
                assignedProposal = assignments[index];
                break;
            }
        }
        if (!assignedProposal) {
            setFieldError(controls.proposalRef, 'This proposal is no longer assigned to you. Choose another proposal.');
            refreshAssignmentOptions();
            return;
        }

        record.manuscript = assignedProposal.title;
        record.supervisorId = assignedProposal.supervisorId;
        record.proposalId = assignedProposal.proposalId;
        record.id = createId(config.key);

        saveReviewerRecord(collection, record);
        try {
            updateProjectReviewFields(assignedProposal, {
                reviewStatus: 'Reviewed',
                verdict: record.recommendation,
                reviewComments: record.comments,
                reviewSubmittedAt: record.reviewDate,
                originalityScore: record.originality,
                methodologyScore: record.methodology,
                clarityScore: record.clarity
            });
        } catch (error) {
            console.error('The project verdict could not be saved.', error);
            message.textContent = 'The evaluation was saved, but the project verdict could not be updated.';
            resetForm();
            render();
            return;
        }
        try {
            logActivity(
                dashboardUser,
                'Submitted review evaluation',
                assignedProposal.title
            );
        } catch (error) {
            console.error('The activity history could not be updated.', error);
        }
        message.textContent = 'Evaluation submitted.';
        resetForm();
        render();
        refreshAssignmentOptions();
        window.dispatchEvent(new Event('reviewer:records-changed'));
        window.dispatchEvent(new Event('supervisor:records-changed'));
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

    window.addEventListener('storage', refreshAssignmentOptions);
    window.addEventListener('supervisor:records-changed', refreshAssignmentOptions);
    window.addEventListener('reviewer:records-changed', refreshAssignmentOptions);
    refreshAssignmentOptions();
    render();
}
