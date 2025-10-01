export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  plots?: string[]; // Base64 encoded images
}

export interface InputRequestCallback {
  (prompt: string): Promise<string>;
}

export interface ExecutionCallbacks {
  onOutput?: (data: string) => void;
  onError?: (data: string) => void;
  onPlot?: (data: string) => void;
  onInputRequest?: InputRequestCallback;
}

class ServerPythonExecutor {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;

  constructor() {
    // Use the server port from package.json scripts
    this.baseUrl = 'http://localhost:3002';
    this.wsUrl = 'ws://localhost:3002/ws/python-execute';
  }

  /**
   * Execute Python code using HTTP (non-interactive, for backward compatibility)
   */
  async executeCode(code: string, packages?: string[]): Promise<ExecutionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/execute-python`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          packages: packages || []
        })
      });

      if (!response.ok) {
        // Handle HTTP errors
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          output: '',
          error: errorData.error || `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const result: ExecutionResult = await response.json();
      return result;

    } catch (error) {
      console.error('Python execution error:', error);

      if (error instanceof TypeError && error.message.includes('fetch')) {
        return {
          success: false,
          output: '',
          error: 'Cannot connect to Python execution server. Please ensure the backend server is running on port 3002.'
        };
      }

      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown execution error'
      };
    }
  }

  /**
   * Execute Python code using WebSocket (interactive, supports input())
   */
  async executeCodeInteractive(
    code: string,
    packages: string[] = [],
    callbacks: ExecutionCallbacks = {}
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      try {
        // Connect to WebSocket
        const ws = new WebSocket(this.wsUrl);
        this.ws = ws;

        let accumulatedOutput = '';
        let accumulatedError = '';
        const plots: string[] = [];
        let finalResult: ExecutionResult | null = null;

        ws.onopen = () => {
          console.log('WebSocket connected, sending execute command');
          // Send execution request
          ws.send(JSON.stringify({
            type: 'execute',
            code,
            packages
          }));
        };

        ws.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('WebSocket message:', message.type);

            switch (message.type) {
              case 'output':
                accumulatedOutput += message.data + '\n';
                if (callbacks.onOutput) {
                  callbacks.onOutput(message.data);
                }
                break;

              case 'error':
                accumulatedError += message.data + '\n';
                if (callbacks.onError) {
                  callbacks.onError(message.data);
                }
                break;

              case 'plot':
                plots.push(message.data);
                if (callbacks.onPlot) {
                  callbacks.onPlot(message.data);
                }
                break;

              case 'input_request':
                if (callbacks.onInputRequest) {
                  try {
                    const userInput = await callbacks.onInputRequest(message.prompt || 'Enter input:');
                    // Send input response back to server
                    ws.send(JSON.stringify({
                      type: 'input_response',
                      value: userInput
                    }));
                  } catch (error) {
                    console.error('Input request cancelled or failed:', error);
                    // Cancel execution
                    ws.send(JSON.stringify({ type: 'cancel' }));
                  }
                } else {
                  console.warn('Input requested but no callback provided');
                  ws.send(JSON.stringify({ type: 'cancel' }));
                }
                break;

              case 'completed':
                finalResult = {
                  success: message.exitCode === 0,
                  output: accumulatedOutput.trim(),
                  error: accumulatedError.trim() || undefined,
                  plots: plots.length > 0 ? plots : undefined
                };
                ws.close();
                break;

              case 'cancelled':
                finalResult = {
                  success: false,
                  output: accumulatedOutput.trim(),
                  error: 'Execution cancelled'
                };
                ws.close();
                break;

              default:
                console.warn('Unknown message type:', message.type);
            }
          } catch (error) {
            console.error('Error handling WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(new Error('WebSocket connection error'));
        };

        ws.onclose = () => {
          console.log('WebSocket closed');
          this.ws = null;

          if (finalResult) {
            resolve(finalResult);
          } else {
            // Connection closed without result
            reject(new Error('Connection closed before execution completed'));
          }
        };

      } catch (error) {
        console.error('Error setting up WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Cancel current execution
   */
  cancel(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'cancel' }));
    }
  }

  async reset(): Promise<void> {
    // Server-side execution is stateless, so reset is a no-op
    return Promise.resolve();
  }

  isReady(): boolean {
    // Server-side execution doesn't require initialization
    return true;
  }

  async initialize(): Promise<void> {
    // Server-side execution doesn't require initialization
    return Promise.resolve();
  }
}

// Global instance
export const serverPythonExecutor = new ServerPythonExecutor();