import { createId, getData, logActivity, removeData, saveData } from './Storage.js';

const userCollection = 'users';
const sessionKey = 'session:userId';
const validRoles = ['researcher', 'supervisor', 'reviewer', 'admin'];
const defaultAdminEmail = 'admin123@gmail.com';
const defaultAdminCredentials = {
    passwordSalt: '00112233445566778899aabbccddeeff',
    passwordHash: 'be8187761f01504afba863a09eda647c096c7cac8cc7f0b3351fc32dba1e014e'
};

export let dashboardUser = null;

export function getUsers() {
    const storedIds = getData(userCollection + ':ids');
    if (!storedIds) {
        return [];
    }

    const ids = storedIds.split('\n');
    const users = [];
    for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        if (!id) {
            continue;
        }

        const storedFields = getData(userCollection + ':' + id + ':fields');
        if (!storedFields) {
            continue;
        }

        const user = { id: id };
        const fields = storedFields.split('\n');
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
            const field = fields[fieldIndex];
            const value = getData(userCollection + ':' + id + ':' + field);
            if (value !== null) {
                user[field] = value;
            }
        }
        users.push(user);
    }

    return users;
}

function saveUserRecord(user) {
    const recordPrefix = userCollection + ':' + user.id + ':';
    const oldFields = getData(recordPrefix + 'fields');
    const fieldNames = [];
    const userFields = Object.keys(user);

    for (let index = 0; index < userFields.length; index += 1) {
        const field = userFields[index];
        if (field !== 'id') {
            fieldNames.push(field);
        }
    }

    if (oldFields) {
        const oldFieldNames = oldFields.split('\n');
        for (let index = 0; index < oldFieldNames.length; index += 1) {
            if (fieldNames.indexOf(oldFieldNames[index]) === -1) {
                removeData(recordPrefix + oldFieldNames[index]);
            }
        }
    }

    for (let index = 0; index < fieldNames.length; index += 1) {
        const field = fieldNames[index];
        const value = user[field];
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
            throw new TypeError('User fields must contain simple text or numeric values.');
        }
        saveData(recordPrefix + field, String(value));
    }

    saveData(recordPrefix + 'fields', fieldNames.join('\n'));

    const storedIds = getData(userCollection + ':ids');
    let ids = [];
    if (storedIds) {
        ids = storedIds.split('\n');
    }
    if (ids.indexOf(user.id) === -1) {
        ids.push(user.id);
        saveData(userCollection + ':ids', ids.join('\n'));
    }
}

function copyUser(user) {
    const userCopy = {};
    const fields = Object.keys(user);

    for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        userCopy[field] = user[field];
    }

    return userCopy;
}

function findUserByEmail(email) {
    const users = getUsers();

    for (let index = 0; index < users.length; index += 1) {
        if (users[index].email.toLowerCase() === email) {
            return users[index];
        }
    }

    return null;
}

function findUserById(userId) {
    const users = getUsers();

    for (let index = 0; index < users.length; index += 1) {
        if (users[index].id === userId) {
            return users[index];
        }
    }

    return null;
}

export function ensureDefaultAdmin() {
    if (findUserByEmail(defaultAdminEmail)) {
        return;
    }

    const user = {
        id: createId('user'),
        name: 'Default Administrator',
        email: defaultAdminEmail,
        role: 'admin',
        status: 'Active',
        createdAt: new Date().toISOString(),
        passwordSalt: defaultAdminCredentials.passwordSalt,
        passwordHash: defaultAdminCredentials.passwordHash
    };
    saveUserRecord(user);
}

export async function createPasswordCredentials(password) {
    if (!window.crypto || !window.crypto.subtle) {
        return null;
    }

    const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
    const passwordKey = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const hashBuffer = await window.crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: 100000,
            hash: 'SHA-256'
        },
        passwordKey,
        256
    );

    return {
        passwordSalt: bytesToHex(saltBytes),
        passwordHash: bytesToHex(new Uint8Array(hashBuffer))
    };
}

function bytesToHex(bytes) {
    let result = '';
    for (let index = 0; index < bytes.length; index += 1) {
        result += bytes[index].toString(16).padStart(2, '0');
    }
    return result;
}

async function verifyPassword(password, salt, expectedHash) {
    const saltBytes = new Uint8Array(salt.length / 2);
    for (let index = 0; index < salt.length; index += 2) {
        const byteIndex = index / 2;
        const byteValue = salt.slice(index, index + 2);
        saltBytes[byteIndex] = parseInt(byteValue, 16);
    }

    const passwordKey = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const hashBuffer = await window.crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: 100000,
            hash: 'SHA-256'
        },
        passwordKey,
        256
    );
    return bytesToHex(new Uint8Array(hashBuffer)) === expectedHash;
}

