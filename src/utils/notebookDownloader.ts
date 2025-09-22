export interface NotebookCell {
  cell_type: 'markdown' | 'code';
  content: string;
}

export function extractFileIdFromUrl(url: string): string | null {
  // Extract file ID from Google Colab URLs
  // Example: https://colab.research.google.com/drive/1DU3P7ZlNgSzSTF1GWqzbn6VvNRycAamK?usp=sharing
  const match = url.match(/\/drive\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function downloadNotebook(fileId: string): Promise<NotebookCell[]> {
  const url = `https://drive.google.com/uc?id=${fileId}&export=download`;
  console.log("Fetching notebook:", url);
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch notebook: ${res.status} ${res.statusText}`
    );
  }
  
  const content = await res.text();

  // Parse JSON
  let notebook;
  try {
    notebook = JSON.parse(content);
  } catch (err) {
    throw new Error(
      "Downloaded content is not valid JSON. Maybe the link is restricted?"
    );
  }

  // Extract cells in the desired format
  const extractedCells: NotebookCell[] = [];

  if (notebook.cells && Array.isArray(notebook.cells)) {
    for (const cell of notebook.cells) {
      if (cell.cell_type === "markdown" || cell.cell_type === "code") {
        // Join source array into a single string
        const content = Array.isArray(cell.source)
          ? cell.source.join("")
          : cell.source || "";

        extractedCells.push({
          cell_type: cell.cell_type,
          content: content,
        });
      }
    }
  }

  return extractedCells;
}