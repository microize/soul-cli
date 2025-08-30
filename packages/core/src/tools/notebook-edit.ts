/**
 * @license
 * Copyright 2025 Nightsky Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { Config } from '../config/config.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolInvocation,
  ToolLocation,
  ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';

/**
 * Parameters for the NotebookEdit tool
 */
export interface NotebookEditParams {
  /**
   * The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)
   */
  notebook_path: string;

  /**
   * The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified.
   */
  cell_id?: string;

  /**
   * The new source for the cell
   */
  new_source: string;

  /**
   * The type of the cell (code or markdown). If not specified, it defaults to the current cell type. If using edit_mode=insert, this is required.
   */
  cell_type?: 'code' | 'markdown';

  /**
   * The type of edit to make (replace, insert, delete). Defaults to replace.
   */
  edit_mode?: 'replace' | 'insert' | 'delete';
}

/**
 * Represents a cell in a Jupyter notebook
 */
interface NotebookCell {
  id?: string;
  cell_type: 'code' | 'markdown' | 'raw';
  metadata?: Record<string, unknown>;
  source: string | string[];
  outputs?: unknown[];
  execution_count?: number | null;
}

/**
 * Represents the structure of a Jupyter notebook
 */
interface NotebookDocument {
  nbformat: number;
  nbformat_minor: number;
  metadata: Record<string, unknown>;
  cells: NotebookCell[];
}

/**
 * Generate a unique cell ID
 */
function generateCellId(): string {
  // Generate a random ID for the cell
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Parse and validate a notebook file
 */
function parseNotebook(content: string): NotebookDocument {
  let notebook: unknown;
  try {
    notebook = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in notebook file: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Validate notebook structure
  if (!notebook || typeof notebook !== 'object') {
    throw new Error('Notebook file does not contain a valid object');
  }

  const nb = notebook as Record<string, unknown>;
  
  if (typeof nb['nbformat'] !== 'number' || typeof nb['nbformat_minor'] !== 'number') {
    throw new Error('Invalid notebook format: missing nbformat or nbformat_minor');
  }

  if (!Array.isArray(nb['cells'])) {
    throw new Error('Invalid notebook format: cells must be an array');
  }

  // Validate each cell
  const cells = nb['cells'] as unknown[];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell || typeof cell !== 'object') {
      throw new Error(`Invalid cell at index ${i}: cell must be an object`);
    }
    
    const c = cell as Record<string, unknown>;
    if (!['code', 'markdown', 'raw'].includes(c['cell_type'] as string)) {
      throw new Error(`Invalid cell type at index ${i}: ${c['cell_type']}`);
    }

    // Ensure source is present
    if (c['source'] === undefined) {
      c['source'] = '';
    }
  }

  return {
    nbformat: nb['nbformat'] as number,
    nbformat_minor: nb['nbformat_minor'] as number,
    metadata: (nb['metadata'] || {}) as Record<string, unknown>,
    cells: nb['cells'] as NotebookCell[],
  } as NotebookDocument;
}

/**
 * Find a cell by its ID
 */
function findCellById(notebook: NotebookDocument, cellId: string): number {
  for (let i = 0; i < notebook.cells.length; i++) {
    if (notebook.cells[i].id === cellId) {
      return i;
    }
  }
  return -1;
}

/**
 * Normalize source to array format
 */
function normalizeSource(source: string | string[]): string[] {
  if (typeof source === 'string') {
    // Split by newlines but preserve the newlines at the end of each line
    if (source === '') return [];
    const lines = source.split('\n');
    return lines.map((line, index) => 
      index === lines.length - 1 && line === '' ? line : line + '\n'
    ).filter((_, index) => !(index === lines.length - 1 && lines[index] === ''));
  }
  return source;
}


