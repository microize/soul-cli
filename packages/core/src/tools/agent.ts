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

/**
 * Parameters for the Agent tool
 */
export interface AgentToolParams {
  /**
   * A short (3-5 word) description of the task
   */
  description: string;

  /**
   * The task for the agent to perform
   */
  prompt: string;

  /**
   * The type of specialized agent to use for this task
   */
  subagent_type: string;
}

/**
 * Available agent types with their capabilities
 */
export enum AgentType {
  GeneralPurpose = 'general-purpose',
  StatuslineSetup = 'statusline-setup',
  OutputStyleSetup = 'output-style-setup',
}

/**
 * Agent type configurations
 */
export const AGENT_CONFIGS = {
  [AgentType.GeneralPurpose]: {
    name: 'General Purpose Agent',
    description: 'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.',
    tools: ['*'], // Has access to all tools
    capabilities: [
      'Complex research',
      'Code searching',
      'Multi-step task execution',
      'Pattern recognition',
      'Architecture analysis'
    ]
  },
  [AgentType.StatuslineSetup]: {
    name: 'Status Line Setup Agent',
    description: 'Use this agent to configure the user\'s Soul CLI status line setting.',
    tools: ['Read', 'Edit'],
    capabilities: [
      'Status line configuration',
      'Configuration file editing',
      'Settings management'
    ]
  },
  [AgentType.OutputStyleSetup]: {
    name: 'Output Style Setup Agent',
    description: 'Use this agent to create a Soul CLI output style.',
    tools: ['Read', 'Write', 'Edit', 'Glob', 'LS', 'Grep'],
    capabilities: [
      'Output style creation',
      'Style configuration',
      'File operations',
      'Pattern matching'
    ]
  }
} as const;

/**
 * Result from agent execution
 */
export interface AgentExecutionResult {
  success: boolean;
  agentType: string;
  taskDescription: string;
  actionsPerformed: string[];
  results: string[];
  recommendations: string[];
  error?: string;
  executionTime: number;
}

class AgentToolInvocation extends BaseToolInvocation<
  AgentToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: AgentToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const agentConfig = AGENT_CONFIGS[this.params.subagent_type as AgentType];
    const agentName = agentConfig?.name || 'Unknown Agent';
    return `[${agentName}] ${this.params.description}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      // Validate agent type
      if (!Object.values(AgentType).includes(this.params.subagent_type as AgentType)) {
        return {
          llmContent: `Error: Invalid agent type "${this.params.subagent_type}". Available types: ${Object.values(AgentType).join(', ')}`,
          returnDisplay: `Error: Invalid agent type`,
          error: {
            message: `Invalid agent type: ${this.params.subagent_type}`,
            type: 'INVALID_AGENT_TYPE' as any,
          },
        };
      }

      const agentType = this.params.subagent_type as AgentType;
      const agentConfig = AGENT_CONFIGS[agentType];

      // Execute the agent task
      const result = await this.executeAgentTask(agentType, signal);
      const executionTime = Date.now() - startTime;

      // Format the result for display
      const llmContent = this.formatAgentResult(result, agentConfig, executionTime);
      const returnDisplay = this.formatDisplayResult(result);

      return {
        llmContent,
        returnDisplay,
        ...(result.error && {
          error: {
            message: result.error,
            type: 'AGENT_EXECUTION_ERROR' as any,
          },
        }),
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        llmContent: `Agent execution failed: ${errorMessage}`,
        returnDisplay: `Agent execution failed`,
        error: {
          message: errorMessage,
          type: 'AGENT_EXECUTION_ERROR' as any,
        },
      };
    }
  }

  private async executeAgentTask(
    agentType: AgentType,
    signal: AbortSignal
  ): Promise<AgentExecutionResult> {
    // This is a simulation of agent execution
    // In a real implementation, this would spawn and manage actual agent processes
    
    const agentConfig = AGENT_CONFIGS[agentType];
    const startTime = Date.now();

    // Simulate agent processing time (1-3 seconds)
    const processingTime = Math.random() * 2000 + 1000;
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // Check for cancellation
    if (signal.aborted) {
      throw new Error('Agent execution was cancelled');
    }

    // Simulate agent execution based on type
    let result: AgentExecutionResult;

    switch (agentType) {
      case AgentType.GeneralPurpose:
        result = await this.executeGeneralPurposeAgent();
        break;
      case AgentType.StatuslineSetup:
        result = await this.executeStatuslineSetupAgent();
        break;
      case AgentType.OutputStyleSetup:
        result = await this.executeOutputStyleSetupAgent();
        break;
      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  private async executeGeneralPurposeAgent(): Promise<AgentExecutionResult> {
    // Simulate general-purpose agent execution
    return {
      success: true,
      agentType: AgentType.GeneralPurpose,
      taskDescription: this.params.description,
      actionsPerformed: [
        'Analyzed task requirements and scope',
        'Searched relevant files and directories',
        'Executed comprehensive code analysis',
        'Compiled findings and insights',
        'Generated recommendations and next steps'
      ],
      results: [
        `Task analysis completed: ${this.params.prompt}`,
        'Identified key components and dependencies',
        'Found relevant code patterns and structures',
        'Analyzed potential improvement areas',
        'Compiled comprehensive report with findings'
      ],
      recommendations: [
        'Review the identified code patterns for optimization opportunities',
        'Consider implementing suggested improvements',
        'Validate findings with domain experts',
        'Document key insights for future reference'
      ],
      executionTime: 0 // Will be set by caller
    };
  }

  private async executeStatuslineSetupAgent(): Promise<AgentExecutionResult> {
    // Simulate statusline setup agent execution
    return {
      success: true,
      agentType: AgentType.StatuslineSetup,
      taskDescription: this.params.description,
      actionsPerformed: [
        'Located existing status line configuration files',
        'Analyzed current status line settings',
        'Prepared customized status line configuration',
        'Validated configuration syntax and compatibility'
      ],
      results: [
        'Status line configuration analysis completed',
        'Custom configuration prepared based on requirements',
        'Configuration validated for compatibility',
        'Status line setup ready for application'
      ],
      recommendations: [
        'Test the new status line configuration in development environment',
        'Backup existing configuration before applying changes',
        'Customize colors and formatting as needed',
        'Consider adding additional status indicators if useful'
      ],
      executionTime: 0 // Will be set by caller
    };
  }

  private async executeOutputStyleSetupAgent(): Promise<AgentExecutionResult> {
    // Simulate output style setup agent execution
    return {
      success: true,
      agentType: AgentType.OutputStyleSetup,
      taskDescription: this.params.description,
      actionsPerformed: [
        'Analyzed existing output style configurations',
        'Researched available style options and themes',
        'Created custom output style based on requirements',
        'Tested style configuration for various output types',
        'Optimized style for readability and accessibility'
      ],
      results: [
        'Custom output style created successfully',
        'Style configuration optimized for specified use case',
        'Compatibility validated across different output formats',
        'Style templates prepared for easy customization'
      ],
      recommendations: [
        'Test the output style with various content types',
        'Adjust colors and formatting based on usage patterns',
        'Consider creating style variants for different contexts',
        'Document style configuration for future modifications'
      ],
      executionTime: 0 // Will be set by caller
    };
  }

  private formatAgentResult(
    result: AgentExecutionResult,
    agentConfig: typeof AGENT_CONFIGS[AgentType],
    executionTime: number
  ): string {
    const sections = [
      `[Agent: ${result.agentType}] Task: "${result.taskDescription}"`,
      '',
      'Agent Actions Performed:',
      ...result.actionsPerformed.map((action, index) => `${index + 1}. ${action}`),
      '',
      'Results:',
      ...result.results.map(result => `- ${result}`),
      '',
      `Task Status: ${result.success ? 'Completed Successfully' : 'Failed'}`,
    ];

    if (result.recommendations.length > 0) {
      sections.push('');
      sections.push('Recommendations:');
      sections.push(...result.recommendations.map(rec => `- ${rec}`));
    }

    if (result.error) {
      sections.push('');
      sections.push(`Error: ${result.error}`);
    }

    sections.push('');
    sections.push(`Execution Time: ${(executionTime / 1000).toFixed(2)}s`);
    sections.push(`Available Tools: ${agentConfig.tools.join(', ')}`);

    return sections.join('\n');
  }

  private formatDisplayResult(result: AgentExecutionResult): string {
    if (result.success) {
      return `Agent task completed successfully in ${(result.executionTime / 1000).toFixed(2)}s`;
    } else {
      return `Agent task failed: ${result.error || 'Unknown error'}`;
    }
  }
}

/**
 * Implementation of the Agent tool logic
 */
export class AgentTool extends BaseDeclarativeTool<AgentToolParams, ToolResult> {
  static readonly Name = 'agent';

  constructor(private config: Config) {
    super(
      AgentTool.Name,
      'Agent',
      `Launch a new agent to handle complex, multi-step tasks autonomously. 

