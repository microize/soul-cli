/**
 * @license
 * Copyright 2025 Nightsky Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolInvocation,
  ToolResult,
} from './tools.js';

/**
 * Parameters for the TodoWrite tool
 */
export interface TodoWriteParams {
  /**
   * The updated todo list
   */
  todos: TodoItem[];
}

/**
 * Represents a single todo item
 */
export interface TodoItem {
  /**
   * The imperative form describing what needs to be done (e.g., "Run tests", "Build the project")
   */
  content: string;

  /**
   * Current status: pending, in_progress, or completed
   */
  status: 'pending' | 'in_progress' | 'completed';

  /**
   * The present continuous form shown during execution (e.g., "Running tests", "Building the project")
   */
  activeForm: string;
}

/**
 * Global todo list storage (in-memory for session persistence)
 */
let globalTodoList: TodoItem[] = [];

/**
 * Get checkbox for display
 */
function getCheckbox(status: TodoItem['status']): string {
  switch (status) {
    case 'completed':
      return '☑';
    case 'in_progress':
      return '☐';
    case 'pending':
      return '☐';
    default:
      return '☐';
  }
}

/**
 * Format the todo list for display
 */
function formatTodoList(todos: TodoItem[]): string {
  if (todos.length === 0) {
    return 'Todo list is empty.';
  }

  const lines: string[] = ['Current Status:'];

  todos.forEach((todo, index) => {
    const isLast = index === todos.length - 1;
    const prefix = isLast ? '└──' : '├──';
    const checkbox = getCheckbox(todo.status);
    const text = todo.status === 'in_progress' ? todo.activeForm : todo.content;
    lines.push(`${prefix} ${checkbox} ${text}`);
  });

  return lines.join('\n');
}

/**
 * Validate todo list rules
 */
function validateTodoList(todos: TodoItem[]): string | null {
  // Check for exactly one in_progress task
  const inProgressTasks = todos.filter(t => t.status === 'in_progress');
  if (inProgressTasks.length > 1) {
    return 'Only one task can be in_progress at a time';
  }

  // Check for empty content or activeForm
  for (const todo of todos) {
    if (!todo.content || todo.content.trim() === '') {
      return 'Task content cannot be empty';
    }
    if (!todo.activeForm || todo.activeForm.trim() === '') {
      return 'Task activeForm cannot be empty';
    }
  }

  // Check for valid status values
  for (const todo of todos) {
    if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
      return `Invalid status '${todo.status}' - must be pending, in_progress, or completed`;
    }
  }

  return null;
}

class TodoWriteInvocation extends BaseToolInvocation<TodoWriteParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: TodoWriteParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const { todos } = this.params;
    const action = todos.length === 0 ? 'Clearing' : 'Updating';
    return `${action} todo list (${todos.length} items)`;
  }

  async execute(): Promise<ToolResult> {
    const { todos } = this.params;

    // Validate the todo list
    const validationError = validateTodoList(todos);
    if (validationError) {
      return {
        llmContent: `Error: ${validationError}`,
        returnDisplay: `❌ Todo list validation failed: ${validationError}`,
        error: {
          message: validationError,
          type: 'INVALID_TOOL_PARAMS' as any,
        },
      };
    }

    // Calculate changes
    const oldList = [...globalTodoList];
    const added: TodoItem[] = [];
    const updated: TodoItem[] = [];
    const removed: TodoItem[] = [];

    // Find added and updated items
    for (const newTodo of todos) {
      const oldTodo = oldList.find(t => t.content === newTodo.content);
      if (!oldTodo) {
        added.push(newTodo);
      } else if (oldTodo.status !== newTodo.status) {
        updated.push(newTodo);
      }
    }

    // Find removed items
    for (const oldTodo of oldList) {
      if (!todos.find(t => t.content === oldTodo.content)) {
        removed.push(oldTodo);
      }
    }

    // Update the global list
    globalTodoList = [...todos];

    // Format the output
    const formattedList = formatTodoList(todos);
    
    // Create change summary
    const changes: string[] = [];
    if (added.length > 0) {
      changes.push(`Added ${added.length} task(s)`);
    }
    if (updated.length > 0) {
      const statusChanges = updated.map(t => {
        const oldStatus = oldList.find(o => o.content === t.content)?.status;
        return `"${t.content}" (${oldStatus} → ${t.status})`;
      });
      changes.push(`Updated: ${statusChanges.join(', ')}`);
    }
    if (removed.length > 0) {
      changes.push(`Removed ${removed.length} task(s)`);
    }

    const changeSummary = changes.length > 0 ? 
      `\nChanges: ${changes.join('; ')}` : 
      '\nNo changes made';

    const llmContent = `Todo List Updated Successfully\n\n${formattedList}${changeSummary}`;
    const returnDisplay = `✅ Todo List Updated\n\n${formattedList}`;

    return {
      llmContent,
      returnDisplay,
    };
  }
}

