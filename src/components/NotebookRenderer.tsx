import React, { useState, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import { Card } from "@/components/ui/card";
import {
  Code2,
  FileText,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  Play,
  RotateCcw,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { NotebookCell, NotebookOutput, StreamOutput, ErrorOutput } from "@/utils/notebookDownloader";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { nightOwl } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  serverPythonExecutor,
  ExecutionResult,
} from "@/services/serverPythonExecutor";

interface NotebookRendererProps {
  cells: NotebookCell[];
  isLoading?: boolean;
  error?: string;
  studentName?: string;
  assignmentTitle?: string;
  notebookUrl?: string;
  // Navigation props for quick grading
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  canNavigatePrevious?: boolean;
  canNavigateNext?: boolean;
}

export const NotebookRenderer: React.FC<NotebookRendererProps> = ({
  cells,
  isLoading,
  error,
  studentName,
  assignmentTitle,
  notebookUrl,
  onNavigatePrevious,
  onNavigateNext,
  canNavigatePrevious,
  canNavigateNext,
}) => {
  const [showHiddenCells, setShowHiddenCells] = useState(false);
  const [quickGrading, setQuickGrading] = useState(false);
  const [executionResults, setExecutionResults] = useState<{
    [cellIndex: number]: ExecutionResult & {
      timestamp?: number;
      isNew?: boolean;
    };
  }>({});
  const [executingCells, setExecutingCells] = useState<Set<number>>(new Set());
  const [autoExecutingCells, setAutoExecutingCells] = useState<Set<number>>(
    new Set()
  );
  const [pythonReady, setPythonReady] = useState(true); // Server-side is always ready
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [waitingForInput, setWaitingForInput] = useState<{
    cellIndex: number;
    prompt: string;
    value: string;
    resolve: (value: string) => void;
    reject: (reason?: any) => void;
  } | null>(null);
  const [expandedStudentOutputs, setExpandedStudentOutputs] = useState<Set<number>>(new Set());

  // Function to get the last code and markdown cells for quick grading
  function getQuickGradingCells(cellArray: NotebookCell[]): NotebookCell[] {
    if (cellArray.length === 0) return [];

    // Find the last code cell and last markdown cell
    let lastCodeIndex = -1;
    let lastMarkdownIndex = -1;

    for (let i = cellArray.length - 1; i >= 0; i--) {
      if (cellArray[i].cell_type === "code" && lastCodeIndex === -1) {
        lastCodeIndex = i;
      }
      if (cellArray[i].cell_type === "markdown" && lastMarkdownIndex === -1) {
        lastMarkdownIndex = i;
      }
      // Stop once we found both
      if (lastCodeIndex !== -1 && lastMarkdownIndex !== -1) break;
    }

    // Collect the cells to show
    const indicesToShow: number[] = [];
    if (lastCodeIndex !== -1) indicesToShow.push(lastCodeIndex);
    if (lastMarkdownIndex !== -1) indicesToShow.push(lastMarkdownIndex);

    // Sort indices to maintain original order
    indicesToShow.sort((a, b) => a - b);

    // Return the selected cells
    return indicesToShow.map((index) => cellArray[index]);
  }

  // Auto-scroll to bottom when navigating in quick grade mode
  useEffect(() => {
    if (!quickGrading || !scrollContainerRef.current) return;

    // Small delay to let content render first
    const timeoutId = setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [quickGrading, studentName, assignmentTitle, cells]);

  // Keyboard navigation for quick grading mode
  useEffect(() => {
    if (!quickGrading) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle navigation if we're in quick grading mode
      if (
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.contentEditable === "true")
      ) {
        return; // Don't handle navigation when typing in inputs
      }

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          if (canNavigatePrevious && onNavigatePrevious) {
            onNavigatePrevious();
          }
          break;
        case "ArrowRight":
          event.preventDefault();
          if (canNavigateNext && onNavigateNext) {
            onNavigateNext();
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    quickGrading,
    canNavigatePrevious,
    canNavigateNext,
    onNavigatePrevious,
    onNavigateNext,
  ]);

  // Auto-execute code cells when in quick grading mode and cells change
  useEffect(() => {
    if (!quickGrading || !pythonReady || !cells.length) return;

    // Compute displayCells here within the effect
    const visibleCells = showHiddenCells ? cells : cells.slice(0, -2);
    const computedDisplayCells = quickGrading
      ? getQuickGradingCells(visibleCells)
      : visibleCells;

    if (!computedDisplayCells.length) return;

    // Clear previous execution results when switching to a new assignment/notebook
    setExecutionResults({});
    setAutoExecutingCells(new Set());

    // Auto-execute all code cells
    const autoExecuteAllCells = async () => {
      const codeCells = computedDisplayCells
        .map((cell, index) => ({ cell, index }))
        .filter(({ cell }) => cell.cell_type === "code");

      if (codeCells.length === 0) return;

      console.log(
        `Auto-executing ${codeCells.length} code cells in quick grading mode`
      );

      // Set all code cells as auto-executing
      setAutoExecutingCells(new Set(codeCells.map(({ index }) => index)));

      // Execute cells sequentially to avoid overwhelming the server
      for (const { cell, index } of codeCells) {
        try {
          await executeCell(index, cell.content, true); // true indicates auto-execution
        } catch (error) {
          console.error(`Auto-execution failed for cell ${index}:`, error);
        }
      }

      // Clear auto-executing state after a delay to show the animation
      setTimeout(() => {
        setAutoExecutingCells(new Set());
      }, 1000);
    };

    // Small delay to let the UI update before starting execution
    const timeoutId = setTimeout(autoExecuteAllCells, 100);

    return () => clearTimeout(timeoutId);
  }, [quickGrading, cells, showHiddenCells, pythonReady]);

  // Current cell being executed (for input tracking)
  const currentExecutingCell = useRef<number | null>(null);

  // Handle input request from Python
  const handleInputRequest = (prompt: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const cellIndex = currentExecutingCell.current ?? 0;
      setWaitingForInput({
        cellIndex,
        prompt,
        value: "",
        resolve,
        reject,
      });
    });
  };

  // Submit input
  const handleInputSubmit = (cellIndex: number) => {
    if (waitingForInput && waitingForInput.cellIndex === cellIndex) {
      waitingForInput.resolve(waitingForInput.value);
      setWaitingForInput(null);
    }
  };

  // Cancel input
  const handleInputCancel = (cellIndex: number) => {
    if (waitingForInput && waitingForInput.cellIndex === cellIndex) {
      waitingForInput.reject(new Error("Input cancelled"));
      setWaitingForInput(null);
    }
  };

  // Update input value
  const handleInputChange = (cellIndex: number, value: string) => {
    if (waitingForInput && waitingForInput.cellIndex === cellIndex) {
      setWaitingForInput({
        ...waitingForInput,
        value,
      });
    }
  };

  // Execute code in a cell
  const executeCell = async (
    cellIndex: number,
    code: string,
    isAutoExecution = false
  ) => {
    console.log("executeCell called:", {
      cellIndex,
      code,
      pythonReady,
      isAutoExecution,
    });

    if (!pythonReady) {
      console.warn("Python environment not ready");
      return;
    }

    // Track current cell for input requests
    currentExecutingCell.current = cellIndex;

    console.log("Setting executing state for cell:", cellIndex);
    setExecutingCells((prev) => new Set([...prev, cellIndex]));

    // Clear previous output while execution is in progress
    setExecutionResults((prev) => ({
      ...prev,
      [cellIndex]: {
        success: false,
        output: "",
        error: "",
        timestamp: Date.now(),
        isNew: false,
      },
    }));

    try {
      console.log("Calling serverPythonExecutor.executeCodeInteractive...");

      // Extract potential packages from common imports
      const packages: string[] = [];
      if (code.includes("matplotlib") || code.includes("plt")) {
        packages.push("matplotlib");
      }
      if (code.includes("numpy") || code.includes("np")) {
        packages.push("numpy");
      }
      if (code.includes("pandas") || code.includes("pd")) {
        packages.push("pandas");
      }
      if (code.includes("scipy")) {
        packages.push("scipy");
      }
      if (code.includes("sklearn")) {
        packages.push("scikit-learn");
      }

      // Use interactive execution with input support
      const result = await serverPythonExecutor.executeCodeInteractive(code, packages, {
        onInputRequest: handleInputRequest,
        onOutput: (data) => {
          // Update output in real-time
          setExecutionResults((prev) => {
            const current = prev[cellIndex] || { success: false, output: "", error: "" };
            return {
              ...prev,
              [cellIndex]: {
                ...current,
                output: (current.output || "") + data + "\n",
                timestamp: Date.now(),
              },
            };
          });
        },
        onPlot: (data) => {
          // Add plots as they arrive
          setExecutionResults((prev) => {
            const current = prev[cellIndex] || { success: false, output: "", error: "" };
            return {
              ...prev,
              [cellIndex]: {
                ...current,
                plots: [...(current.plots || []), data],
                timestamp: Date.now(),
              },
            };
          });
        },
      });

      console.log("Got result:", result);

      const timestamp = Date.now();
      setExecutionResults((prev) => ({
        ...prev,
        [cellIndex]: {
          ...result,
          timestamp,
          isNew: true,
        },
      }));

      // Clear executing state immediately after setting results
      console.log("Clearing executing state for cell:", cellIndex);
      setExecutingCells((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cellIndex);
        return newSet;
      });

      // Clear the "isNew" flag after 3 seconds
      setTimeout(() => {
        setExecutionResults((prev) => ({
          ...prev,
          [cellIndex]: prev[cellIndex]
            ? {
                ...prev[cellIndex],
                isNew: false,
              }
            : prev[cellIndex],
        }));
      }, 3000);
    } catch (error) {
      console.error("Error in executeCell:", error);
      const timestamp = Date.now();
      setExecutionResults((prev) => ({
        ...prev,
        [cellIndex]: {
          success: false,
          output: "",
          error: error instanceof Error ? error.message : String(error),
          timestamp,
          isNew: true,
        },
      }));

      // Clear executing state immediately after setting results
      console.log("Clearing executing state for cell (error):", cellIndex);
      setExecutingCells((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cellIndex);
        return newSet;
      });

      // Clear the "isNew" flag after 3 seconds
      setTimeout(() => {
        setExecutionResults((prev) => ({
          ...prev,
          [cellIndex]: prev[cellIndex]
            ? {
                ...prev[cellIndex],
                isNew: false,
              }
            : prev[cellIndex],
        }));
      }, 3000);
    }
  };

  // Reset Python environment
  const resetPython = async () => {
    if (!pythonReady) return;

    try {
      await serverPythonExecutor.reset();
      setExecutionResults({});
    } catch (error) {
      console.error("Failed to reset Python environment:", error);
    }
  };

  // Toggle student output expansion
  const toggleStudentOutput = (cellIndex: number) => {
    setExpandedStudentOutputs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(cellIndex)) {
        newSet.delete(cellIndex);
      } else {
        newSet.add(cellIndex);
      }
      return newSet;
    });
  };

  // Render student output content
  const renderStudentOutput = (output: NotebookOutput) => {
    if (output.output_type === "stream") {
      const streamOutput = output as StreamOutput;
      const text = Array.isArray(streamOutput.text)
        ? streamOutput.text.join("")
        : streamOutput.text;

      return (
        <div className="text-sm font-mono whitespace-pre-wrap">
          {text}
        </div>
      );
    } else if (output.output_type === "error") {
      const errorOutput = output as ErrorOutput;
      return (
        <div className="text-sm font-mono text-destructive">
          <div className="font-semibold mb-1">
            {errorOutput.ename}: {errorOutput.evalue}
          </div>
          {errorOutput.traceback && errorOutput.traceback.length > 0 && (
            <div className="whitespace-pre-wrap text-xs">
              {errorOutput.traceback.join("\n")}
            </div>
          )}
        </div>
      );
    }
    // For other output types (execute_result, display_data), we can add support later
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col" style={{ height: "calc(100vh - 2.5rem)" }}>
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
      <div className="flex flex-col" style={{ height: "calc(100vh - 2.5rem)" }}>
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
      <div className="flex flex-col" style={{ height: "calc(100vh - 2.5rem)" }}>
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

  // Filter cells - hide last 2 cells by default (submission cells)
  const visibleCells = showHiddenCells ? cells : cells.slice(0, -2);
  const hiddenCells = cells.slice(-2);
  const hasHiddenCells = hiddenCells.length > 0;

  // Quick grading mode - show only the last few meaningful cells
  const displayCells = quickGrading
    ? getQuickGradingCells(visibleCells)
    : visibleCells;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 2.5rem)" }}>
      <Card className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 h-12 px-4 border-b flex items-center justify-between bg-sidebar-bg">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">
              {studentName} - {assignmentTitle}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Quick Grade</span>
              <Switch
                checked={quickGrading}
                onCheckedChange={setQuickGrading}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetPython}
              disabled={!pythonReady}
              title="Reset Python Environment"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset Python
            </Button>
            <div className="text-xs text-muted-foreground">
              Python: {pythonReady ? "✓ Ready" : "⏳ Loading..."}
            </div>
            {notebookUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(notebookUrl, "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Open in Colab
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
          <div className="p-6 space-y-4">
            {quickGrading && displayCells.length > 0 && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-accent">
                    <Eye className="h-4 w-4" />
                    Quick Grading Mode - Showing last {displayCells.length} key
                    cell{displayCells.length !== 1 ? "s" : ""}
                    {autoExecutingCells.size > 0 && (
                      <span className="flex items-center gap-1 text-blue-500 ml-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Auto-executing {autoExecutingCells.size} cell
                        {autoExecutingCells.size !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Use ← → arrow keys to navigate students
                  </div>
                </div>
              </div>
            )}
            {displayCells.map((cell, index) => {
              const isExecuting = executingCells.has(index);
              const isAutoExecuting = autoExecutingCells.has(index);
              const result = executionResults[index];

              return (
                <Card key={index} className="p-4 flex-shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {cell.cell_type === "markdown" ? (
                        <FileText className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Code2 className="h-4 w-4 text-green-500" />
                      )}
                      <span className="text-sm font-medium capitalize text-muted-foreground">
                        {cell.cell_type}
                      </span>
                    </div>

                    {cell.cell_type === "code" && (
                      <div className="flex items-center gap-2">
                        {isAutoExecuting && (
                          <span className="text-xs text-blue-500 font-medium">
                            Auto-executing...
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => executeCell(index, cell.content)}
                          disabled={
                            !pythonReady || isExecuting || isAutoExecuting
                          }
                        >
                          {isExecuting || isAutoExecuting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Play className="h-4 w-4 mr-1" />
                          )}
                          {isExecuting || isAutoExecuting
                            ? "Running..."
                            : "Run"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {cell.cell_type === "markdown" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <Markdown>{formatContent(cell.content)}</Markdown>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded text-sm max-h-96 overflow-y-auto">
                        <SyntaxHighlighter
                          language="python"
                          style={nightOwl}
                          customStyle={{
                            margin: 0,
                            borderRadius: "0.375rem",
                            fontSize: "0.875rem",
                            maxHeight: "24rem",
                          }}
                        >
                          {formatContent(cell.content)}
                        </SyntaxHighlighter>
                      </div>

                      {/* Student Submission Output */}
                      {cell.outputs && cell.outputs.length > 0 && (
                        <div className="mt-3">
                          <button
                            onClick={() => toggleStudentOutput(index)}
                            className="flex items-center gap-2 w-full text-left px-3 py-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/30 transition-colors"
                          >
                            {expandedStudentOutputs.has(index) ? (
                              <ChevronDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            )}
                            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                              Student Submission Output ({cell.outputs.length})
                            </span>
                          </button>

                          {expandedStudentOutputs.has(index) && (
                            <div className="mt-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-950/10 p-3 max-h-64 overflow-y-auto">
                              <div className="space-y-2">
                                {cell.outputs.map((output, outputIndex) => (
                                  <div key={outputIndex}>
                                    {renderStudentOutput(output)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Output Display */}
                      {(result || isAutoExecuting || (waitingForInput?.cellIndex === index)) && (
                        <div className="border-t pt-3 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            {waitingForInput?.cellIndex === index ? (
                              <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
                            ) : (isExecuting || isAutoExecuting) ? (
                              <div className="h-2 w-2 bg-yellow-500 rounded-full animate-pulse"></div>
                            ) : result ? (
                              <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                            ) : null}
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                              {waitingForInput?.cellIndex === index ? (
                                "Waiting for input..."
                              ) : (isExecuting || isAutoExecuting) ? (
                                "Executing..."
                              ) : result?.isNew ? (
                                `Fresh execution result • ${new Date(result.timestamp!).toLocaleTimeString()}`
                              ) : result ? (
                                `Execution result • ${new Date(result.timestamp!).toLocaleTimeString()}`
                              ) : (
                                "Ready to execute"
                              )}
                            </span>
                          </div>

                          {/* Input Request Section */}
                          {waitingForInput?.cellIndex === index && (
                            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg mb-3">
                              <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-3">
                                {waitingForInput.prompt}
                              </div>
                              <div className="flex gap-2">
                                <Input
                                  value={waitingForInput.value}
                                  onChange={(e) => handleInputChange(index, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleInputSubmit(index);
                                    } else if (e.key === "Escape") {
                                      handleInputCancel(index);
                                    }
                                  }}
                                  placeholder="Type your input and press Enter..."
                                  className="flex-1 bg-white dark:bg-gray-900"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleInputSubmit(index)}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  Submit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleInputCancel(index)}
                                >
                                  Cancel
                                </Button>
                              </div>
                              <div className="text-xs text-muted-foreground mt-2">
                                Press Enter to submit, Esc to cancel
                              </div>
                            </div>
                          )}

                          {result?.output && (
                            <div className="bg-muted/30 p-3 rounded text-sm font-mono">
                              <div className="text-xs text-muted-foreground mb-1">
                                Output:
                              </div>
                              <pre className="whitespace-pre-wrap">
                                {result?.output}
                              </pre>
                            </div>
                          )}

                          {result?.error && (
                            <div className="bg-destructive/10 border border-destructive/20 p-3 rounded text-sm font-mono mt-2">
                              <div className="text-xs text-destructive mb-1">
                                Error:
                              </div>
                              <pre className="whitespace-pre-wrap text-destructive">
                                {result?.error}
                              </pre>
                            </div>
                          )}

                          {result?.plots && result.plots.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs text-muted-foreground mb-2">
                                Plots:
                              </div>
                              <div className="space-y-2">
                                {result?.plots?.map((plot, plotIndex) => (
                                  <img
                                    key={plotIndex}
                                    src={`data:image/png;base64,${plot}`}
                                    alt={`Plot ${plotIndex + 1}`}
                                    className="max-w-full h-auto rounded border"
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}

            {hasHiddenCells && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHiddenCells(!showHiddenCells)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {showHiddenCells ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-2" />
                      Hide submission cells
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      Show submission cells ({hiddenCells.length} hidden)
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
