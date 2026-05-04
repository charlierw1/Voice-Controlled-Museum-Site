// V&A API endpoint URLs
const objectURL = "https://api.vam.ac.uk/v2/museumobject/"
const searchURL = "https://api.vam.ac.uk/v2/objects/search?q="
const objectSearchURL = "https://api.vam.ac.uk/v2/objects/search?"
const categoryClusterURL = "https://api.vam.ac.uk/v2/objects/clusters/category/search?"

// Minimum milliseconds between requests and max daily request allowance
const API_MIN_INTERVAL_MS = 1000;
const API_DAILY_LIMIT = 3000;
const API_DAILY_COUNTER_KEY = "va-api-daily-counter-v1";
// Serial promise queue to prevent concurrent API calls
let apiQueue = Promise.resolve();
let lastApiRequestAt = 0;
// Caches request promises by URL to avoid duplicate fetches
const apiResponseCache = new Map();

// Returns today's date as YYYY-MM-DD for the daily counter key
function getTodayDateKey() {
    return new Date().toISOString().slice(0, 10);
}

// Checks and increments the daily request counter; returns false if limit reached
function consumeDailyBudget() {
    if (typeof window === "undefined" || !window.localStorage) {
        return true;
    }

    const today = getTodayDateKey();

    try {
        const rawValue = window.localStorage.getItem(API_DAILY_COUNTER_KEY);
        const counter = rawValue ? JSON.parse(rawValue) : { date: today, count: 0 };

        // Reset the counter when the date changes
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

// Adds a task to the serial queue, waiting if the minimum interval hasn't elapsed
function enqueueApiRequest(task) {
    apiQueue = apiQueue.then(async () => {
        if (!consumeDailyBudget()) {
            return undefined;
        }

        const now = Date.now();
        const msSinceLastRequest = now - lastApiRequestAt;
        const waitMs = Math.max(0, API_MIN_INTERVAL_MS - msSinceLastRequest);

        // Delay if the last request was too recent
        if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }

        lastApiRequestAt = Date.now();
        return task();
    });

    return apiQueue;
}

// Fetches JSON for the given URL+parameters, using the cache and request queue
async function getData(URL, parameters) {
    const callURL = URL + parameters;

    // Return cached promise if this URL was already requested
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