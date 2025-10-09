

const fetch = require('node-fetch');
const { AzureOpenAI } = require("openai");
const { BlobServiceClient } = require('@azure/storage-blob');
//const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');


// ENVIRONMENT VARIABLES (set these in your deployment)
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || "https://avcaihelper.openai.azure.com/";
const embeddingModelName = process.env.AZURE_OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const embeddingApiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-04-01-preview";
const embeddingDeployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-3-small";
const openaiApiKey = process.env.AZURE_OPENAI_API_KEY;
const apiKey = process.env.API_KEY;
const azureStorageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const azureBlobContainerName = process.env.AZURE_BLOB_CONTAINER_NAME;
const azureSearchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const azureSearchIndex = process.env.AZURE_SEARCH_INDEX;
const azureSearchApiKey = process.env.AZURE_SEARCH_API_KEY;
  const azureSearchEmbeddingField = (process.env.AZURE_SEARCH_EMBEDDING_FIELD || "embedding1,embedding2")
      .split(",")
      .map(f => f.trim());
const azureSearchBlobNameField = process.env.AZURE_SEARCH_BLOBNAME_FIELD || "blobName";
const azureSearchSemanticConfig = process.env.AZURE_SEARCH_SEMANTIC_CONFIGURATION;



module.exports = async function (context, req) {
  const deployment_name = "gpt-4.1";
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

    if (!openaiApiKey) {
    context.log("openaiApiKey puuttuu.");
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "openaiApiKey puuttuu palvelimen asetuksista." }
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
      openaiApiKey,
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



    // 2. Use the embedding to query Azure Cognitive Search
    context.log("STEP 2: Azure Cognitive Search vector search");
    let topDoc = null;

    context.log("url: ", `${azureSearchEndpoint}/indexes/${azureSearchIndex}/docs/search?api-version=2025-08-01-preview`);
    context.log("value: ", embedding);
    context.log("fields: ", azureSearchEmbeddingField);

    try {
      const k = 5; // top 1 result
      const searchUrl = `${azureSearchEndpoint}/indexes/${azureSearchIndex}/docs/search?api-version=2025-08-01-preview`;
      const searchBody = {
        //vector: {
        //  value: embedding,
        //  fields: azureSearchEmbeddingField,
        //  k: k
        //},
        search: userQuery, // or your own search string
        count: true,
        queryType: "semantic",  // tai semantic jos haluaa vain tekstihaun ilman vektorihakua
        semanticConfiguration: azureSearchSemanticConfig,
        captions: "extractive",
        answers: "extractive|count-3",
      };
      

      const searchRes = await fetch(searchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": azureSearchApiKey
        },
        body: JSON.stringify(searchBody)
      });
      const searchJson = await searchRes.json();
      context.log("searchJson: ",searchJson);
      context.log("searchJson.value.length: ", searchJson.value.length);
      context.log("searchJson.value: ", searchJson.value);
      if (searchJson.value && searchJson.value.length > 0) {
        context.log("montako topdocia löytyi: ",searchJson.value.length);
        topDoc = searchJson.value[0];
        context.log("STEP 2: Top doc from search", topDoc);
      } else {
        context.log("STEP 2: No relevant doc found in search");
      }
    } catch (searchErr) {
      context.log("STEP 2: Azure Search error", searchErr.message);
    }

    // 3. Fetch blob content if topDoc is found
    let docContent = null;
    if (topDoc && topDoc[azureSearchBlobNameField]) {
      context.log("Löydetty topDoc: ",topDoc[azureSearchBlobNameField]);
      try {
        const blobName = topDoc[azureSearchBlobNameField];
        context.log("STEP 3: Fetching blob content", blobName);
        const blobServiceClient = BlobServiceClient.fromConnectionString(azureStorageConnectionString);
        const containerClient = blobServiceClient.getContainerClient(azureBlobContainerName);
        const blobClient = containerClient.getBlobClient(blobName);
        const downloadBlockBlobResponse = await blobClient.download();
        //docContent = await streamToString(downloadBlockBlobResponse.readableStreamBody);
        docContent = await readBlobAuto(downloadBlockBlobResponse);

        
        context.log("STEP 3: Blob content fetched, length:", docContent.length);
      } catch (blobErr) {
        context.log("STEP 3: Error fetching blob content", blobErr.message);
      }
    }





    // 3.5 Tiivistä dokumentin sisältö GPT:llä
    let summarizedDocContent = docContent;
    if (docContent && docContent.length > 1000) {
      context.log("STEP 3.5: Summarizing document content with GPT");

      // Jos sisältö on JSON, muunna se luettavaksi tekstiksi
      if (isJson(docContent)) {
        context.log("STEP 3.5: Document is JSON, converting to readable text");
        try {
          const parsedJson = JSON.parse(docContent);
          docContent = jsonToReadableText(parsedJson);
          context.log("STEP 3.5: JSON converted to text, length:", docContent.length);
        } catch (jsonErr) {
          context.log("STEP 3.5: JSON parsing failed", jsonErr.message);
        }
      }

      const summarizationPrompt = `Tiivistä seuraava dokumentti siten, että säilyvät kaikki kysymykseen "${userQuery}" liittyvät faktat ja asiayhteydet. Poista epäolennainen sisältö.\n\n${docContent}`;

      const summarizationResponse = await fetch("https://avcaihelper.openai.azure.com/openai/deployments/gpt-4.1/chat/completions?api-version=2025-01-01-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "Olet asiantunteva tiivistäjä." },
            { role: "user", content: summarizationPrompt }
          ],
          max_tokens: 1000,
          temperature: 0.3
        })
      });

      const summarizationJson = await summarizationResponse.json();
      summarizedDocContent = summarizationJson.choices?.[0]?.message?.content?.trim() || docContent;
      context.log("STEP 3.5: Summarized content length:", summarizedDocContent.length);
    }








