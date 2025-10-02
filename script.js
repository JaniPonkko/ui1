async function callAPI() {
  const input = document.getElementById("userInput").value;
  const output = document.getElementById("responseOutput");

  try {
    const response = await fetch("/api/call-openapi", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: input })
    });

    const data = await response.json();
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    output.textContent = "Error: " + error.message;
  }
