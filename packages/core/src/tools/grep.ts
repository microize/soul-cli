/**
 * @license
 * Copyright 2025 Nightsky Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { spawn } from 'child_process';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolInvocation,
  ToolResult,
} from './tools.js';
import { Config } from '../config/config.js';

/**
 * Parameters for the GrepTool
 */
export interface GrepToolParams {
  /**
   * The regular expression pattern to search for in file contents
   */
  pattern: string;

  /**
   * File or directory to search in (rg PATH). Defaults to current working directory.
   */
  path?: string;

  /**
   * Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob
   */
  glob?: string;

  /**
   * Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), 
   * "files_with_matches" shows file paths (supports head_limit), 
   * "count" shows match counts (supports head_limit). 
   * Defaults to "files_with_matches".
   */
  output_mode?: 'content' | 'files_with_matches' | 'count';

  /**
   * Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.
   */
  '-B'?: number;

  /**
   * Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.
   */
  '-A'?: number;

  /**
   * Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.
   */
  '-C'?: number;

  /**
   * Show line numbers in output (rg -n). Requires output_mode: "content", ignored otherwise.
   */
  '-n'?: boolean;

  /**
   * Case insensitive search (rg -i)
   */
  '-i'?: boolean;

  /**
   * File type to search (rg --type). Common types: js, py, rust, go, java, etc. 
   * More efficient than glob for standard file types.
   */
  type?: string;

  /**
   * Limit output to first N lines/entries, equivalent to "| head -N". 
   * Works across all output modes: content (limits output lines), 
   * files_with_matches (limits file paths), count (limits count entries). 
   * When unspecified, shows all results from ripgrep.
   */
  head_limit?: number;

  /**
   * Enable multiline mode where . matches newlines and patterns can span lines 
   * (rg -U --multiline-dotall). Default: false.
   */
  multiline?: boolean;
}

