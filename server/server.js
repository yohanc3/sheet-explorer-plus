import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import rateLimit from "express-rate-limit";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { createServer } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// Enable CORS for frontend
app.use(
  cors({
    origin: ["http://localhost:8080", "http://localhost:8081", "http://[::]:8080"],
    credentials: true,
  })
);

// Rate limiting for Python execution endpoint
const pythonExecutionLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many Python execution requests, please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '10mb' })); // 10MB limit for request size

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Backend server is running" });
});

// Python code execution endpoint
app.post("/api/execute-python", pythonExecutionLimit, async (req, res) => {
  let tempCodeFile = null;

  try {
    const { code, packages = [] } = req.body;

    // Validate request
    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        output: "",
        error: "Missing or invalid 'code' parameter"
      });
    }

    if (packages && !Array.isArray(packages)) {
      return res.status(400).json({
        success: false,
        output: "",
        error: "Invalid 'packages' parameter - must be an array"
      });
    }

    // Validate code length (prevent extremely large payloads)
    if (code.length > 100000) { // 100KB limit
      return res.status(400).json({
        success: false,
        output: "",
        error: "Code too large - maximum 100KB allowed"
      });
    }

    // Create temporary file for the Python code
    const tempId = uuidv4();
    tempCodeFile = path.join(__dirname, `temp_${tempId}.py`);

    await fs.writeFile(tempCodeFile, code, 'utf8');

    // Path to the Python executor script
    const executorScript = path.join(__dirname, 'python_executor.py');

    // Prepare packages JSON
    const packagesJson = JSON.stringify(packages);

    console.log(`Executing Python code with packages: ${packagesJson}`);

    // Execute the Python script
    const pythonProcess = spawn('python3', [executorScript, packagesJson, tempCodeFile], {
      timeout: 30000, // 30 second timeout
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', async (code) => {
      // Check if response has already been sent
      if (res.headersSent) {
        return;
      }

      // Clean up temp file
      try {
        await fs.unlink(tempCodeFile);
        tempCodeFile = null;
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }

      if (code === 0 && stdout) {
        try {
          // Parse the JSON result from Python
          const result = JSON.parse(stdout);
          res.json(result);
        } catch (parseError) {
          console.error('Failed to parse Python output:', parseError, 'Output:', stdout);
          res.status(500).json({
            success: false,
            output: "",
            error: "Failed to parse execution results"
          });
        }
      } else {
        console.error(`Python process exited with code ${code}`, 'stderr:', stderr);
        res.status(500).json({
          success: false,
          output: "",
          error: stderr || `Python process exited with code ${code}`
        });
      }
    });

    pythonProcess.on('error', async (error) => {
      console.error('Python execution error:', error);

      // Check if response has already been sent
      if (res.headersSent) {
        return;
      }

      // Clean up temp file
      if (tempCodeFile) {
        try {
          await fs.unlink(tempCodeFile);
        } catch (cleanupError) {
          console.error('Failed to cleanup temp file:', cleanupError);
        }
      }

      if (error.code === 'ENOENT') {
        res.status(500).json({
          success: false,
          output: "",
          error: "Python3 not found. Please ensure Python 3 is installed and available in PATH."
        });
      } else {
        res.status(500).json({
          success: false,
          output: "",
          error: `Execution error: ${error.message}`
        });
      }
    });

    // Handle timeout
    const timeoutId = setTimeout(() => {
      if (!pythonProcess.killed && !res.headersSent) {
        pythonProcess.kill('SIGKILL');
        res.status(408).json({
          success: false,
          output: "",
          error: "Execution timeout (30 seconds exceeded)"
        });
      }
    }, 30000);

    // Clear timeout if process completes
    pythonProcess.on('close', () => {
      clearTimeout(timeoutId);
    });

  } catch (error) {
    console.error('Server error during Python execution:', error);

    // Clean up temp file
    if (tempCodeFile) {
      try {
        await fs.unlink(tempCodeFile);
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      output: "",
      error: "Internal server error"
    });
  }
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

// Create HTTP server
const server = createServer(app);

// Create WebSocket server for interactive Python execution
const wss = new WebSocketServer({ server, path: '/ws/python-execute' });

