import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3002;

// Enable CORS for frontend
app.use(
  cors({
    origin: ["http://localhost:8080", "http://[::]:8080"],
    credentials: true,
  })
);

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Backend server is running" });
});

// Endpoint to fetch Google Drive notebook content
app.get("/api/notebook/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({
        error: "File ID is required",
      });
    }

    const url = `https://drive.google.com/uc?id=${fileId}&export=download`;
    console.log("Fetching notebook:", url);

    const response = await fetch(url);
    console.log("Response status:", response.status);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch notebook: ${response.status} ${response.statusText}`,
      });
    }

    const content = await response.text();

    console.log("Content:", content);

    // Validate JSON
    let notebook;
    try {
      notebook = JSON.parse(content);
    } catch (err) {
      return res.status(400).json({
        error:
          "Downloaded content is not valid JSON. Maybe the link is restricted?",
      });
    }

    // Return the raw notebook JSON
    res.json(notebook);
  } catch (error) {
    console.error("Error fetching notebook:", error);
    res.status(500).json({
      error: "Internal server error while fetching notebook",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
