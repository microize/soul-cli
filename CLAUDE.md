# Soul CLI Development Context

## Project Overview
Soul CLI is a fork of Google's Gemini CLI - an open-source AI agent that brings Gemini's power directly into the terminal. This is a TypeScript/Node.js project with a React-based terminal UI.

## Repository Structure
```
soul-cli/
├── packages/
│   ├── cli/           # Main CLI application (terminal interface)
│   ├── core/          # Core business logic and AI interactions
│   ├── test-utils/    # Testing utilities
│   └── vscode-ide-companion/  # VS Code extension
├── docs/              # Comprehensive documentation
├── integration-tests/ # End-to-end tests
├── scripts/          # Build and utility scripts
└── bundle/           # Compiled output (generated)
```

## Development Commands

### Setup
```bash
npm ci                    # Install dependencies
npm run build            # Build all packages
npm run start            # Start development mode
```

### Testing
```bash
npm run test                          # Run all tests
npm run test:integration:all          # Integration tests
npm run test:e2e                      # End-to-end tests
npm run lint                          # ESLint
npm run typecheck                     # TypeScript checks
```

### Build & Bundle
```bash
npm run build:all       # Build everything (CLI, sandbox, VS Code)
npm run bundle          # Create production bundle
npm run prepare:package # Prepare for npm publish
```

## Key Technologies
- **Runtime**: Node.js 20+ (ES modules)
- **Language**: TypeScript
- **UI**: React + Ink (terminal rendering)
- **Testing**: Vitest
- **Build**: esbuild
- **Linting**: ESLint + Prettier

## Entry Points
- **CLI Entry**: `packages/cli/index.ts` → `packages/cli/src/gemini.tsx`
- **Core Library**: `packages/core/src/index.ts`
- **Binary**: `bundle/gemini.js` (after build)

## Architecture Overview

### CLI Package (`packages/cli/`)
- Terminal UI with React/Ink
- Command system (slash commands: `/help`, `/chat`, `/mcp`)
- Authentication flows (OAuth, API keys, Vertex AI)
- Settings and configuration management
- Themes and customization

### Core Package (`packages/core/`)
- Gemini API client and chat management
- Tool system (file ops, shell, web search, MCP servers)
- Content generation and token management
- Services: file discovery, git integration, telemetry
- Utilities: file search, error handling, retry logic

## Key Features
- **Multi-modal AI**: Text, images, PDFs with 1M token context
- **Built-in Tools**: File system operations, shell commands, web search
- **MCP Support**: Model Context Protocol for custom integrations
- **Authentication**: OAuth (free tier), API keys, Vertex AI enterprise
- **Advanced**: Checkpointing, memory management, sandboxing

## Development Notes
- Uses workspaces pattern (`npm workspaces`)
- Comprehensive test coverage with unit + integration tests
- Docker support for sandboxed execution
- Telemetry and usage tracking
- Cross-platform support (macOS, Linux, Windows)

## Important Files for Development
- `package.json`: Main package configuration and scripts
- `packages/cli/src/gemini.tsx`: Main CLI application entry
- `packages/core/src/tools/`: Tool implementations
- `packages/cli/src/ui/`: Terminal UI components
- `packages/cli/src/config/`: Configuration and settings
- `integration-tests/`: E2E test scenarios

## Environment Variables
- `GEMINI_API_KEY`: Gemini API key authentication
- `GOOGLE_API_KEY`: Vertex AI authentication
- `GOOGLE_CLOUD_PROJECT`: GCP project for Code Assist
- `DEBUG`: Enable debug logging
- `GEMINI_SANDBOX`: Sandbox mode (docker/podman/false)

## Common Development Tasks
1. **Adding new commands**: Create in `packages/cli/src/ui/commands/`
2. **Adding new tools**: Create in `packages/core/src/tools/`
3. **UI components**: Add to `packages/cli/src/ui/components/`
4. **Configuration**: Modify `packages/cli/src/config/`
5. **Tests**: Add unit tests alongside source files, integration tests in `integration-tests/`

