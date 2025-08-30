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
 * Parameters for the BashOutput tool
 */
export interface BashOutputToolParams {
  /**
   * The ID of the background shell to retrieve output from
   */
  bash_id: string;

  /**
   * Optional regular expression to filter the output lines
   */
  filter?: string;
}

class BashOutputToolInvocation extends BaseToolInvocation<
  BashOutputToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: BashOutputToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const filterDesc = this.params.filter ? ` (filter: ${this.params.filter})` : '';
    return `Retrieving output from ${this.params.bash_id}${filterDesc}`;
  }

  async execute(): Promise<ToolResult> {
    const service = BackgroundProcessService.getInstance();
    
    // Get new output from the process
    const result = service.getNewOutput(
      this.params.bash_id,
      'bash_output_tool', // Consumer ID
      this.params.filter
    );

    if (result.error) {
      return {
        llmContent: result.error,
        returnDisplay: result.error,
      };
    }

    // Format the output based on process status
    let llmContent = '';
    let returnDisplay = '';

    // Add header with process status
    const statusHeader = `[Shell ID: ${this.params.bash_id} - Status: ${result.status}]`;
    
    if (this.params.filter) {
      llmContent += `${statusHeader}\n[Filter: "${this.params.filter}"]\n`;
    } else {
      llmContent += `${statusHeader}\n`;
    }

    // Add output lines
    if (result.output.length > 0) {
      llmContent += result.output.join('\n');
      returnDisplay = `Retrieved ${result.output.length} new line(s) from ${this.params.bash_id}`;
    } else {
      llmContent += '(no new output)';
      returnDisplay = `No new output from ${this.params.bash_id}`;
    }

    // Add process completion information
    if (result.status === 'completed') {
      const exitInfo = result.exitCode !== null ? 
        `Exit Code: ${result.exitCode}` : 
        'Terminated by signal';
      llmContent += `\n\nProcess Status: Completed (${exitInfo})`;
    } else if (result.status === 'failed') {
      llmContent += '\n\nProcess Status: Failed';
    } else if (result.status === 'running') {
      llmContent += '\n\nProcess Status: Running';
    }

    // Add filter summary if applicable
    if (this.params.filter && result.output.length > 0) {
      returnDisplay += ` (filtered)`;
    }

    return {
      llmContent,
      returnDisplay,
    };
  }
}

/**
 * Implementation of the BashOutput tool
 */
export class BashOutputTool extends BaseDeclarativeTool<
  BashOutputToolParams,
  ToolResult
> {
  static readonly Name = 'bash_output';

  constructor(private readonly config: Config) {
    super(
      BashOutputTool.Name,
      'BashOutput',
      `
- Retrieves output from a running or completed background bash shell
- Takes a shell_id parameter identifying the shell
- Always returns only new output since the last check
- Returns stdout and stderr output along with shell status
- Supports optional regex filtering to show only lines matching a pattern
- Use this tool when you need to monitor or check the output of a long-running shell
- Shell IDs can be found using the /bashes command
`,
      Kind.Read,
      {
        type: 'object',
        properties: {
          bash_id: {
            type: 'string',
            description: 'The ID of the background shell to retrieve output from',
          },
          filter: {
            type: 'string',
            description: 'Optional regular expression to filter the output lines. Only lines matching this regex will be included in the result. Any lines that do not match will no longer be available to read.',
          },
        },
        required: ['bash_id'],
      },
    );
  }

  protected override validateToolParamValues(
    params: BashOutputToolParams,
  ): string | null {
    if (!params.bash_id || params.bash_id.trim() === '') {
      return 'The bash_id parameter cannot be empty.';
    }

    // Validate regex if provided
    if (params.filter) {
      try {
        new RegExp(params.filter);
      } catch (e) {
        return `Invalid regular expression in filter: ${params.filter}`;
      }
    }

    return null;
  }

  protected createInvocation(
    params: BashOutputToolParams,
  ): ToolInvocation<BashOutputToolParams, ToolResult> {
    return new BashOutputToolInvocation(this.config, params);
  }
}