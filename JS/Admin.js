import { createPasswordCredentials, dashboardUser, initDashboard, registerUser } from './App.js';
import { createId, getData, logActivity, removeData, saveData } from './Storage.js';

if (initDashboard('admin')) {
    initAdminUserManagement();
    initAdminSettings();
    initAdminActivityLogs();
}

function getAdminCollection(key) {
    return 'user:' + dashboardUser.id + ':' + key;
}

function getAdminRecords(collection) {
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

function saveAdminRecord(collection, record) {
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
            throw new TypeError('Record fields must contain simple text or numeric values.');
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

function deleteAdminRecord(collection, id) {
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

function getNamedFormFields(form) {
    return form.querySelectorAll('input[name], select[name], textarea[name]');
}

function setInlineFieldError(control, text) {
    const errorElement = document.getElementById(control.getAttribute('aria-describedby'));
    errorElement.textContent = text;
    errorElement.hidden = !text;
    if (text) {
        control.setAttribute('aria-invalid', 'true');
    } else {
        control.removeAttribute('aria-invalid');
    }
}

function clearInlineFieldErrors(fields) {
    for (let index = 0; index < fields.length; index += 1) {
        setInlineFieldError(fields[index], '');
    }
}

function validateNamedFields(fields) {
    clearInlineFieldErrors(fields);
    const invalidFields = [];
    for (let index = 0; index < fields.length; index += 1) {
        const control = fields[index];
        const isEmpty = control.required && !control.value.trim();
        if (isEmpty) {
            invalidFields.push({ control: control, message: 'Complete this field.' });
        } else if (control.value && !control.validity.valid) {
            let message = 'Enter a valid value.';
            if (control.validity.typeMismatch && control.type === 'email') {
                message = 'Enter a valid email address.';
            } else if (control.validity.tooShort) {
                message = 'Use at least ' + control.minLength + ' characters.';
            }
            invalidFields.push({ control: control, message: message });
        }
    }
    for (let index = 0; index < invalidFields.length; index += 1) {
        setInlineFieldError(invalidFields[index].control, invalidFields[index].message);
    }
    if (invalidFields.length > 0) {
        invalidFields[0].control.focus();
        return false;
    }
    return true;
}

function initAdminSettings() {
    const container = document.getElementById('adminSettings');
    const form = container ? container.querySelector('form') : null;
    if (!container || !form) {
        return;
    }

    const fields = getNamedFormFields(form);
    const collection = getAdminCollection('institution-settings');
    let editingId = null;
    const controls = {};
    for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        const label = form.querySelector('label[for="' + field.id + '"]');
        if (!label || !field.getAttribute('aria-describedby')) {
            throw new Error('Institution fields need an HTML label and error span.');
        }
        controls[field.name] = field;
        const heading = document.createElement('th');
        heading.textContent = label.textContent;
        container.querySelector('[data-table-headers]').appendChild(heading);
    }
    const actionHeader = document.createElement('th');
    actionHeader.textContent = 'Actions';
    container.querySelector('[data-table-headers]').appendChild(actionHeader);
    const submit = form.querySelector('button[type="submit"]');
    const cancel = form.querySelector('[data-cancel-edit]');
    const message = container.querySelector('.crud-message');
    const body = container.querySelector('tbody');

    function resetForm() {
        form.reset();
        editingId = null;
        submit.textContent = 'Add setting';
        cancel.classList.add('hidden');
        clearInlineFieldErrors(fields);
    }

    function render() {
        const records = getAdminRecords(collection);
        body.replaceChildren();

        if (records.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = fields.length + 1;
            cell.className = 'empty-state';
            cell.textContent = 'No settings yet. Add one using the form above.';
            row.appendChild(cell);
            body.appendChild(row);
            return;
        }

        for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
            const record = records[recordIndex];
            const row = document.createElement('tr');
            for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
                const cell = document.createElement('td');
                cell.textContent = record[fields[fieldIndex].name] || '';
                row.appendChild(cell);
            }

            const actionCell = document.createElement('td');
            actionCell.className = 'table-actions';
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
                submit.textContent = 'Save changes';
                cancel.classList.remove('hidden');
            });

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn-danger btn-small';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', function () {
                if (!window.confirm('Delete this setting?')) {
                    return;
                }
                deleteAdminRecord(collection, record.id);
                try {
                    logActivity(dashboardUser, 'Deleted institution setting', record.institution || record.department || record.id);
                } catch (error) {
                    console.error('The activity history could not be updated.', error);
                }
                if (editingId === record.id) {
                    resetForm();
                }
                message.textContent = 'Setting deleted.';
                render();
            });

            actionCell.appendChild(editButton);
            actionCell.appendChild(deleteButton);
            row.appendChild(actionCell);
            body.appendChild(row);
        }
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!validateNamedFields(fields)) {
            return;
        }
        const record = { id: editingId || createId('institution-setting') };
        for (let index = 0; index < fields.length; index += 1) {
            const field = fields[index];
            record[field.name] = controls[field.name].value.trim();
        }

        saveAdminRecord(collection, record);
        try {
            logActivity(
                dashboardUser,
                (editingId ? 'Updated' : 'Created') + ' institution settings',
                record.institution + ' — ' + record.department
            );
        } catch (error) {
            console.error('The activity history could not be updated.', error);
        }
        if (editingId) {
            message.textContent = 'Setting updated.';
        } else {
            message.textContent = 'Setting added.';
        }
        resetForm();
        render();
    });

    cancel.addEventListener('click', function () {
        resetForm();
        message.textContent = '';
    });

    form.addEventListener('input', function (event) {
        if (event.target.matches('input[name], select[name], textarea[name]')) {
            setInlineFieldError(event.target, '');
        }
    });
    form.addEventListener('change', function (event) {
        if (event.target.matches('input[name], select[name], textarea[name]')) {
            setInlineFieldError(event.target, '');
        }
    });

    render();
}