## Build Output
- Development: `npm run start` (direct TypeScript execution)
- Production: `npm run bundle` creates optimized bundle in `bundle/`
- The bundled CLI is distributed as `@google/gemini-cli` on npm

## Customization & Extension Architecture

### Extension System
Gemini CLI provides a robust extension system for adding custom functionality:

#### Extension Structure
```
.gemini/extensions/your-extension/
├── gemini-extension.json    # Extension configuration
├── commands/               # Custom slash commands (TOML files)
│   ├── deploy.toml
│   └── advanced/
│       └── analyze.toml
├── GEMINI.md              # Context/memory files
└── mcp-server.js          # Custom MCP tool server
```

#### Extension Configuration (`gemini-extension.json`)
```json
{
  "name": "your-extension",
  "version": "1.0.0",
  "mcpServers": {
    "custom-tools": {
      "command": "node mcp-server.js"
    }
  },
  "contextFileName": ["GEMINI.md", "context.md"],
  "excludeTools": ["run_shell_command(rm -rf)"]
}
```

### System Prompt Customization
Multiple approaches for customizing the AI system prompt:

#### Environment Override (Recommended)
```bash
# Create custom system prompt
echo "Your custom prompt..." > ~/.gemini/system-prompt.md
export GEMINI_SYSTEM_MD="~/.gemini/system-prompt.md"
gemini
```

#### Direct Modification (Fork Required)
- Edit `packages/core/src/core/prompts.ts` → `getCoreSystemPrompt()` function
- Modify the base prompt string (lines 49-100+)

### Tool Integration Strategies

#### 1. MCP Server Approach (No Fork Required)
Create MCP-compliant tool servers:
```javascript
// custom-tools-server.js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const server = new Server({
  name: 'your-tools',
  version: '1.0.0'
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'advanced_analysis',
      description: 'Custom analysis tool',
      inputSchema: { /* tool schema */ }
    }
  ]
}));
```

#### 2. Direct Tool Registration (Fork Required)
Add tools to `packages/core/src/tools/tool-registry.ts`:
```typescript
// In ToolRegistry constructor
this.register(new YourCustomTool());
this.register(new AdvancedAnalysisTool());
```

### Command System Architecture

#### Built-in Commands
- Located in `packages/cli/src/ui/commands/`
- Loaded by `BuiltinCommandLoader`
- Examples: `/help`, `/settings`, `/theme`, `/mcp`

#### Custom Commands
- TOML files in `commands/` directories
- Loaded by `FileCommandLoader`
- Support argument processing and shell injection
- Conflict resolution with extension prefixing

#### Command Loading Order
1. Built-in commands (highest priority)
2. User commands (`~/.gemini/commands/`)
3. Project commands (`<project>/.gemini/commands/`)
4. Extension commands (lowest priority, auto-prefixed if conflicts)

### Service Architecture

Key service classes provide extensibility points:

#### Core Services (`packages/core/src/services/`)
- `FileDiscoveryService`: Intelligent file discovery
- `GitService`: Git repository operations
- `ShellExecutionService`: Safe shell command execution
- `ChatRecordingService`: Conversation persistence

#### CLI Services (`packages/cli/src/services/`)
- `CommandService`: Command discovery and execution
- `FileCommandLoader`: Custom command loading
- `McpPromptLoader`: MCP server prompt management

### Event System
Global event emitters for loose coupling:
- `appEvents`: Application-level events
- `updateEventEmitter`: Update and auto-update events

### Configuration Override Points

#### Settings Hierarchy
1. Environment variables (highest)
2. Project settings (`<project>/.gemini/settings.json`)
3. User settings (`~/.gemini/settings.json`)
4. Default settings (lowest)

#### Key Configuration Files
- `packages/cli/src/config/settings.ts`: Settings schema and loading
- `packages/cli/src/config/config.ts`: CLI argument parsing
- `packages/core/src/config/config.ts`: Core configuration types

## Customization Strategies

### For Custom CLI Development

#### Approach 1: Fork + Upstream Sync (Most Control)
```bash
# Setup
git clone https://github.com/microize/soul-cli.git your-custom-cli
cd your-custom-cli
git remote add upstream https://github.com/google-gemini/gemini-cli.git

# Regular updates
git fetch upstream
git merge upstream/main
```

