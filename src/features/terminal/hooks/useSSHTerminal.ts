import { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SocketService } from '@/infrastructure/socket/SocketService';
import type { 
  LoginCredentials, 
  ConnectionStage
} from '@/shared/types';
import { 
  ConnectionError,
  AuthenticationError 
} from '@/shared/types';

interface UseSSHTerminalReturn {
  // State
  stage: ConnectionStage;
  error: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  
  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  disconnect: () => void;
  reset: () => void;
  
  // Terminal setup
  setupTerminal: (container: HTMLElement) => void;
  terminal: Terminal | null;
}

export function useSSHTerminal(): UseSSHTerminalReturn {
  const [stage, setStage] = useState<ConnectionStage>('login');
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef<SocketService | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);

  // Initialize socket service
  useEffect(() => {
    // Prefer env-configured server URL when provided; otherwise rely on same-origin
    // via Vite proxy (dev) or same-origin (prod).
    const configuredUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env)
      ? ((import.meta as any).env.VITE_SERVER_URL as string | undefined)
      : undefined;

    const serverUrl = configuredUrl && configuredUrl.trim().length > 0 ? configuredUrl : undefined;
    socketRef.current = new SocketService(serverUrl);
    
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    setStage('login');
    setError(null);
    setIsConnecting(false);
    setIsConnected(false);
    
    // Clean up socket
    socketRef.current?.disconnect();
    
    // Clean up event listeners
    cleanupFunctionsRef.current.forEach(cleanup => cleanup());
    cleanupFunctionsRef.current = [];
    
    // Reset terminal
    if (terminalRef.current) {
      terminalRef.current.clear();
      showWelcomeMessage();
    }
  }, []);

  const showWelcomeMessage = useCallback(() => {
    if (!terminalRef.current) return;
    
    const welcomeMsg = `\r\n\r\n` +
      ` ▄▄▄·▄• ▄▌ ▐ ▄  ▄▄ •      ▄▄·        ▐ ▄ .▄▄ ·       ▄▄▌  ▄▄▄ . \r\n` +
      `▐█ ▄██▪██▌•█▌▐█▐█ ▀ ▪    ▐█ ▌▪▪     •█▌▐█▐█ ▀. ▪     ██•  ▀▄.▀· \r\n` +
      ` ██▀·█▌▐█▌▐█▐▐▌▄█ ▀█▄    ██ ▄▄ ▄█▀▄ ▐█▐▐▌▄▀▀▀█▄ ▄█▀▄ ██▪  ▐▀▀▪▄ \r\n` +
      `▐█▪·•▐█▄█▌██▐█▌▐█▄▪▐█    ▐███▌▐█▌.▐▌██▐█▌▐█▄▪▐█▐█▌.▐▌▐█▌▐▌▐█▄▄▌ \r\n` +
      `.▀    ▀▀▀ ▀▀ █▪·▀▀▀▀     ·▀▀▀  ▀█▄▀▪▀▀ █▪ ▀▀▀▀  ▀█▄▀▪.▀▀▀  ▀▀▀  \r\n` +
      `SSH Terminal - React TypeScript Edition\r\n` +
      `Please wait for the connection to SSH Server.\r\n\r\n` +
      ` `;
    
    terminalRef.current.write(welcomeMsg);
  }, []);

  const setupSocketEventHandlers = useCallback(() => {
    if (!socketRef.current) return;

    // Output handler
    const outputCleanup = socketRef.current.onOutput((data: string) => {
      terminalRef.current?.write(data);
    });
    cleanupFunctionsRef.current.push(outputCleanup);

    // Disconnect handler
    const disconnectCleanup = socketRef.current.onDisconnect(() => {
      if (terminalRef.current && stage === 'connected') {
        terminalRef.current.write('\r\n[Connection lost - Disconnected]\r\n');
      }
      setStage('disconnected');
      setIsConnected(false);
      setTimeout(() => {
        reset();
      }, 2000);
    });
    cleanupFunctionsRef.current.push(disconnectCleanup);

    // Error handler
    const errorCleanup = socketRef.current.onError((errorMsg: string) => {
      setError(errorMsg);
      setStage('error');
      setIsConnecting(false);
      setIsConnected(false);
      if (terminalRef.current) {
        terminalRef.current.write(`\r\nError: ${errorMsg}\r\n`);
      }
    });
    cleanupFunctionsRef.current.push(errorCleanup);

    // Reconnect handlers
    const reconnectCleanup = socketRef.current.onReconnect(() => {
      if (terminalRef.current) {
        terminalRef.current.write('\r\n[Reconnected]\r\n');
      }
      setIsConnected(true);
      setStage('connected');
    });
    cleanupFunctionsRef.current.push(reconnectCleanup);

    const reconnectErrorCleanup = socketRef.current.onReconnectError((error: Error) => {
      if (terminalRef.current) {
        terminalRef.current.write(`\r\n[Reconnection failed: ${error.message}]\r\n`);
      }
    });
    cleanupFunctionsRef.current.push(reconnectErrorCleanup);
  }, [stage, reset]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    if (!socketRef.current) {
      throw new Error('Socket service not initialized');
    }

    setIsConnecting(true);
    setError(null);
    setStage('connecting');

    try {
      await socketRef.current.login(credentials);
      
      // Setup socket event handlers after successful login
      setupSocketEventHandlers();
      
      setStage('connected');
      setIsConnected(true);
      setIsConnecting(false);
      
      if (terminalRef.current) {
        terminalRef.current.write('\r\n[Connected - SSH session established]\r\n');
        
        // Fit terminal after connection
        if (fitAddonRef.current) {
          setTimeout(() => {
            fitAddonRef.current?.fit();
            if (socketRef.current && terminalRef.current) {
              socketRef.current.resize({
                cols: terminalRef.current.cols,
                rows: terminalRef.current.rows
              });
            }
          }, 100);
        }
      }
      
    } catch (err) {
      setIsConnecting(false);
      setIsConnected(false);
      
      let errorMessage = 'Login failed';
      let newStage: ConnectionStage = 'error';
      
      if (err instanceof AuthenticationError) {
        errorMessage = `Authentication failed: ${err.message}`;
        newStage = 'login';
      } else if (err instanceof ConnectionError) {
        errorMessage = `Connection failed: ${err.message}`;
        newStage = 'error';
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setStage(newStage);
      
      if (terminalRef.current) {
        terminalRef.current.write(`\r\nLogin failed: ${errorMessage}\r\n`);
      }
      
      throw new Error(errorMessage);
    }
  }, [setupSocketEventHandlers]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    setStage('disconnected');
    setIsConnected(false);
    
    if (terminalRef.current) {
      terminalRef.current.write('\r\n[Disconnected by user]\r\n');
    }
    
    setTimeout(() => {
      reset();
    }, 1500);
  }, [reset]);

  const setupTerminal = useCallback((container: HTMLElement) => {
    // Clean up existing terminal
    if (terminalRef.current) {
      terminalRef.current.dispose();
    }

    // Create new terminal
    const terminal = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1a1a1a',
        foreground: '#ffffff',
        cursor: '#ffffff'
      },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      allowTransparency: true
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Initial fit and show welcome (defer to ensure DOM is ready)
    const doInitialFit = () => {
      try {
        if (container.isConnected && container.offsetWidth > 0 && container.offsetHeight > 0) {
          fitAddon.fit();
        } else {
          // Try again shortly if dimensions are not ready yet
          setTimeout(doInitialFit, 16);
          return;
        }
      } catch (e) {
        // Avoid crashing the app if fit fails in edge cases
        console.warn('Terminal initial fit failed, retrying shortly...', e);
        setTimeout(doInitialFit, 16);
        return;
      }
      showWelcomeMessage();
    };

    if ('requestAnimationFrame' in window) {
      requestAnimationFrame(() => doInitialFit());
    } else {
      setTimeout(doInitialFit, 0);
    }

    // Handle terminal input
    terminal.onData((data: string) => {
      if (stage === 'connected' && socketRef.current?.isConnected()) {
        socketRef.current.sendInput(data);
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      if (stage === 'connected' && socketRef.current?.isConnected()) {
        socketRef.current.resize({
          cols: terminal.cols,
          rows: terminal.rows
        });
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [stage, showWelcomeMessage]);

  return {
    stage,
    error,
    isConnecting,
    isConnected,
    login,
    disconnect,
    reset,
    setupTerminal,
    terminal: terminalRef.current
  };
}