// Track active Python processes
const activeSessions = new Map();

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  let sessionId = null;
  let pythonProcess = null;
  let tempCodeFile = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'execute') {
        // Initialize execution
        const { code, packages = [] } = data;

        // Validate
        if (!code || typeof code !== 'string') {
          ws.send(JSON.stringify({
            type: 'error',
            data: 'Missing or invalid code parameter'
          }));
          return;
        }

        if (code.length > 100000) {
          ws.send(JSON.stringify({
            type: 'error',
            data: 'Code too large - maximum 100KB allowed'
          }));
          return;
        }

        sessionId = uuidv4();
        tempCodeFile = path.join(__dirname, `temp_${sessionId}.py`);

        try {
          await fs.writeFile(tempCodeFile, code, 'utf8');

          const executorScript = path.join(__dirname, 'python_executor.py');
          const packagesJson = JSON.stringify(packages);

          console.log(`[${sessionId}] Starting Python execution with packages: ${packagesJson}`);

          // Spawn Python process with interactive mode flag
          pythonProcess = spawn('python3', [executorScript, packagesJson, tempCodeFile, '--interactive'], {
            stdio: ['pipe', 'pipe', 'pipe']
          });

          activeSessions.set(sessionId, { process: pythonProcess, ws, tempFile: tempCodeFile });

          // Handle stdout - includes output and protocol messages
          pythonProcess.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            const lines = text.split('\n');

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                // Try to parse as JSON protocol message
                const msg = JSON.parse(line);
                if (msg.type === 'input_request') {
                  // Forward input request to frontend
                  ws.send(JSON.stringify({
                    type: 'input_request',
                    prompt: msg.prompt || 'Enter input:'
                  }));
                } else if (msg.type === 'output') {
                  // Regular output
                  ws.send(JSON.stringify({
                    type: 'output',
                    data: msg.data
                  }));
                } else if (msg.type === 'plot') {
                  // Plot data
                  ws.send(JSON.stringify({
                    type: 'plot',
                    data: msg.data
                  }));
                }
              } catch (e) {
                // Not JSON, treat as regular output
                ws.send(JSON.stringify({
                  type: 'output',
                  data: line
                }));
              }
            }
          });

          // Handle stderr
          pythonProcess.stderr.on('data', (chunk) => {
            ws.send(JSON.stringify({
              type: 'error',
              data: chunk.toString()
            }));
          });

          // Handle process completion
          pythonProcess.on('close', async (code) => {
            console.log(`[${sessionId}] Python process exited with code ${code}`);

            // Clean up
            activeSessions.delete(sessionId);
            if (tempCodeFile) {
              try {
                await fs.unlink(tempCodeFile);
              } catch (err) {
                console.error(`[${sessionId}] Failed to cleanup temp file:`, err);
              }
            }

            ws.send(JSON.stringify({
              type: 'completed',
              exitCode: code
            }));
          });

          pythonProcess.on('error', async (error) => {
            console.error(`[${sessionId}] Python process error:`, error);

            activeSessions.delete(sessionId);
            if (tempCodeFile) {
              try {
                await fs.unlink(tempCodeFile);
              } catch (err) {
                console.error(`[${sessionId}] Failed to cleanup temp file:`, err);
              }
            }

            ws.send(JSON.stringify({
              type: 'error',
              data: error.code === 'ENOENT'
                ? 'Python3 not found. Please ensure Python 3 is installed.'
                : `Execution error: ${error.message}`
            }));
          });

        } catch (error) {
          console.error(`[${sessionId}] Error starting execution:`, error);
          ws.send(JSON.stringify({
            type: 'error',
            data: 'Failed to start Python execution'
          }));
        }

      } else if (data.type === 'input_response') {
        // User provided input - send to Python process stdin
        if (pythonProcess && !pythonProcess.killed) {
          pythonProcess.stdin.write(data.value + '\n');
        }

      } else if (data.type === 'cancel') {
        // Cancel execution
        if (pythonProcess && !pythonProcess.killed) {
          pythonProcess.kill('SIGTERM');
          ws.send(JSON.stringify({
            type: 'cancelled'
          }));
        }
      }

    } catch (error) {
      console.error('WebSocket message handling error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        data: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    // Clean up any active session
    if (sessionId && activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      if (session.process && !session.process.killed) {
        session.process.kill('SIGTERM');
      }
      activeSessions.delete(sessionId);
      if (session.tempFile) {
        fs.unlink(session.tempFile).catch(err =>
          console.error('Failed to cleanup temp file:', err)
        );
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}/ws/python-execute`);
});
