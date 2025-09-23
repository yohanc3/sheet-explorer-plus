import React from "react";
import Markdown from "react-markdown";
import { Card } from "@/components/ui/card";
import { Code2, FileText, Loader2 } from "lucide-react";
import { NotebookCell } from "@/utils/notebookDownloader";

interface NotebookRendererProps {
  cells: NotebookCell[];
  isLoading?: boolean;
  error?: string;
  studentName?: string;
  assignmentTitle?: string;
}

export const NotebookRenderer: React.FC<NotebookRendererProps> = ({
  cells,
  isLoading,
  error,
  studentName,
  assignmentTitle,
}) => {
  if (isLoading) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 2.5rem)' }}>
        <Card className="h-full flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
            <h3 className="text-lg font-semibold mb-2">Loading Notebook</h3>
            <p className="text-muted-foreground">
              Downloading and parsing Google Colab notebook...
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 2.5rem)' }}>
        <Card className="h-full flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <FileText className="h-16 w-16 mx-auto mb-4 text-destructive opacity-50" />
            <h3 className="text-xl font-semibold mb-2 text-destructive">
              Failed to Load Notebook
            </h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            {studentName && assignmentTitle && (
              <div className="text-sm text-muted-foreground bg-muted/30 p-4 rounded">
                <p>
                  <strong>Student:</strong> {studentName}
                </p>
                <p>
                  <strong>Assignment:</strong> {assignmentTitle}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (!cells || cells.length === 0) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 2.5rem)' }}>
        <Card className="h-full flex items-center justify-center p-8">
          <div className="text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">Empty Notebook</h3>
            <p className="text-muted-foreground">
              This notebook doesn't contain any cells
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const formatContent = (content: string) => {
    // Handle newlines by splitting and rejoining with proper line breaks
    return content.replace(/\\n/g, "\n");
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 2.5rem)' }}>
      <Card className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 h-12 px-4 border-b flex items-center bg-sidebar-bg">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">
              {studentName} - {assignmentTitle}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            {cells.map((cell, index) => (
              <Card key={index} className="p-4 flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  {cell.cell_type === "markdown" ? (
                    <FileText className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Code2 className="h-4 w-4 text-green-500" />
                  )}
                  <span className="text-sm font-medium capitalize text-muted-foreground">
                    {cell.cell_type}
                  </span>
                </div>

                {cell.cell_type === "markdown" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <Markdown>{formatContent(cell.content)}</Markdown>
                  </div>
                ) : (
                  <pre className="bg-muted/50 p-3 rounded text-sm overflow-x-auto max-h-96 overflow-y-auto">
                    <code>{formatContent(cell.content)}</code>
                  </pre>
                )}
              </Card>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};
