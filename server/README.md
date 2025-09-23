# Backend Server

This is a simple Express.js backend server that handles fetching Google Drive notebook content to avoid CORS issues.

## Endpoints

- `GET /health` - Health check endpoint
- `GET /api/notebook/:fileId` - Fetches a Google Drive notebook by file ID and returns the JSON content

## Running the Server

### Option 1: Run backend and frontend separately
```bash
# Terminal 1: Start the backend server
npm run server

# Terminal 2: Start the frontend
npm run dev
```

### Option 2: Run both together
```bash
# Start both backend and frontend concurrently
npm run dev:full
```

The backend runs on port 3002 and the frontend development server proxies API requests to it.

## How it works

1. The frontend calls `/api/notebook/:fileId`
2. Vite's dev server proxies this to `http://localhost:3002/api/notebook/:fileId`
3. The backend fetches `https://drive.google.com/uc?id=${fileId}&export=download`
4. The backend returns the parsed JSON to the frontend
5. The frontend processes the notebook cells as before

This setup avoids CORS issues when fetching from Google Drive directly from the browser.
