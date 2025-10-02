const fetch = require('node-fetch');

module.exports = async function (context, req) {
  const apiKey = process.env.API_KEY;
  const userQuery = req.body.query;

  try {
    const response = await fetch("https://your-openapi-endpoint.com/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({ query: userQuery })
    });

    const data = await response.json();
    context.res = {
      status: 200,
      body: data
    };
  } catch (error) {
    context.res = {
      status: 500,
      body: { error: error.message }
    };
  }
};
