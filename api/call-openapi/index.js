const fetch = require('node-fetch');

module.exports = async function (context, req) {
  const apiKey = process.env.API_KEY;
  const userQuery = req.body.query;

  // Tarkistetaan että API-avain on asetettu
  if (!apiKey) {
    context.log("API_KEY puuttuu ympäristömuuttujista.");
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "API_KEY puuttuu palvelimen asetuksista." }
    };
    return;
  }

  // Tarkistetaan että käyttäjän syöte on annettu
  if (!userQuery) {
    context.log("Käyttäjän syöte puuttuu.");
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Pyynnöstä puuttuu 'query'-kenttä." }
    };
    return;
  }


  try {
    const response = await fetch("https://avcaihelper.openai.azure.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({ query: userQuery })
    });

  const text = await response.text();

   // Yritetään jäsentää JSON
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (jsonError) {
      context.log("Vastaus ei ollut kelvollista JSONia:", text);
      context.res = {
        status: 502,
        headers: { "Content-Type": "application/json" },
        body: { error: "Ulkoisen API:n vastaus ei ollut kelvollista JSONia.", raw: text }
      };
      return;
    }

    // Palautetaan onnistunut vastaus
    context.res = {
      status: response.status,
      headers: { "Content-Type": "application/json" },
      body: parsed
    };
  } catch (error) {
    context.log("Virhe API-kutsussa:", error.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Virhe ulkoisen API:n kutsussa.", details: error.message }
    };
  }
};
