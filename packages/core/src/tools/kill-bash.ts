/**
 * @license
 * Copyright 2025 Nightsky Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolInvocation,
  ToolResult,
} from './tools.js';
import { Config } from '../config/config.js';
import { BackgroundProcessService } from '../services/backgroundProcessService.js';

/**
 * Parameters for the KillBash tool
 */
export interface KillBashToolParams {
  /**
   * The ID of the background shell to terminate
   */
  bash_id: string;
}

class KillBashToolInvocation extends BaseToolInvocation<
  KillBashToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: KillBashToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Terminating background process ${this.params.bash_id}`;
  }

  async execute(): Promise<ToolResult> {
    const service = BackgroundProcessService.getInstance();
    
    // Get process info before killing
    const process = service.getProcess(this.params.bash_id);
    if (!process) {
      return {
        llmContent: `[Shell ID: ${this.params.bash_id}]
Process not found
  - Error: No background process exists with this ID
  - Suggestion: Use /bashes command to list active processes

Termination Status: Failed (Not Found)`,
        returnDisplay: `Process ${this.params.bash_id} not found`,
      };
    }

    // Kill the process with detailed result
    const result = await service.killProcess(this.params.bash_id);

    if (result.success) {
      const llmContent = `[Shell ID: ${this.params.bash_id}]
${result.message}

Termination Status: Success`;

      return {
        llmContent,
        returnDisplay: `Process ${this.params.bash_id} terminated successfully`,
      };
    } else {
      // Handle different failure scenarios
      let statusLine = 'Termination Status: ';
      
      if (result.exitCode !== undefined) {
        statusLine += 'Not Needed (Already Completed)';
      } else if (process.status === 'terminated') {
        statusLine += 'Not Needed (Already Terminated)';
      } else {
        statusLine += 'Failed';
      }

      const llmContent = `[Shell ID: ${this.params.bash_id}]
${result.message}

${statusLine}`;

      return {
        llmContent,
        returnDisplay: result.message.split('\n')[0], // First line as display
      };
    }
  }
}

/**
 * Implementation of the KillBash tool
 */
export class KillBashTool extends BaseDeclarativeTool<
  KillBashToolParams,
  ToolResult
> {
  static readonly Name = 'kill_bash';

  constructor(private readonly config: Config) {
    super(
      KillBashTool.Name,
      'KillBash',
      `
- Kills a running background bash shell by its ID
- Takes a shell_id parameter identifying the shell to kill
- Returns a success or failure status 
- Use this tool when you need to terminate a long-running shell
- Shell IDs can be found using the /bashes command
`,
      Kind.Execute,
      {
        type: 'object',
        properties: {
          bash_id: {
            type: 'string',
            description: 'The ID of the background shell to kill',
          },
        },
        required: ['bash_id'],
      },
    );
  }

  protected override validateToolParamValues(
    params: KillBashToolParams,
  ): string | null {
    if (!params.bash_id || params.bash_id.trim() === '') {
      return 'The bash_id parameter cannot be empty.';
    }

    return null;
  }

  protected createInvocation(
    params: KillBashToolParams,
  ): ToolInvocation<KillBashToolParams, ToolResult> {
    return new KillBashToolInvocation(this.config, params);
  }
}