class NotebookEditInvocation extends BaseToolInvocation<NotebookEditParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: NotebookEditParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const relativePath = makeRelative(
      this.params.notebook_path,
      this.config.getTargetDir(),
    );
    const mode = this.params.edit_mode || 'replace';
    const action = mode === 'insert' ? 'Insert cell in' : 
                   mode === 'delete' ? 'Delete cell from' : 
                   'Edit cell in';
    return `${action} ${shortenPath(relativePath)}`;
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.notebook_path }];
  }

  async execute(): Promise<ToolResult> {
    const { notebook_path, cell_id, new_source, cell_type, edit_mode = 'replace' } = this.params;
    
    try {
      // Read the notebook file
      const fileService = this.config.getFileSystemService();
      let content: string;
      
      try {
        content = await fileService.readTextFile(notebook_path);
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          return {
            llmContent: `Error: Notebook file not found at ${notebook_path}`,
            returnDisplay: `Notebook file not found: ${notebook_path}`,
            error: {
              message: `Notebook file not found at ${notebook_path}`,
              type: ToolErrorType.FILE_NOT_FOUND,
            },
          };
        }
        throw error;
      }

      // Parse the notebook
      let notebook: NotebookDocument;
      try {
        notebook = parseNotebook(content);
      } catch (error) {
        return {
          llmContent: `Error: Failed to parse notebook - ${error instanceof Error ? error.message : String(error)}`,
          returnDisplay: `Failed to parse notebook: ${error instanceof Error ? error.message : String(error)}`,
          error: {
            message: error instanceof Error ? error.message : String(error),
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }

      let message: string;
      
      if (edit_mode === 'insert') {
        // Insert mode: add a new cell
        if (!cell_type) {
          return {
            llmContent: 'Error: cell_type is required when using edit_mode=insert',
            returnDisplay: 'cell_type is required for insert mode',
            error: {
              message: 'cell_type is required when using edit_mode=insert',
              type: ToolErrorType.INVALID_TOOL_PARAMS,
            },
          };
        }

        const newCell: NotebookCell = {
          id: generateCellId(),
          cell_type: cell_type,
          metadata: {},
          source: normalizeSource(new_source),
        };

        if (cell_type === 'code') {
          newCell.outputs = [];
          newCell.execution_count = null;
        }

        if (cell_id) {
          // Insert after the specified cell
          const index = findCellById(notebook, cell_id);
          if (index === -1) {
            return {
              llmContent: `Error: Cell with ID '${cell_id}' not found in notebook`,
              returnDisplay: `Cell ID '${cell_id}' not found`,
              error: {
                message: `Cell with ID '${cell_id}' not found`,
                type: ToolErrorType.INVALID_TOOL_PARAMS,
              },
            };
          }
          notebook.cells.splice(index + 1, 0, newCell);
          message = `Inserted new ${cell_type} cell after cell '${cell_id}' (position ${index + 2}/${notebook.cells.length})`;
        } else {
          // Insert at the beginning
          notebook.cells.unshift(newCell);
          message = `Inserted new ${cell_type} cell at the beginning of the notebook`;
        }
        
      } else if (edit_mode === 'delete') {
        // Delete mode: remove a cell
        if (!cell_id) {
          return {
            llmContent: 'Error: cell_id is required when using edit_mode=delete',
            returnDisplay: 'cell_id is required for delete mode',
            error: {
              message: 'cell_id is required when using edit_mode=delete',
              type: ToolErrorType.INVALID_TOOL_PARAMS,
            },
          };
        }

        const index = findCellById(notebook, cell_id);
        if (index === -1) {
          return {
            llmContent: `Error: Cell with ID '${cell_id}' not found in notebook`,
            returnDisplay: `Cell ID '${cell_id}' not found`,
            error: {
              message: `Cell with ID '${cell_id}' not found`,
              type: ToolErrorType.INVALID_TOOL_PARAMS,
            },
          };
        }

        const deletedCell = notebook.cells[index];
        notebook.cells.splice(index, 1);
        message = `Deleted ${deletedCell.cell_type} cell '${cell_id}' at position ${index + 1}`;
        
      } else {
        // Replace mode: update existing cell
        if (!cell_id) {
          return {
            llmContent: 'Error: cell_id is required when using edit_mode=replace',
            returnDisplay: 'cell_id is required for replace mode',
            error: {
              message: 'cell_id is required when using edit_mode=replace',
              type: ToolErrorType.INVALID_TOOL_PARAMS,
            },
          };
        }

        const index = findCellById(notebook, cell_id);
        if (index === -1) {
          return {
            llmContent: `Error: Cell with ID '${cell_id}' not found in notebook`,
            returnDisplay: `Cell ID '${cell_id}' not found`,
            error: {
              message: `Cell with ID '${cell_id}' not found`,
              type: ToolErrorType.INVALID_TOOL_PARAMS,
            },
          };
        }

        const cell = notebook.cells[index];
        
        // Update the cell
        cell.source = normalizeSource(new_source);
        
        // If cell_type is specified and different, change the type
        if (cell_type && cell_type !== cell.cell_type && (cell_type === 'code' || cell_type === 'markdown')) {
          cell.cell_type = cell_type;
          
          // Add/remove code-specific fields
          if (cell_type === 'code') {
            if (!cell.outputs) cell.outputs = [];
            if (!cell.execution_count) cell.execution_count = null;
          } else {
            delete cell.outputs;
            delete cell.execution_count;
          }
        }
        
        message = `Updated ${cell.cell_type} cell '${cell_id}' at position ${index + 1}/${notebook.cells.length}`;
      }

      // Write the modified notebook back
      const updatedContent = JSON.stringify(notebook, null, 2) + '\n';
      await fileService.writeTextFile(notebook_path, updatedContent);

      const relativePath = makeRelative(notebook_path, this.config.getTargetDir());
      
      return {
        llmContent: `Successfully modified notebook: ${message}`,
        returnDisplay: `✓ ${message}\n  File: ${relativePath}\n  Total cells: ${notebook.cells.length}`,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error editing notebook: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

/**
 * Implementation of the NotebookEdit tool
 */
export class NotebookEditTool extends BaseDeclarativeTool<NotebookEditParams, ToolResult> {
  static readonly Name: string = 'notebook_edit';

  constructor(private config: Config) {
    super(
      NotebookEditTool.Name,
      'NotebookEdit',
      `Completely replaces the contents of a specific cell in a Jupyter notebook (.ipynb file) with new source. Jupyter notebooks are interactive documents that combine code, text, and visualizations, commonly used for data analysis and scientific computing. The notebook_path parameter must be an absolute path, not a relative path. The cell_number is 0-indexed. Use edit_mode=insert to add a new cell at the index specified by cell_number. Use edit_mode=delete to delete the cell at the index specified by cell_number.`,
      Kind.WritePlain,
      {
        type: 'object',
        properties: {
          notebook_path: {
            type: 'string',
            description: 'The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)',
          },
          cell_id: {
            type: 'string',
            description: 'The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified.',
          },
          new_source: {
            type: 'string',
            description: 'The new source for the cell',
          },
          cell_type: {
            type: 'string',
            enum: ['code', 'markdown'],
            description: 'The type of the cell (code or markdown). If not specified, it defaults to the current cell type. If using edit_mode=insert, this is required.',
          },
          edit_mode: {
            type: 'string',
            enum: ['replace', 'insert', 'delete'],
            description: 'The type of edit to make (replace, insert, delete). Defaults to replace.',
          },
        },
        required: ['notebook_path', 'new_source'],
      },
    );
  }

  protected override validateToolParamValues(params: NotebookEditParams): string | null {
    const { notebook_path, cell_id, cell_type, edit_mode = 'replace' } = params;

    // Validate absolute path
    if (!path.isAbsolute(notebook_path)) {
      return `Notebook path must be absolute, but was relative: ${notebook_path}`;
    }

    // Validate file extension
    if (!notebook_path.endsWith('.ipynb')) {
      return `File must be a Jupyter notebook (.ipynb), but was: ${notebook_path}`;
    }

    // Validate workspace boundaries
    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(notebook_path)) {
      const directories = workspaceContext.getDirectories();
      return `Notebook path must be within one of the workspace directories: ${directories.join(', ')}`;
    }

    // Mode-specific validation
    if (edit_mode === 'insert' && !cell_type) {
      return 'cell_type is required when using edit_mode=insert';
    }

    if (edit_mode === 'delete' && !cell_id) {
      return 'cell_id is required when using edit_mode=delete';
    }

    if (edit_mode === 'replace' && !cell_id) {
      return 'cell_id is required when using edit_mode=replace';
    }

    return null;
  }

  protected createInvocation(
    params: NotebookEditParams,
  ): ToolInvocation<NotebookEditParams, ToolResult> {
    return new NotebookEditInvocation(this.config, params);
  }
}