class GrepToolInvocation extends BaseToolInvocation<GrepToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: GrepToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const mode = this.params.output_mode || 'files_with_matches';
    const action = mode === 'count' ? 'Counting matches' : 
                   mode === 'content' ? 'Searching content' : 
                   'Finding files';
    return `${action} for pattern: ${this.params.pattern}`;
  }

  private async executeRipgrep(): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const args: string[] = [];
      
      // Add pattern
      args.push(this.params.pattern);

      // Add path if specified
      if (this.params.path) {
        args.push(this.params.path);
      }

      // Handle output mode
      const mode = this.params.output_mode || 'files_with_matches';
      if (mode === 'files_with_matches') {
        args.push('--files-with-matches');
      } else if (mode === 'count') {
        args.push('--count');
      }
      // For 'content' mode, we don't add any special flag (default behavior)

      // Add other flags
      if (this.params['-i']) {
        args.push('-i');
      }

      if (this.params.multiline) {
        args.push('-U', '--multiline-dotall');
      }

      // Context lines (only for content mode)
      if (mode === 'content') {
        if (this.params['-C'] !== undefined) {
          args.push('-C', String(this.params['-C']));
        } else {
          if (this.params['-B'] !== undefined) {
            args.push('-B', String(this.params['-B']));
          }
          if (this.params['-A'] !== undefined) {
            args.push('-A', String(this.params['-A']));
          }
        }

        if (this.params['-n']) {
          args.push('-n');
        }
      }

      // File type filtering
      if (this.params.type) {
        args.push('--type', this.params.type);
      }

      // Glob pattern filtering
      if (this.params.glob) {
        args.push('--glob', this.params.glob);
      }

      // Try to execute ripgrep
      const child = spawn('rg', args, {
        cwd: this.config.getTargetDir(),
        windowsHide: true,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on('error', (err: Error) => {
        // Ripgrep not found, fallback to basic implementation
        resolve({
          stdout: '',
          stderr: `ripgrep not found: ${err.message}`,
          code: -1,
        });
      });

      child.on('close', (code: number | null) => {
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          code: code || 0,
        });
      });
    });
  }

  private async executeFallbackGrep(): Promise<string> {
    // Fallback to system grep if ripgrep is not available
    return new Promise((resolve, reject) => {
      const args: string[] = ['-r'];
      
      if (this.params['-i']) {
        args.push('-i');
      }

      if (this.params['-n'] || this.params.output_mode === 'content') {
        args.push('-n');
      }

      args.push(this.params.pattern);

      if (this.params.path) {
        args.push(this.params.path);
      } else {
        args.push('.');
      }

      const child = spawn('grep', args, {
        cwd: this.config.getTargetDir(),
        windowsHide: true,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on('error', () => {
        reject(new Error('Neither ripgrep nor system grep is available'));
      });

      child.on('close', (code: number | null) => {
        if (code === 0 || code === 1) {
          resolve(Buffer.concat(stdoutChunks).toString('utf8'));
        } else {
          reject(new Error(`grep failed with code ${code}`));
        }
      });
    });
  }

  async execute(): Promise<ToolResult> {
    try {
      // Try ripgrep first
      const result = await this.executeRipgrep();
      
      let output: string;
      let usesFallback = false;

      if (result.code === -1) {
        // Ripgrep not found, try fallback
        try {
          output = await this.executeFallbackGrep();
          usesFallback = true;
        } catch {
          return {
            llmContent: 'Error: Neither ripgrep nor grep is available. Please install ripgrep for best performance.',
            returnDisplay: 'Search tools not available',
          };
        }
      } else if (result.code === 0) {
        output = result.stdout;
      } else if (result.code === 1) {
        // No matches found
        output = '';
      } else {
        // Error occurred
        return {
          llmContent: `Error during search: ${result.stderr}`,
          returnDisplay: 'Search error',
        };
      }

      // Apply head_limit if specified
      if (this.params.head_limit && output) {
        const lines = output.split('\n').filter(line => line.trim());
        output = lines.slice(0, this.params.head_limit).join('\n');
      }

      // Format output based on mode
      const mode = this.params.output_mode || 'files_with_matches';
      
      if (!output || output.trim() === '') {
        return {
          llmContent: `No matches found for pattern "${this.params.pattern}"`,
          returnDisplay: 'No matches found',
        };
      }

      if (usesFallback && mode !== 'content') {
        // Fallback grep doesn't support all modes well
        const lines = output.split('\n').filter(line => line.trim());
        const files = new Set(lines.map(line => line.split(':')[0]));
        
        if (mode === 'files_with_matches') {
          output = Array.from(files).join('\n');
        } else if (mode === 'count') {
          const counts: Record<string, number> = {};
          lines.forEach(line => {
            const file = line.split(':')[0];
            counts[file] = (counts[file] || 0) + 1;
          });
          output = Object.entries(counts)
            .map(([file, count]) => `${file}:${count}`)
            .join('\n');
        }
      }

      let llmContent: string;
      let returnDisplay: string;

      if (mode === 'files_with_matches') {
        const files = output.split('\n').filter(f => f.trim());
        llmContent = files.length > 0 ? 
          `Found matches in ${files.length} file(s):\n${output}` :
          'No files with matches found';
        returnDisplay = `Found ${files.length} file(s) with matches`;
      } else if (mode === 'count') {
        const lines = output.split('\n').filter(l => l.trim());
        let totalMatches = 0;
        lines.forEach(line => {
          const parts = line.split(':');
          if (parts.length >= 2) {
            totalMatches += parseInt(parts[parts.length - 1], 10) || 0;
          }
        });
        llmContent = `Match counts by file:\n${output}\n\nTotal: ${totalMatches} matches`;
        returnDisplay = `Found ${totalMatches} total matches`;
      } else {
        // content mode
        const lines = output.split('\n').filter(l => l.trim());
        llmContent = `Found ${lines.length} matching line(s):\n${output}`;
        returnDisplay = `Found ${lines.length} matching line(s)`;
      }

      return {
        llmContent,
        returnDisplay,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error during search: ${errorMessage}`,
        returnDisplay: 'Search failed',
      };
    }
  }
}

/**
 * Implementation of the Grep tool
 */
export class GrepTool extends BaseDeclarativeTool<GrepToolParams, ToolResult> {
  static readonly Name = 'search_file_content';

  constructor(private readonly config: Config) {
    super(
      GrepTool.Name,
      'Grep',
      `A powerful search tool built on ripgrep

  Usage:
  - ALWAYS use Grep for search tasks. NEVER invoke \`grep\` or \`rg\` as a Bash command. The Grep tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\\\s+\\\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Use Task tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\\\{\\\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\\\{[\\\\s\\\\S]*?field\`, use \`multiline: true\``,
      Kind.Search,
      {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The regular expression pattern to search for in file contents',
          },
          path: {
            type: 'string',
            description: 'File or directory to search in (rg PATH). Defaults to current working directory.',
          },
          glob: {
            type: 'string',
            description: 'Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob',
          },
          output_mode: {
            type: 'string',
            enum: ['content', 'files_with_matches', 'count'],
            description: 'Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".',
          },
          '-B': {
            type: 'number',
            description: 'Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.',
          },
          '-A': {
            type: 'number',
            description: 'Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.',
          },
          '-C': {
            type: 'number',
            description: 'Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.',
          },
          '-n': {
            type: 'boolean',
            description: 'Show line numbers in output (rg -n). Requires output_mode: "content", ignored otherwise.',
          },
          '-i': {
            type: 'boolean',
            description: 'Case insensitive search (rg -i)',
          },
          type: {
            type: 'string',
            description: 'File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than glob for standard file types.',
          },
          head_limit: {
            type: 'number',
            description: 'Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). When unspecified, shows all results from ripgrep.',
          },
          multiline: {
            type: 'boolean',
            description: 'Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false.',
          },
        },
        required: ['pattern'],
      },
    );
  }

  protected override validateToolParamValues(params: GrepToolParams): string | null {
    // Validate pattern is not empty
    if (!params.pattern || params.pattern.trim() === '') {
      return 'Pattern cannot be empty';
    }

    // Validate path if provided
    if (params.path !== undefined && params.path.trim() === '') {
      return 'Path cannot be an empty string';
    }

    // Validate output_mode
    if (params.output_mode && !['content', 'files_with_matches', 'count'].includes(params.output_mode)) {
      return `Invalid output_mode: ${params.output_mode}`;
    }

    // Validate context parameters are positive
    if (params['-A'] !== undefined && params['-A'] < 0) {
      return '-A must be a non-negative number';
    }
    if (params['-B'] !== undefined && params['-B'] < 0) {
      return '-B must be a non-negative number';
    }
    if (params['-C'] !== undefined && params['-C'] < 0) {
      return '-C must be a non-negative number';
    }

    // Validate head_limit
    if (params.head_limit !== undefined && params.head_limit <= 0) {
      return 'head_limit must be a positive number';
    }

    return null;
  }

  protected createInvocation(
    params: GrepToolParams,
  ): ToolInvocation<GrepToolParams, ToolResult> {
    return new GrepToolInvocation(this.config, params);
  }
}