#### Approach 2: Extension System (Recommended)
- Use extensions for tools and commands
- Environment variables for prompts
- MCP servers for complex integrations

#### Approach 3: Wrapper CLI (Clean Separation)
```typescript
// your-cli.ts
import { GeminiChat, ToolRegistry } from '@nightskyai/soul-cli-core';

class CustomCLI extends GeminiChat {
  // Override specific methods
}
```

#### Approach 4: Configuration-Driven
Define customizations via extensive configuration:
```yaml
# custom-config.yaml
prompt:
  system: "Custom system prompt..."
tools:
  - name: advanced-tool
    implementation: ./tools/advanced.ts
ui:
  theme: custom-theme
  branding: "Your CLI"
```

### Development Best Practices

#### For Extensions
- Use semantic versioning
- Include comprehensive documentation
- Test with multiple Gemini CLI versions
- Follow naming conventions to avoid conflicts

#### For Forks
- Maintain clear separation between custom and upstream code
- Document all modifications
- Regular upstream synchronization
- Comprehensive test coverage for custom features

#### For Tool Development
- Implement `BaseDeclarativeTool` interface
- Include proper error handling and validation
- Add comprehensive parameter schemas
- Support cancellation via AbortSignal

#### Version Management
- Pin Gemini CLI versions for stability
- Test updates in staging environments
- Maintain backward compatibility
- Use semantic versioning for custom components

## Package Creation and Publishing Learnings

### Systematic Package Renaming Strategy

When transforming a CLI package from one brand to another (e.g., Gemini CLI → Soul CLI), follow this systematic approach:

#### 1. Core Package Configuration
```bash
# Update package.json files in order:
1. Root package.json (name, bin, repository)
2. packages/core/package.json (name, dependencies) 
3. packages/cli/package.json (name, dependencies)
4. esbuild.config.js (outfile)
```

#### 2. Directory and File Constants
```typescript
// Update directory constants
export const SOUL_DIR = '.soul';           // was GEMINI_DIR = '.gemini'
export const DEFAULT_CONTEXT_FILENAME = 'SOUL.md';  // was 'GEMINI.md'

// Update function names consistently
export function setSoulMdFilename()         // was setGeminiMdFilename()
export function getAllSoulMdFilenames()    // was getAllGeminiMdFilenames()
```

#### 3. Import Reference Updates
Critical step: Update ALL import references across the codebase:
```typescript
// Find and replace all imports
import { setSoulMdFilename } from '@nightskyai/soul-cli-core';  // was @google/gemini-cli-core
```

Use systematic search to find all references:
```bash
grep -r "@google/gemini-cli" packages/
grep -r "GEMINI_DIR" packages/
grep -r "setGeminiMdFilename" packages/
```

#### 4. Type Definition Updates
Update string literal types in TypeScript:
```typescript
// History item types
type: 'soul' | 'soul_content'    // was 'gemini' | 'gemini_content'

// UI component checks
{item.type === 'soul' && (       // was item.type === 'gemini'
```

### Build Strategy: Bundle vs Package Approach

#### Bundle Approach (Recommended for CLI Distribution)
```bash
# Single file distribution
npm run bundle                   # Creates bundle/soul.js
node bundle/soul.js --help       # Works even if individual packages fail to build
```

**Advantages:**
- Self-contained executable
- Resolves dependency issues automatically
- Works even with some TypeScript errors in individual packages
- Faster distribution and installation

#### Individual Package Building
```bash
# Traditional workspace building
npm run build:packages          # Builds each package separately
```

**Challenges encountered:**
- TypeScript strict mode issues in test files
- Missing type definitions for some dependencies
- Import resolution across workspace packages
- Test-specific type errors don't affect main functionality

### NPM Publishing Setup

