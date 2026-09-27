const axios = require('axios');

async function test() {
    console.log("=== Testing tempmail.lol ===");
    try {
        const res = await axios.get('https://api.tempmail.lol/generate');
        console.log("SUCCESS:", res.data);
    } catch(e) {
        console.error("FAIL:", e.response ? e.response.status : e.message);
    }

    console.log("\n=== Testing mail.tm ===");
    try {
        const res = await axios.get('https://api.mail.tm/domains');
        console.log("SUCCESS:", res.data);
    } catch(e) {
        console.error("FAIL:", e.response ? e.response.status : e.message);
    }

    console.log("\n=== Testing 1secmail ===");
    try {
        const res = await axios.get('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
        console.log("SUCCESS:", res.data);
    } catch(e) {
        console.error("FAIL:", e.response ? e.response.status : e.message);
    }
}

test();
