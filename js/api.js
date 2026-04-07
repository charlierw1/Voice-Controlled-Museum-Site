const objectURL = "https://api.vam.ac.uk/v2/museumobject/"
const searchURL = "https://api.vam.ac.uk/v2/objects/search?q="

const API_MIN_INTERVAL_MS = 1000;
const API_DAILY_LIMIT = 3000;
const API_DAILY_COUNTER_KEY = "va-api-daily-counter-v1";
let apiQueue = Promise.resolve();
let lastApiRequestAt = 0;
const apiResponseCache = new Map();

function getTodayDateKey() {
    return new Date().toISOString().slice(0, 10);
}

function consumeDailyBudget() {
    if (typeof window === "undefined" || !window.localStorage) {
        return true;
    }

    const today = getTodayDateKey();

    try {
        const rawValue = window.localStorage.getItem(API_DAILY_COUNTER_KEY);
        const counter = rawValue ? JSON.parse(rawValue) : { date: today, count: 0 };

        if (counter.date !== today) {
            counter.date = today;
            counter.count = 0;
        }

        if (counter.count >= API_DAILY_LIMIT) {
            console.error("V&A API daily request limit reached (3000).");
            return false;
        }

        counter.count += 1;
        window.localStorage.setItem(API_DAILY_COUNTER_KEY, JSON.stringify(counter));
        return true;
    } catch (error) {
        console.error("Could not read API daily counter.", error);
        return true;
    }
}

function enqueueApiRequest(task) {
    apiQueue = apiQueue.then(async () => {
        if (!consumeDailyBudget()) {
            return undefined;
        }

        const now = Date.now();
        const msSinceLastRequest = now - lastApiRequestAt;
        const waitMs = Math.max(0, API_MIN_INTERVAL_MS - msSinceLastRequest);

        if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }

        lastApiRequestAt = Date.now();
        return task();
    });

    return apiQueue;
}

async function getData(URL, parameters) {
    const callURL = URL + parameters;

    if (apiResponseCache.has(callURL)) {
        return apiResponseCache.get(callURL);
    }

    const requestPromise = enqueueApiRequest(async () => {
        try {
            const response = await fetch(callURL);
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error(error.message);
        }
    });

    apiResponseCache.set(callURL, requestPromise);
    return requestPromise;
}