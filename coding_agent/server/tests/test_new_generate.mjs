async function testGenerate() {
  console.log("🚀 Testing POST /api/generate with NO model or apiKey...");
  
  const payload = {
    prd: "Create a simple python hello world function",
    cavemanMode: false,
    existingFiles: [],
    generationMode: "new"
  };

  try {
    const response = await fetch("http://localhost:3001/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log(`Status: ${response.status}`);
    
    // It's a chunked stream
    for await (const chunk of response.body) {
      const text = chunk.toString();
      if (text.includes("event:")) {
         console.log(text.trim());
      }
    }
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

testGenerate();
