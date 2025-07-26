const DB_NAME = 'EnglishTestDB';
const STORE_NAME = 'answers';

/**
 * Opens the IndexedDB database.
 * Creates the object store if it doesn't exist.
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // Create the "answers" store. `id` is the primary key.
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                // Create an index on `sessionId` so we can easily look up all answers for a test.
                store.createIndex('sessionId_idx', 'sessionId', { unique: false });
            }
        };

        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject(event.target.error);
    });
}

/**
 * Adds a new answer record to the database.
 * @param {object} answerData - The complete answer object to store.
 */
export async function addAnswer(answerData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(answerData); // `put` adds or updates

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Retrieves all answers for a given session ID.
 * @param {string} sessionId - The ID of the test session.
 */
export async function getAnswersForSession(sessionId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('sessionId_idx');
        const request = index.getAll(sessionId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllSessions() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Use a Set to get unique session IDs
            const sessions = new Map();
            request.result.forEach(answer => {
                if (!sessions.has(answer.sessionId)) {
                    sessions.set(answer.sessionId, {
                        id: answer.sessionId,
                        // Use the timestamp of the first answer as the session start time
                        startTime: new Date(answer.timestamp).toLocaleString()
                    });
                }
            });
            // Convert Map values to an array
            resolve(Array.from(sessions.values()));
        };
        request.onerror = () => reject(request.error);
    });
}