function initAdminUserManagement() {
    const container = document.getElementById('adminUsers');
    const form = container ? container.querySelector('#adminUserForm') : null;
    if (!container || !form) {
        return;
    }

    let editingId = null;
    const fields = getNamedFormFields(form);
    for (let index = 0; index < fields.length; index += 1) {
        const label = form.querySelector('label[for="' + fields[index].id + '"]');
        if (!label || !fields[index].getAttribute('aria-describedby')) {
            throw new Error('User fields need an HTML label and error span.');
        }
    }

    const body = container.querySelector('#adminUsersTable');
    const message = container.querySelector('#adminUserMessage');
    const submit = form.querySelector('button[type="submit"]');
    const cancel = form.querySelector('#cancelAdminUserEdit');

    function resetForm() {
        form.reset();
        editingId = null;
        form.elements.password.required = true;
        submit.textContent = 'Add user';
        cancel.classList.add('hidden');
        clearInlineFieldErrors(fields);
    }

    function render() {
        const users = getAdminRecords('users');
        const count = document.getElementById('adminUserCount');
        if (count) {
            count.textContent = users.length;
        }
        body.replaceChildren();

        for (let index = 0; index < users.length; index += 1) {
            const user = users[index];
            const row = document.createElement('tr');
            const values = [user.name, user.email, user.role, user.status || 'Active'];
            for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
                const cell = document.createElement('td');
                cell.textContent = values[valueIndex];
                row.appendChild(cell);
            }

            const actionCell = document.createElement('td');
            actionCell.className = 'table-actions';
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn-secondary btn-small';
            editButton.textContent = 'Edit';
            editButton.addEventListener('click', function () {
                editingId = user.id;
                form.elements.name.value = user.name;
                form.elements.email.value = user.email;
                form.elements.role.value = user.role;
                form.elements.status.value = user.status || 'Active';
                form.elements.password.value = '';
                form.elements.password.required = false;
                submit.textContent = 'Save changes';
                cancel.classList.remove('hidden');
                clearInlineFieldErrors(fields);
                message.textContent = '';
                message.classList.remove('is-error');
            });

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn-danger btn-small';
            deleteButton.textContent = 'Delete';
            deleteButton.disabled = user.id === dashboardUser.id;
            deleteButton.addEventListener('click', function () {
                if (deleteButton.disabled || !window.confirm('Delete the account for ' + user.email + '?')) {
                    return;
                }
                deleteAdminRecord('users', user.id);
                try {
                    logActivity(dashboardUser, 'Deleted user account', user.email);
                } catch (error) {
                    console.error('The activity history could not be updated.', error);
                }
                message.textContent = 'User deleted.';
                render();
            });

            actionCell.appendChild(editButton);
            actionCell.appendChild(deleteButton);
            row.appendChild(actionCell);
            body.appendChild(row);
        }
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!validateNamedFields(fields)) {
            return;
        }
        message.textContent = '';
        message.classList.remove('is-error');
        const name = form.elements.name.value.trim();
        const email = form.elements.email.value.trim().toLowerCase();
        const role = form.elements.role.value;
        const password = form.elements.password.value;
        const status = form.elements.status.value;
        const users = getAdminRecords('users');

        for (let index = 0; index < users.length; index += 1) {
            if (users[index].email.toLowerCase() === email && users[index].id !== editingId) {
                setInlineFieldError(form.elements.email, 'An account with this email already exists.');
                form.elements.email.focus();
                return;
            }
        }

        if (editingId) {
            let user = null;
            for (let index = 0; index < users.length; index += 1) {
                if (users[index].id === editingId) {
                    user = users[index];
                    break;
                }
            }
            if (!user) {
                message.textContent = 'This account no longer exists. Refresh and try again.';
                message.classList.add('is-error');
                resetForm();
                render();
                return;
            }

            user.name = name;
            user.email = email;
            user.role = role;
            user.status = status;
            if (password) {
                const credentials = await createPasswordCredentials(password);
                if (!credentials) {
                    message.textContent = 'Password protection is unavailable. Open the project using localhost or HTTPS.';
                    message.classList.add('is-error');
                    return;
                }
                user.passwordSalt = credentials.passwordSalt;
                user.passwordHash = credentials.passwordHash;
            }

            saveAdminRecord('users', user);
            try {
                let details = user.email + ' — ' + user.role + ' — ' + user.status;
                if (password) {
                    details += ' — password reset';
                }
                logActivity(dashboardUser, 'Updated user account', details);
            } catch (error) {
                console.error('The activity history could not be updated.', error);
            }
            if (user.id === dashboardUser.id) {
                dashboardUser.name = user.name;
                document.getElementById('headerUserName').textContent = 'Welcome, ' + user.name;
            }
            message.textContent = 'User updated.';
        } else {
            if (!password) {
                message.textContent = 'Enter a password for the new account.';
                message.classList.add('is-error');
                return;
            }

            const result = await registerUser(name, email, role, password, true);
            if (!result.success) {
                message.textContent = result.message;
                message.classList.add('is-error');
                return;
            }

            const newUsers = getAdminRecords('users');
            let newUser = null;
            for (let index = 0; index < newUsers.length; index += 1) {
                if (newUsers[index].email === email) {
                    newUser = newUsers[index];
                    break;
                }
            }
            if (!newUser) {
                throw new Error('The new account was not found after registration.');
            }
            newUser.status = status;
            saveAdminRecord('users', newUser);
            try {
                logActivity(dashboardUser, 'Created user account', newUser.email + ' — ' + newUser.role);
            } catch (error) {
                console.error('The activity history could not be updated.', error);
            }
            message.textContent = 'User created.';
        }

        message.classList.remove('is-error');
        resetForm();
        render();
    });

    cancel.addEventListener('click', function () {
        resetForm();
        message.textContent = '';
        message.classList.remove('is-error');
    });

    form.addEventListener('input', function (event) {
        if (event.target.matches('input[name], select[name], textarea[name]')) {
            setInlineFieldError(event.target, '');
            message.textContent = '';
            message.classList.remove('is-error');
        }
    });
    form.addEventListener('change', function (event) {
        if (event.target.matches('input[name], select[name], textarea[name]')) {
            setInlineFieldError(event.target, '');
            message.textContent = '';
            message.classList.remove('is-error');
        }
    });

    render();
}

