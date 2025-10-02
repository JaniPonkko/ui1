const fetch = require('node-fetch');

module.exports = async function (context, req) {
  const apiKey = process.env.API_KEY;
  const userQuery = req.body?.query;

  if (!apiKey) {
    context.log("API_KEY puuttuu.");
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "API_KEY puuttuu palvelimen asetuksista." }
    };
    return;
  }

  if (!userQuery) {
    context.log("query puuttuu.");
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Pyynnöstä puuttuu 'query'-kenttä." }
    };
    return;
  }

  try {
    const response = await fetch("https://avcaihelper.openai.azure.com/openai/deployments/text-embedding-3-small/embeddings?api-version=2023-05-15", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        //messages: [{ role: "user", content: userQuery }],
        //max_tokens: 100,
        //temperature: 0.7
         input: userQuery
      })
    });

    const text = await response.text();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (jsonError) {
      context.log("Vastaus ei ollut kelvollista JSONia:", text);
      context.res = {
        status: 502,
        headers: { "Content-Type": "application/json" },
        body: {
          error: "Ulkoisen API:n vastaus ei ollut kelvollista JSONia.",
          raw: text
        }
      };
      return;
    }

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
      body: {
        error: "Virhe ulkoisen API:n kutsussa.",
        details: error.message
      }
    };
  }
};