#### Package.json Configuration
```json
{
  "name": "@nightskyai/soul-cli",
  "version": "0.2.2",
  "private": false,              // Critical: must be false to publish
  "main": "bundle/soul.js",      // Point to bundle
  "bin": {
    "soul": "bundle/soul.js"     // CLI command mapping
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/nightskyai/soul-cli.git"
  },
  "files": [                     // What gets included in npm package
    "bundle/",
    "README.md", 
    "LICENSE"
  ]
}
```

#### Publishing Validation
```bash
# Always test before publishing
npm publish --dry-run

# Check package contents
npm pack --dry-run

# Verify functionality
node bundle/soul.js --version
```

### Common Pitfalls and Solutions

#### 1. Missing Function Exports
**Problem:** Build fails with "No matching export"
```typescript
// Error: setGeminiMdFilename not found
import { setGeminiMdFilename } from '../tools/memoryTool.js';
```

**Solution:** Update ALL references systematically
```typescript
// Fix: Update both import and usage
import { setSoulMdFilename } from '../tools/memoryTool.js';
expect(mockSetSoulMdFilename).toHaveBeenCalled();  // Update test mocks too
```

#### 2. Type System Inconsistencies
**Problem:** String literal types don't match
```typescript
// Error: 'gemini' not assignable to 'soul' | 'soul_content' | ...
type: 'gemini'
```

**Solution:** Update ALL type references, including:
- Type definitions
- Test files
- Component render conditions
- Switch statements

#### 3. Test Import Issues
**Problem:** Testing library imports fail
```typescript
import { waitFor } from '@testing-library/react';  // May not exist in some versions
```

**Solution:** Try alternative import sources
```typescript
import { waitFor } from '@testing-library/dom';     // Often works better
```

#### 4. Bundle vs Development Inconsistencies
**Problem:** Bundle works but development build fails

**Solution:** Focus on bundle for distribution, fix individual packages gradually
```bash
# Prioritize bundle functionality
npm run bundle && node bundle/soul.js --help

# Fix individual packages for development
npm run build  # Can have some failures and still work
```

### Publishing Checklist

- [ ] Package name updated (`@nightskyai/soul-cli`)
- [ ] Binary name updated (`soul`)
- [ ] Repository URL updated
- [ ] All import references updated
- [ ] Function names updated consistently
- [ ] Type definitions updated
- [ ] Bundle builds successfully
- [ ] CLI functionality tested
- [ ] `npm publish --dry-run` passes
- [ ] Documentation updated (README.md)
- [ ] Version number appropriate

### Key Lessons Learned

1. **Systematic Approach is Critical**: Don't skip any reference types - imports, exports, types, tests, documentation
2. **Bundle Strategy Works Best for CLIs**: Provides robust distribution even with some build issues
3. **Test Early and Often**: Verify functionality after each major change
4. **TypeScript Strictness vs Practicality**: Focus on core functionality first, fix type issues iteratively  
5. **Package Publishing is Complex**: Many moving parts - package.json, imports, builds, testing
6. **Documentation Matters**: Update README, help text, and examples consistently
7. **External Dependencies Must Be Declared**: When marking packages as `external` in esbuild, they MUST be added to package.json dependencies or the published package will fail at runtime with "Cannot find package" errors

### Critical Publishing Fix: External Dependencies

**Problem**: Published package fails with `ERR_MODULE_NOT_FOUND` when trying to import external dependencies.

**Root Cause**: When using esbuild with `external` packages (packages not bundled but imported at runtime), these packages must be listed in the package.json `dependencies` section.

**Solution**: 
```javascript
// esbuild.config.js
external: [
  '@google/genai',           // Marked as external (not bundled)
  '@modelcontextprotocol/sdk'
]

// package.json
"dependencies": {
  "@google/genai": "1.13.0",  // MUST be listed here!
  "@modelcontextprotocol/sdk": "^1.15.1"
}
```

**Key Learning**: External packages in bundlers need special handling:
- **Option 1**: Bundle them (remove from external) - larger bundle size but self-contained
- **Option 2**: Keep external but add as dependencies - smaller bundle but requires npm to install deps
- **Never**: Mark as external without adding to dependencies - will fail at runtime!

This systematic approach ensures a complete and functional package transformation while maintaining all original functionality.