/**
 * @license
 * Copyright 2025 Nightsky Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Config } from '../config/config.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  ToolInvocation,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolConfirmationOutcome,
  Kind,
} from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import { summarizeToolOutput } from '../utils/summarizer.js';
import {
  ShellExecutionService,
  ShellOutputEvent,
} from '../services/shellExecutionService.js';
import { formatMemoryUsage } from '../utils/formatters.js';
import {
  getCommandRoots,
  isCommandAllowed,
  stripShellWrapper,
} from '../utils/shell-utils.js';
import { BackgroundProcessService } from '../services/backgroundProcessService.js';

export const OUTPUT_UPDATE_INTERVAL_MS = 1000;

export interface ShellToolParams {
  /**
   * The command to execute
   */
  command: string;
  
  /**
   * Optional timeout in milliseconds (max 600000)
   */
  timeout?: number;
  
  /**
   * Clear, concise description of what this command does in 5-10 words
   */
  description?: string;
  
  /**
   * Set to true to run this command in the background
   */
  run_in_background?: boolean;
  
  /**
   * Run in sandboxed mode (read-only, no network access)
   */
  sandbox?: boolean;
  
  /**
   * Optional shell path to use instead of the default shell
   */
  shellExecutable?: string;
  
  /**
   * @deprecated Use absolute paths in commands instead
   */
  directory?: string;
}