export async function registerUser(name, email, role, password, isAdminAction) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail || validRoles.indexOf(role) === -1 || password.length < 6) {
        return { success: false, message: 'Complete every required field and use a password of at least 6 characters.' };
    }

    if (normalizedEmail === defaultAdminEmail && role !== 'admin') {
        return { success: false, message: 'This email is reserved for the default administrator account.' };
    }

    if (role === 'admin' && !isAdminAction) {
        return { success: false, message: 'Administrator accounts can only be created by an administrator.' };
    }

    if (role === 'admin' && isAdminAction && (!dashboardUser || dashboardUser.role !== 'admin')) {
        return { success: false, message: 'Administrator accounts can only be created by an administrator.' };
    }

    const users = getUsers();

    for (let index = 0; index < users.length; index += 1) {
        if (users[index].email.toLowerCase() === normalizedEmail) {
            return { success: false, message: 'An account with this email already exists.' };
        }
    }

    const credentials = await createPasswordCredentials(password);
    if (!credentials) {
        return { success: false, message: 'Password protection is unavailable. Open the project using localhost or HTTPS.' };
    }

    const user = {
        id: createId('user'),
        name: name.trim(),
        email: normalizedEmail,
        role: role,
        status: 'Active',
        createdAt: new Date().toISOString(),
        passwordSalt: credentials.passwordSalt,
        passwordHash: credentials.passwordHash
    };
    saveUserRecord(user);
    logActivity(user, 'Account created', 'Role: ' + role);
    return { success: true };
}

export async function loginUser(email, password) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = findUserByEmail(normalizedEmail);

    if (!user || user.status === 'Inactive') {
        return { success: false, message: 'Account not found or inactive. Please contact an administrator.' };
    }
    if (!window.crypto || !window.crypto.subtle || !user.passwordSalt || !user.passwordHash) {
        return { success: false, message: 'This account cannot be verified in this browser. Contact the administrator.' };
    }
    if (!await verifyPassword(password, user.passwordSalt, user.passwordHash)) {
        return { success: false, message: 'Incorrect password.' };
    }

    saveData(sessionKey, user.id);
    logActivity(user, 'Signed in', 'Opened the ' + user.role + ' dashboard.');
    return { success: true, role: user.role };
}

export async function resetUserPassword(email, newPassword) {
    if (newPassword.length < 6) {
        return { success: false, message: 'Use a password of at least 6 characters.' };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = findUserByEmail(normalizedEmail);
    if (!user) {
        return { success: false, message: 'No account found with that email address.' };
    }

    const credentials = await createPasswordCredentials(newPassword);
    if (!credentials) {
        return { success: false, message: 'Password protection is unavailable. Open the project using localhost or HTTPS.' };
    }
    const updatedUser = copyUser(user);
    updatedUser.passwordSalt = credentials.passwordSalt;
    updatedUser.passwordHash = credentials.passwordHash;
    saveUserRecord(updatedUser);
    logActivity(updatedUser, 'Password reset', 'Password updated for this account.');
    return { success: true };
}

export function redirectToDashboard(role) {
    const dashboards = {
        researcher: '../Researcher/researcher.html',
        supervisor: '../Supervisor/supervisor.html',
        admin: '../Admin/admin.html',
        reviewer: '../Reviewer/reviewer.html'
    };
    window.location.href = dashboards[role] || '../Auth/login.html';
}

export function initDashboard(expectedRole) {
    const userId = getData(sessionKey);
    if (!userId) {
        window.location.href = '../Auth/login.html';
        return false;
    }

    dashboardUser = findUserById(userId);
    if (!dashboardUser || dashboardUser.status === 'Inactive') {
        removeData(sessionKey);
        window.location.href = '../Auth/login.html';
        return false;
    }
    if (expectedRole && dashboardUser.role !== expectedRole) {
        redirectToDashboard(dashboardUser.role);
        return false;
    }

    const nameDisplay = document.getElementById('headerUserName');
    if (nameDisplay) {
        nameDisplay.textContent = 'Welcome, ' + dashboardUser.name;
    }

    const logoutButton = document.getElementById('logoutBtn');
    if (logoutButton) {
        logoutButton.addEventListener('click', function () {
            removeData(sessionKey);
            window.location.href = '../Auth/login.html';
        });
    }

    const navLinks = document.querySelectorAll('.nav-links a[data-section]');
    const sections = document.querySelectorAll('.dashboard-section');
    for (let index = 0; index < navLinks.length; index += 1) {
        const link = navLinks[index];
        link.addEventListener('click', function (event) {
            event.preventDefault();
            const targetId = link.getAttribute('data-section');
            for (let linkIndex = 0; linkIndex < navLinks.length; linkIndex += 1) {
                navLinks[linkIndex].classList.remove('active');
            }
            link.classList.add('active');
            for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
                const section = sections[sectionIndex];
                section.classList.toggle('hidden', section.id !== targetId);
            }
        });
    }
    return true;
}
