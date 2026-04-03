const objectURL = "https://api.vam.ac.uk/v2/museumobject/"
const searchURL = "https://api.vam.ac.uk/v2/objects/search?q="

async function getData(URL, parameters) {
    const callURL = URL + parameters;
    try {
        const response = await fetch(callURL);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        const result = await response.json();
        console.log(result);
    }   catch (error) {
        console.error(error.message);
    }
}