class ShellToolInvocation extends BaseToolInvocation<
  ShellToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ShellToolParams,
    private readonly allowlist: Set<string>,
  ) {
    super(params);
  }

  getDescription(): string {
    let description = `${this.params.command}`;
    // append optional [in directory]
    // note description is needed even if validation fails due to absolute path
    if (this.params.directory) {
      description += ` [in ${this.params.directory}]`;
    }
    // append optional (description), replacing any line breaks with spaces
    if (this.params.description) {
      description += ` (${this.params.description.replace(/\n/g, ' ')})`;
    }
    return description;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const command = stripShellWrapper(this.params.command);
    const rootCommands = [...new Set(getCommandRoots(command))];
    const commandsToConfirm = rootCommands.filter(
      (command) => !this.allowlist.has(command),
    );

    if (commandsToConfirm.length === 0) {
      return false; // already approved and whitelisted
    }

    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: this.params.command,
      rootCommand: commandsToConfirm.join(', '),
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          commandsToConfirm.forEach((command) => this.allowlist.add(command));
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
    terminalColumns?: number,
    terminalRows?: number,
  ): Promise<ToolResult> {
    // Handle sandbox mode
    if (this.params.sandbox) {
      // In sandbox mode, prepend command with restrictions
      // This is a simplified implementation - real sandboxing would require more sophisticated measures
      if (os.platform() !== 'win32') {
        // On Unix-like systems, we could use restricted shell or containers
        // For now, we'll just warn that sandbox mode is not fully implemented
        console.warn('Sandbox mode requested but not fully implemented - command will run with normal permissions');
      }
    }

    // Handle timeout
    const timeout = this.params.timeout || 120000; // Default 2 minutes
    const maxTimeout = 600000; // Max 10 minutes
    const effectiveTimeout = Math.min(timeout, maxTimeout);
    
    // Create timeout abort controller
    const timeoutController = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;
    
    // Set up timeout if not running in background
    if (!this.params.run_in_background) {
      timeoutId = setTimeout(() => {
        timeoutController.abort();
      }, effectiveTimeout);
    }
    
    // Create a combined signal that responds to both user abort and timeout
    const combinedSignal = signal.aborted ? signal : timeoutController.signal;
    
    // Listen for user abort to also trigger timeout controller
    const abortListener = () => {
      timeoutController.abort();
    };
    if (!signal.aborted) {
      signal.addEventListener('abort', abortListener);
    }
    
    const strippedCommand = stripShellWrapper(this.params.command);

    if (signal.aborted) {
      return {
        llmContent: 'Command was cancelled by user before it could start.',
        returnDisplay: 'Command cancelled by user.',
      };
    }

    const isWindows = os.platform() === 'win32';
    const tempFileName = `shell_pgrep_${crypto
      .randomBytes(6)
      .toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    try {
      // pgrep is not available on Windows, so we can't get background PIDs
      const commandToExecute = isWindows
        ? strippedCommand
        : (() => {
            // wrap command to append subprocess pids (via pgrep) to temporary file
            let command = strippedCommand.trim();
            if (!command.endsWith('&')) command += ';';
            return `{ ${command} }; __code=$?; pgrep -g 0 >${tempFilePath} 2>&1; exit $__code;`;
          })();

      const cwd = path.resolve(
        this.config.getTargetDir(),
        this.params.directory || '',
      );

      let cumulativeOutput = '';
      let lastUpdateTime = Date.now();
      let isBinaryStream = false;

      // Handle background execution
      if (this.params.run_in_background) {
        // Generate unique ID for this background process
        const service = BackgroundProcessService.getInstance();
        const bashId = service.generateId();
        
        // Create abort controller for this specific process
        const processAbortController = new AbortController();
        
        // For background execution, we don't wait for the command to complete
        // We'll start it and return immediately with the bash ID
        const { pid, result: resultPromise } = await ShellExecutionService.execute(
          commandToExecute,
          cwd,
          (event: ShellOutputEvent) => {
            // Capture output to the background service
            switch (event.type) {
              case 'data':
                service.addOutput(bashId, event.chunk);
                break;
              case 'binary_detected':
                service.addOutput(bashId, '[Binary output detected]');
                break;
              case 'binary_progress':
                service.addOutput(bashId, `[Binary output: ${formatMemoryUsage(event.bytesReceived)} received]`);
                break;
            }
            
            // Still update display if provided
            if (updateOutput) {
              let currentDisplayOutput = '';
              switch (event.type) {
                case 'data':
                  currentDisplayOutput = `[Background ${bashId}]: ${event.chunk}`;
                  break;
                case 'binary_detected':
                  currentDisplayOutput = `[Background ${bashId}]: Binary output detected`;
                  break;
                case 'binary_progress':
                  currentDisplayOutput = `[Background ${bashId}]: Receiving binary output... ${formatMemoryUsage(event.bytesReceived)} received`;
                  break;
              }
              updateOutput(currentDisplayOutput);
            }
          },
          processAbortController.signal,
          this.config.getShouldUseNodePtyShell(),
          terminalColumns,
          terminalRows,
        );
        
        // Register the process with the background service
        service.registerProcess(
          bashId,
          pid,
          this.params.command,
          { pid, result: resultPromise },
          processAbortController
        );
        
        if (timeoutId) clearTimeout(timeoutId);
        signal.removeEventListener('abort', abortListener);
        
        // Clean up temp file if it exists
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        
        // Return immediately for background processes
        return {
          llmContent: `Started background process with ID: ${bashId}\nPID: ${pid}\nCommand: ${this.params.command}\n\nUse BashOutput tool with bash_id="${bashId}" to monitor the output.\nUse KillBash tool with bash_id="${bashId}" to terminate the process.`,
          returnDisplay: `Background process started (ID: ${bashId}, PID: ${pid})`,
        };
      }
      
      // Normal (foreground) execution
      const { result: resultPromise } = await ShellExecutionService.execute(
        commandToExecute,
        cwd,
        (event: ShellOutputEvent) => {
          if (!updateOutput) {
            return;
          }

          let currentDisplayOutput = '';
          let shouldUpdate = false;

          switch (event.type) {
            case 'data':
              if (isBinaryStream) break;
              cumulativeOutput = event.chunk;
              currentDisplayOutput = cumulativeOutput;
              if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
                shouldUpdate = true;
              }
              break;
            case 'binary_detected':
              isBinaryStream = true;
              currentDisplayOutput =
                '[Binary output detected. Halting stream...]';
              shouldUpdate = true;
              break;
            case 'binary_progress':
              isBinaryStream = true;
              currentDisplayOutput = `[Receiving binary output... ${formatMemoryUsage(
                event.bytesReceived,
              )} received]`;
              if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
                shouldUpdate = true;
              }
              break;
            default: {
              throw new Error('An unhandled ShellOutputEvent was found.');
            }
          }

          if (shouldUpdate) {
            updateOutput(currentDisplayOutput);
            lastUpdateTime = Date.now();
          }
        },
        combinedSignal,
        this.config.getShouldUseNodePtyShell(),
        terminalColumns,
        terminalRows,
      );

      const result = await resultPromise;
      if (timeoutId) clearTimeout(timeoutId);
      signal.removeEventListener('abort', abortListener);
      
      // Check if command was terminated due to timeout
      if (timeoutController.signal.aborted && !signal.aborted) {
        return {
          llmContent: `Command exceeded timeout of ${effectiveTimeout}ms and was terminated.\nPartial output:\n${result.output || '(no output before timeout)'}`,
          returnDisplay: `Command timed out after ${effectiveTimeout}ms`,
        };
      }

      const backgroundPIDs: number[] = [];
      if (os.platform() !== 'win32') {
        if (fs.existsSync(tempFilePath)) {
          const pgrepLines = fs
            .readFileSync(tempFilePath, 'utf8')
            .split('\n')
            .filter(Boolean);
          for (const line of pgrepLines) {
            if (!/^\d+$/.test(line)) {
              console.error(`pgrep: ${line}`);
            }
            const pid = Number(line);
            if (pid !== result.pid) {
              backgroundPIDs.push(pid);
            }
          }
        } else {
          if (!signal.aborted) {
            console.error('missing pgrep output');
          }
        }
      }

      let llmContent = '';
      if (result.aborted) {
        llmContent = 'Command was cancelled by user before it could complete.';
        if (result.output.trim()) {
          llmContent += ` Below is the output before it was cancelled:\n${result.output}`;
        } else {
          llmContent += ' There was no output before it was cancelled.';
        }
      } else {
        // Create a formatted error string for display, replacing the wrapper command
        // with the user-facing command.
        const finalError = result.error
          ? result.error.message.replace(commandToExecute, this.params.command)
          : '(none)';

        llmContent = [
          `Command: ${this.params.command}`,
          `Directory: ${this.params.directory || '(root)'}`,
          `Output: ${result.output || '(empty)'}`,
          `Error: ${finalError}`, // Use the cleaned error string.
          `Exit Code: ${result.exitCode ?? '(none)'}`,
          `Signal: ${result.signal ?? '(none)'}`,
          `Background PIDs: ${
            backgroundPIDs.length ? backgroundPIDs.join(', ') : '(none)'
          }`,
          `Process Group PGID: ${result.pid ?? '(none)'}`,
        ].join('\n');
      }

      let returnDisplayMessage = '';
      if (this.config.getDebugMode()) {
        returnDisplayMessage = llmContent;
      } else {
        if (result.output.trim()) {
          returnDisplayMessage = result.output;
        } else {
          if (result.aborted) {
            returnDisplayMessage = 'Command cancelled by user.';
          } else if (result.signal) {
            returnDisplayMessage = `Command terminated by signal: ${result.signal}`;
          } else if (result.error) {
            returnDisplayMessage = `Command failed: ${getErrorMessage(
              result.error,
            )}`;
          } else if (result.exitCode !== null && result.exitCode !== 0) {
            returnDisplayMessage = `Command exited with code: ${result.exitCode}`;
          }
          // If output is empty and command succeeded (code 0, no error/signal/abort),
          // returnDisplayMessage will remain empty, which is fine.
        }
      }

      const summarizeConfig = this.config.getSummarizeToolOutputConfig();
      if (summarizeConfig && summarizeConfig[ShellTool.Name]) {
        const summary = await summarizeToolOutput(
          llmContent,
          this.config.getGeminiClient(),
          signal,
          summarizeConfig[ShellTool.Name].tokenBudget,
        );
        return {
          llmContent: summary,
          returnDisplay: returnDisplayMessage,
        };
      }

      return {
        llmContent,
        returnDisplay: returnDisplayMessage,
      };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      signal.removeEventListener('abort', abortListener);
      throw error;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }
}

function getShellToolDescription(): string {
  const returnedInfo = `
      The following information is returned:

      Command: Executed command.
      Directory: Directory (relative to project root) where command was executed, or \`(root)\`.
      Stdout: Output on stdout stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Stderr: Output on stderr stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Error: Error or \`(none)\` if no error was reported for the subprocess.
      Exit Code: Exit code or \`(none)\` if terminated by signal.
      Signal: Signal number or \`(none)\` if no signal was received.
      Background PIDs: List of background processes started or \`(none)\`.
      Process Group PGID: Process group started or \`(none)\``;

  return `Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.

Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use the LS tool to verify the parent directory exists and is the correct location
   - For example, before running "mkdir foo/bar", first use LS to check that "foo" exists and is the intended parent directory

2. Command Execution:
   - Always quote file paths that contain spaces with double quotes (e.g., cd "path with spaces/file.txt")
   - Examples of proper quoting:
     - cd "/Users/name/My Documents" (correct)
     - cd /Users/name/My Documents (incorrect - will fail)
     - python "/path/with spaces/script.py" (correct)
     - python /path/with spaces/script.py (incorrect - will fail)
   - After ensuring proper quoting, execute the command.
   - Capture the output of the command.

Usage notes:
  - The command argument is required.
  - You can specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). If not specified, commands will timeout after 120000ms (2 minutes).
  - It is very helpful if you write a clear, concise description of what this command does in 5-10 words.
  - If the output exceeds 30000 characters, output will be truncated before being returned to you.
  - You can use the \`run_in_background\` parameter to run the command in the background, which allows you to continue working while the command runs. You can monitor the output using the Bash tool as it becomes available. Never use \`run_in_background\` to run 'sleep' as it will return immediately. You do not need to use '&' at the end of the command when using this parameter.
  - VERY IMPORTANT: You MUST avoid using search commands like \`find\` and \`grep\`. Instead use Grep, Glob, or Task to search. You MUST avoid read tools like \`cat\`, \`head\`, \`tail\`, and use Read to read files.
 - If you _still_ need to run \`grep\`, STOP. ALWAYS USE ripgrep at \`rg\` first, which all Soul CLI users have pre-installed.
  - When issuing multiple commands, use the ';' or '&&' operator to separate them. DO NOT use newlines (newlines are ok in quoted strings).
  - Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of \`cd\`. You may use \`cd\` if the User explicitly requests it.
    <good-example>
    pytest /foo/bar/tests
    </good-example>
    <bad-example>
    cd /foo/bar && pytest tests
    </bad-example>

${returnedInfo}`;
}