/**
 * Implementation of the TodoWrite tool
 */
export class TodoWriteTool extends BaseDeclarativeTool<TodoWriteParams, ToolResult> {
  static readonly Name: string = 'todo_write';

  constructor(private config: Config) {
    super(
      TodoWriteTool.Name,
      'TodoWrite',
      `Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool
Use this tool proactively in these scenarios:

1. Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
3. User explicitly requests todo list - When the user directly asks you to use the todo list
4. User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
5. After receiving new instructions - Immediately capture user requirements as todos
6. When you start working on a task - Mark it as in_progress BEFORE beginning work. Ideally you should only have one todo as in_progress at a time
7. After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool

Skip using this tool when:
1. There is only a single, straightforward task
2. The task is trivial and tracking it provides no organizational benefit
3. The task can be completed in less than 3 trivial steps
4. The task is purely conversational or informational

NOTE that you should not use this tool if there is only one trivial task to do. In this case you are better off just doing the task directly.

## Task States and Management

1. **Task States**: Use these states to track progress:
   - pending: Task not yet started
   - in_progress: Currently working on (limit to ONE task at a time)
   - completed: Task finished successfully

   **IMPORTANT**: Task descriptions must have two forms:
   - content: The imperative form describing what needs to be done (e.g., "Run tests", "Build the project")
   - activeForm: The present continuous form shown during execution (e.g., "Running tests", "Building the project")

2. **Task Management**:
   - Update task status in real-time as you work
   - Mark tasks complete IMMEDIATELY after finishing (don't batch completions)
   - Exactly ONE task must be in_progress at any time (not less, not more)
   - Complete current tasks before starting new ones
   - Remove tasks that are no longer relevant from the list entirely

3. **Task Completion Requirements**:
   - ONLY mark a task as completed when you have FULLY accomplished it
   - If you encounter errors, blockers, or cannot finish, keep the task as in_progress
   - When blocked, create a new task describing what needs to be resolved
   - Never mark a task as completed if:
     - Tests are failing
     - Implementation is partial
     - You encountered unresolved errors
     - You couldn't find necessary files or dependencies

4. **Task Breakdown**:
   - Create specific, actionable items
   - Break complex tasks into smaller, manageable steps
   - Use clear, descriptive task names
   - Always provide both forms:
     - content: "Fix authentication bug"
     - activeForm: "Fixing authentication bug"

When in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.`,
      Kind.Other,
      {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: 'The updated todo list',
            items: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'The imperative form describing what needs to be done',
                  minLength: 1,
                },
                status: {
                  type: 'string',
                  enum: ['pending', 'in_progress', 'completed'],
                  description: 'Current status of the task',
                },
                activeForm: {
                  type: 'string',
                  description: 'The present continuous form shown during execution',
                  minLength: 1,
                },
              },
              required: ['content', 'status', 'activeForm'],
            },
          },
        },
        required: ['todos'],
      },
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(params: TodoWriteParams): string | null {
    const { todos } = params;

    // Validate todo list structure
    if (!Array.isArray(todos)) {
      return 'todos must be an array';
    }

    // Validate each todo item
    for (let i = 0; i < todos.length; i++) {
      const todo = todos[i];
      
      if (!todo.content || typeof todo.content !== 'string') {
        return `Todo at index ${i} must have a valid content string`;
      }
      
      if (!todo.activeForm || typeof todo.activeForm !== 'string') {
        return `Todo at index ${i} must have a valid activeForm string`;
      }
      
      if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
        return `Todo at index ${i} has invalid status: ${todo.status}`;
      }
    }

    // Apply business rules validation
    return validateTodoList(todos);
  }

  protected createInvocation(
    params: TodoWriteParams,
  ): ToolInvocation<TodoWriteParams, ToolResult> {
    return new TodoWriteInvocation(this.config, params);
  }
}

/**
 * Get the current todo list (for external access if needed)
 */
export function getCurrentTodoList(): TodoItem[] {
  return [...globalTodoList];
}

/**
 * Clear the todo list (for reset purposes)
 */
export function clearTodoList(): void {
  globalTodoList = [];
}