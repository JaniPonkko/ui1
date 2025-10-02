async function callAPI() {
  const input = document.getElementById("userInput").value;
  const output = document.getElementById("responseOutput");

console.log('1');

  try { 
    const response = await fetch("/api/call-openapi", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: input })
    });
console.log('3');

    if (!response.ok) {
      console.log('4');
      const errorText = await response.text();
      output.textContent = `Virhe: ${response.status} ${response.statusText}\n${errorText}`;
      return;
    }

    console.log('5');
    const data = await response.json();
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    console.log('6');
    output.textContent = "Error: " + error.message;
  }
}
