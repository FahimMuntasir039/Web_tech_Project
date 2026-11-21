const storagePrefix = 'rcp:';

export function saveData(key, value) {
    if (typeof value !== 'string') {
        throw new TypeError('Storage values must be plain text.');
    }

    localStorage.setItem(storagePrefix + key, value);
}

export function getData(key) {
    return localStorage.getItem(storagePrefix + key);
}

export function removeData(key) {
    localStorage.removeItem(storagePrefix + key);
}

export function createId(prefix) {
    if (window.crypto && window.crypto.randomUUID) {
        return prefix + '-' + window.crypto.randomUUID();
    }

    return prefix + '-' + Date.now().toString(36) + '-' +
        Math.random().toString(36).slice(2);
}

export function logActivity(actor, action, details) {
    const activityKey = 'system:activity';
    const storedActivity = getData(activityKey);
    let activity = [];
    if (storedActivity) {
        activity = JSON.parse(storedActivity);
        if (!Array.isArray(activity)) {
            throw new TypeError('Activity history must be a list.');
        }
    }

    activity.unshift({
        id: createId('activity'),
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: action,
        details: details,
        createdAt: new Date().toISOString()
    });
    if (activity.length > 200) {
        activity.length = 200;
    }
    saveData(activityKey, JSON.stringify(activity));
    window.dispatchEvent(new Event('system:activity-changed'));
}

function openResearchFileDatabase() {
    return new Promise(function (resolve, reject) {
        if (!window.indexedDB) {
            reject(new Error('File storage is not available in this browser.'));
            return;
        }

        const request = window.indexedDB.open('rcp-research-files', 1);
        request.onupgradeneeded = function () {
            request.result.createObjectStore('files', { keyPath: 'id' });
        };
        request.onsuccess = function () {
            resolve(request.result);
        };
        request.onerror = function () {
            reject(request.error || new Error('Research file storage could not be opened.'));
        };
    });
}

export async function saveFile(id, file) {
    const database = await openResearchFileDatabase();
    return new Promise(function (resolve, reject) {
        const transaction = database.transaction('files', 'readwrite');
        transaction.objectStore('files').put({ id: id, file: file });
        transaction.oncomplete = function () {
            database.close();
            resolve();
        };
        transaction.onerror = function () {
            database.close();
            reject(transaction.error || new Error('Research file could not be saved.'));
        };
        transaction.onabort = function () {
            database.close();
            reject(transaction.error || new Error('Research file save was cancelled.'));
        };
    });
}

export async function getFile(id) {
    const database = await openResearchFileDatabase();
    return new Promise(function (resolve, reject) {
        const transaction = database.transaction('files', 'readonly');
        const request = transaction.objectStore('files').get(id);
        request.onsuccess = function () {
            database.close();
            resolve(request.result ? request.result.file : null);
        };
        request.onerror = function () {
            database.close();
            reject(request.error || new Error('Research file could not be read.'));
        };
    });
}

export async function removeFile(id) {
    const database = await openResearchFileDatabase();
    return new Promise(function (resolve, reject) {
        const transaction = database.transaction('files', 'readwrite');
        transaction.objectStore('files').delete(id);
        transaction.oncomplete = function () {
            database.close();
            resolve();
        };
        transaction.onerror = function () {
            database.close();
            reject(transaction.error || new Error('Research file could not be deleted.'));
        };
    });
}
