
const fetch = require('node-fetch');
const { AzureOpenAI } = require("openai");

const endpoint = "https://avcaihelper.openai.azure.com/";
const embeddingModelName = "text-embedding-3-small";
const embeddingApiVersion = "2024-04-01-preview";
const embeddingDeployment = "text-embedding-3-small";
const semaApiKey = process.env.SEMA_API_KEY;


module.exports = async function (context, req) {
  const deployment_name = "gpt-4.1";
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

    if (!semaApiKey) {
    context.log("semaApiKey puuttuu.");
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "semaApiKey puuttuu palvelimen asetuksista." }
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
    context.log("STEP 1: Starting embedding generation");
    // 1. Get embedding for the user query using AzureOpenAI SDK
    const options = {
      endpoint,
      semaApiKey,
      deployment: embeddingDeployment,
      apiVersion: embeddingApiVersion
    };
    const client = new AzureOpenAI(options);
    const embeddingResponse = await client.embeddings.create({
      input: [userQuery],
      model: embeddingModelName
    });
    context.log("STEP 1: Embedding response received");
    const embedding = embeddingResponse.data[0]?.embedding;
    context.log("STEP 1: Embedding extracted", Array.isArray(embedding), embedding ? embedding.length : null);

    // 2. Use the embedding to query your external search service (pseudo-code)
    context.log("STEP 2: (Pseudo) semantic search step");
    // Replace this with your actual search service API call
    // Example:
    // const searchResults = await fetch('YOUR_SEARCH_SERVICE_ENDPOINT', { ... });
    // const topDoc = searchResults[0];

    // For now, just set topDoc to null (no context)
    let topDoc = null;
    context.log("STEP 2: Top doc", topDoc);

    // 3. Pass relevant context to GPT-4.1
    const systemPrompt = topDoc
      ? `Olet avulias assistentti. Tässä on käyttäjän kysymykseen liittyvä tieto: "${topDoc.text}"`
      : "Olet avulias assistentti.";
    context.log("STEP 3: System prompt", systemPrompt);

    const response = await fetch("https://avcaihelper.openai.azure.com/openai/deployments/gpt-4.1/chat/completions?api-version=2025-01-01-preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery }
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });
    context.log("STEP 3: GPT-4.1 response status", response.status);

    context.res = {
      status: response.status,
      headers: { "Content-Type": "application/json" },
      body: await response.json()
    };
    context.log("STEP 4: Response sent to client");
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
}