function initAdminActivityLogs() {
    const container = document.getElementById('adminActivityLogs');
    if (!container) {
        return;
    }

    function render() {
        const storedActivity = getData('system:activity');
        let activity = [];
        if (storedActivity) {
            activity = JSON.parse(storedActivity);
            if (!Array.isArray(activity)) {
                throw new TypeError('Activity history must be a list.');
            }
        }

        if (activity.length === 0) {
            container.textContent = 'No system activity has been recorded in this browser yet.';
            return;
        }

        const table = document.createElement('table');
        const head = document.createElement('thead');
        const header = document.createElement('tr');
        const headings = ['Date and time', 'User', 'Role', 'Action', 'Details'];
        for (let index = 0; index < headings.length; index += 1) {
            const cell = document.createElement('th');
            cell.textContent = headings[index];
            header.appendChild(cell);
        }
        head.appendChild(header);
        table.appendChild(head);

        const body = document.createElement('tbody');
        for (let index = 0; index < activity.length; index += 1) {
            const entry = activity[index];
            const row = document.createElement('tr');
            const values = [
                new Date(entry.createdAt).toLocaleString(),
                entry.actorName,
                entry.actorRole,
                entry.action,
                entry.details
            ];
            for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
                const cell = document.createElement('td');
                cell.textContent = values[valueIndex] || '';
                row.appendChild(cell);
            }
            body.appendChild(row);
        }
        table.appendChild(body);
        container.replaceChildren(table);
    }

    window.addEventListener('system:activity-changed', render);
    window.addEventListener('storage', function (event) {
        if (event.key === 'rcp:system:activity') {
            render();
        }
    });
    render();
}