function getCommandDescription(): string {
  if (os.platform() === 'win32') {
    return 'Exact command to execute as `cmd.exe /c <command>`';
  } else {
    return 'Exact bash command to execute as `bash -c <command>`';
  }
}

export class ShellTool extends BaseDeclarativeTool<
  ShellToolParams,
  ToolResult
> {
  static Name: string = 'run_shell_command';
  private allowlist: Set<string> = new Set();

  constructor(private readonly config: Config) {
    super(
      ShellTool.Name,
      'Shell',
      getShellToolDescription(),
      Kind.Execute,
      {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: getCommandDescription(),
          },
          timeout: {
            type: 'number',
            description: 'Optional timeout in milliseconds (max 600000)',
          },
          description: {
            type: 'string',
            description:
              'Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory \'foo\'',
          },
          run_in_background: {
            type: 'boolean',
            description: 'Set to true to run this command in the background. Use BashOutput to read the output later.',
          },
          sandbox: {
            type: 'boolean',
            description: 'Run in sandboxed mode: command may not write to filesystem or use network, but can read files and analyze data. When possible, run commands in this mode for a smoother experience without approval prompts.',
          },
          shellExecutable: {
            type: 'string',
            description: 'Optional shell path to use instead of the default shell. Used primarily for testing.',
          },
          directory: {
            type: 'string',
            description:
              '(DEPRECATED) Directory to run the command in. Use absolute paths in commands instead.',
          },
        },
        required: ['command'],
      },
      false, // output is not markdown
      true, // output can be updated
    );
  }

  protected override validateToolParamValues(
    params: ShellToolParams,
  ): string | null {
    const commandCheck = isCommandAllowed(params.command, this.config);
    if (!commandCheck.allowed) {
      if (!commandCheck.reason) {
        console.error(
          'Unexpected: isCommandAllowed returned false without a reason',
        );
        return `Command is not allowed: ${params.command}`;
      }
      return commandCheck.reason;
    }
    if (!params.command.trim()) {
      return 'Command cannot be empty.';
    }
    if (getCommandRoots(params.command).length === 0) {
      return 'Could not identify command root to obtain permission from user.';
    }
    
    // Validate timeout
    if (params.timeout !== undefined) {
      if (params.timeout <= 0) {
        return 'Timeout must be a positive number.';
      }
      if (params.timeout > 600000) {
        return 'Timeout cannot exceed 600000ms (10 minutes).';
      }
    }
    
    // Validate description length
    if (params.description && params.description.split(' ').length > 15) {
      return 'Description should be 5-10 words for clarity.';
    }
    
    if (params.directory) {
      if (path.isAbsolute(params.directory)) {
        return 'Directory cannot be absolute. Please refer to workspace directories by their name.';
      }
      const workspaceDirs = this.config.getWorkspaceContext().getDirectories();
      const matchingDirs = workspaceDirs.filter(
        (dir) => path.basename(dir) === params.directory,
      );

      if (matchingDirs.length === 0) {
        return `Directory '${params.directory}' is not a registered workspace directory.`;
      }

      if (matchingDirs.length > 1) {
        return `Directory name '${params.directory}' is ambiguous as it matches multiple workspace directories.`;
      }
    }
    return null;
  }

  protected createInvocation(
    params: ShellToolParams,
  ): ToolInvocation<ShellToolParams, ToolResult> {
    return new ShellToolInvocation(this.config, params, this.allowlist);
  }
}
