export interface NotebookCell {
  cell_type: "markdown" | "code";
  content: string;
}

export function extractFileIdFromUrl(url: string): string | null {
  // Extract file ID from Google Colab URLs
  // Example: https://colab.research.google.com/drive/1DU3P7ZlNgSzSTF1GWqzbn6VvNRycAamK?usp=sharing
  const match = url.match(/\/drive\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function downloadNotebook(
  fileId: string
): Promise<NotebookCell[]> {
  const url = `/api/notebook/${fileId}`;
  console.log("Fetching notebook from backend:", url);

  const res = await fetch(url);
  console.log("Response:", res);

  if (!res.ok) {
    const errorData = await res
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      errorData.error ||
        `Failed to fetch notebook: ${res.status} ${res.statusText}`
    );
  }

  // The backend already returns parsed JSON
  const notebook = await res.json();

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
