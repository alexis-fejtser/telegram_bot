export const userState = new Map();

export function getUserState(userId) {
    return userState.get(userId) || {};
}

export function setUserState(userId, patch = {}) {
    const current = getUserState(userId);

    userState.set(userId, {
        ...current,
        ...patch,
    });

    return userState.get(userId);
}

export function clearUserMode(userId) {
    const current = getUserState(userId);

    userState.set(userId, {
        ...current,
        mode: null,
    });

    return userState.get(userId);
}

export function deleteUserState(userId) {
    userState.delete(userId);
}