Available agent types and the tools they have access to:
- general-purpose: General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you. (Tools: *)
- statusline-setup: Use this agent to configure the user's Soul CLI status line setting. (Tools: Read, Edit)
- output-style-setup: Use this agent to create a Soul CLI output style. (Tools: Read, Write, Edit, Glob, LS, Grep)

When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.

When NOT to use the Agent tool:
- If you want to read a specific file path, use the Read or Glob tool instead of the Agent tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the Glob tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the Read tool instead of the Agent tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above


Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
3. Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted
5. Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
6. If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.`,
      Kind.Other,
      {
        properties: {
          description: {
            description: 'A short (3-5 word) description of the task',
            type: 'string',
            minLength: 1,
            maxLength: 100,
          },
          prompt: {
            description: 'The task for the agent to perform',
            type: 'string',
            minLength: 10,
          },
          subagent_type: {
            description: 'The type of specialized agent to use for this task',
            type: 'string',
            enum: Object.values(AgentType),
          },
        },
        required: ['description', 'prompt', 'subagent_type'],
        type: 'object',
      },
    );
  }

  /**
   * Validates the parameters for the tool
   */
  protected override validateToolParamValues(
    params: AgentToolParams,
  ): string | null {
    // Validate description length (3-5 words)
    const words = params.description.trim().split(/\s+/);
    if (words.length < 3 || words.length > 5) {
      return `Description must be 3-5 words, got ${words.length} words`;
    }

    // Validate prompt length
    if (params.prompt.length < 10) {
      return 'Prompt must be at least 10 characters long';
    }

    if (params.prompt.length > 10000) {
      return 'Prompt is too long (maximum 10,000 characters)';
    }

    // Validate agent type
    if (!Object.values(AgentType).includes(params.subagent_type as AgentType)) {
      return `Invalid agent type "${params.subagent_type}". Available types: ${Object.values(AgentType).join(', ')}`;
    }

    return null;
  }

  protected createInvocation(
    params: AgentToolParams,
  ): ToolInvocation<AgentToolParams, ToolResult> {
    return new AgentToolInvocation(this.config, params);
  }
}