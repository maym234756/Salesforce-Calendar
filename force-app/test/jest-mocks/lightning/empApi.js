export const subscribe = jest.fn(() => Promise.resolve({ channel: '/event/Calendar_Event_Change__e' }));

export const unsubscribe = jest.fn((_subscription, callback) => {
    if (typeof callback === 'function') {
        callback({ successful: true });
    }
});

export const onError = jest.fn();

export const isEmpEnabled = jest.fn(() => Promise.resolve(true));