const systemPrompt = summarizedDocContent
  ? `Olet avulias assistentti. Tässä on käyttäjän kysymykseen liittyvä tiivistetty taustatieto:\n\n${summarizedDocContent}`
  : "Olet avulias assistentti.";

   // const systemPrompt = docContent
   //   ? `Olet avulias assistentti. Tässä on käyttäjän kysymykseen liittyvä taustatieto:\n\n${docContent}`
   //   : "Olet avulias assistentti.";
   
   context.log("STEP 4: System prompt", systemPrompt);

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
        max_tokens: 400,
        temperature: 0.7,
        //stream: true
      })
    });
    context.log("STEP 5: GPT-4.1 response status", response.status);

    try {
      responseBody = await response.json();
    } catch (jsonErr) {
      context.log("JSON parsing error:", jsonErr.message);
      responseBody = { error: "Invalid JSON response from GPT." };
    }

    context.res = {
      status: response.status,
      headers: { "Content-Type": "application/json" },
      body: responseBody
    };
    context.log("STEP 6: Response sent to client");


// Pääfunktio: lue blob automaattisesti
async function readBlobAuto(downloadResponse) {
  
  const contentType = downloadResponse.contentType || "";

  console.log(`Blob contentType: ${contentType}`);

  if (contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("xml")) {
    // Tekstitiedosto
    const text = await streamToStringi(downloadResponse.readableStreamBody);
    console.log("Blob luettu tekstinä");
    return text;
  } else {
    // Binääritiedosto
    const buffer = await streamToBufferi(downloadResponse.readableStreamBody);

    // katsotaan sisältääkö pdf:n?
    if (isPdfBuffer(buffer)) {
      console.log("Blob käsitelty pdf:nä");
      //const bufferi = await downloadBlockBlobResponse.arrayBuffer(); // tai .body, riippuen muodosta
      //const docContent = await extractTextFromPdfBuffer(bufferi);
      //const docContent = await extractTextFromPdfBuffer(buffer);
      return docContent;
    }

    console.log("Blob luettu bufferina");
    return buffer;
  }
}


// Apufunktio: stream to string
async function streamToStringi(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.setEncoding("utf8");
    readableStream.on("data", (chunk) => chunks.push(chunk));
    readableStream.on("end", () => resolve(chunks.join("")));
    readableStream.on("error", reject);
  });
}

// Apufunktio: stream to buffer
async function streamToBufferi(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (data) => chunks.push(data));
    readableStream.on("end", () => resolve(Buffer.concat(chunks)));
    readableStream.on("error", reject);
  });
}


// Funktio: pura PDF-teksti
//async function extractTextFromPdfBuffer(buffer) {
//
//  const data = new Uint8Array(buffer);
//  const pdf = await pdfjsLib.getDocument({ data }).promise;

//  let fullText = "";


//  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
//    const page = await pdf.getPage(pageNum);
//    const content = await page.getTextContent();

//    const pageText = content.items.map(item => item.str).join(" ");
//    fullText += `\n\n--- Page ${pageNum} ---\n\n${pageText}`;
//  }

//  return fullText;

//}

function isPdfBuffer(buffer) {
  const header = buffer.slice(0, 5).toString("utf-8");
  return header === "%PDF-";
}


function isJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

function jsonToReadableText(jsonObj, indent = 0) {
  let output = "";
  const pad = " ".repeat(indent);

  for (const [key, value] of Object.entries(jsonObj)) {
    if (typeof value === "object" && value !== null) {
      output += `${pad}- ${key}:\n${jsonToReadableText(value, indent + 2)}\n`;
    } else {
      output += `${pad}- ${key}: ${value}\n`;
    }
  }

  return output;
}




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

