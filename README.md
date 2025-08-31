# Soul CLI
Soul CLI is an enhanced AI agent built on Google's Gemini CLI foundation. It brings the power of Gemini directly into your terminal with additional features and customizations for advanced development workflows.

## Why Soul CLI?

- **Free tier**: 60 requests/min and 1,000 requests/day with personal Google account
- **Powerful Gemini 2.5 Pro**: Access to 1M token context window
- **Enhanced tools**: Advanced file operations, shell commands, web fetching, and custom agent system
- **Extensible**: MCP (Model Context Protocol) support for custom integrations
- **Terminal-first**: Designed for developers who live in the command line
- **Additional features**: Task management, advanced tool integration, customizable prompts
- **Open source**: Apache 2.0 licensed

## Installation

### Quick Install

#### Run instantly with npx

```bash
# Using npx (no installation required)
npx @nightskylabs/soul-cli-ai
```

#### Install globally with npm

```bash
npm install -g @nightskylabs/soul-cli-ai
```

#### Install globally with Homebrew (macOS/Linux)

```bash
# Homebrew formula coming soon
# For now, use npm install
npm install -g @nightskylabs/ssoul-cli-ai
```

#### System Requirements

- Node.js version 20 or higher
- macOS, Linux, or Windows

## 📋 Key Features

### Code Understanding & Generation

- Query and edit large codebases
- Generate new apps from PDFs, images, or sketches using multimodal capabilities
- Debug issues and troubleshoot with natural language

### Automation & Integration

- Automate operational tasks like querying pull requests or handling complex rebases
- Use MCP servers to connect new capabilities, including [media generation with Imagen, Veo or Lyria](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- Run non-interactively in scripts for workflow automation

### Advanced Capabilities

- Ground your queries with built-in [Google Search](https://ai.google.dev/gemini-api/docs/grounding) for real-time information
- Conversation checkpointing to save and resume complex sessions
- Custom context files (SOUL.md) to tailor behavior for your projects

### GitHub Integration

Integrate Soul CLI directly into your GitHub workflows:

- **Pull Request Reviews**: Automated code review with contextual feedback and suggestions
- **Issue Triage**: Automated labeling and prioritization of GitHub issues based on content analysis
- **On-demand Assistance**: Use Soul CLI in your CI/CD pipelines for automated assistance
- **Custom Workflows**: Build automated, scheduled and on-demand workflows tailored to your team's needs

## Authentication Options

Choose the authentication method that best fits your needs:

### Option 1: OAuth login (Using your Google Account)

**✨ Best for:** Individual developers as well as anyone who has a Gemini Code Assist License. (see [quota limits and terms of service](https://cloud.google.com/gemini/docs/quotas) for details)

**Benefits:**

- **Free tier**: 60 requests/min and 1,000 requests/day
- **Gemini 2.5 Pro** with 1M token context window
- **No API key management** - just sign in with your Google account
- **Automatic updates** to latest models

#### Start Soul CLI, then choose OAuth and follow the browser authentication flow when prompted

```bash
soul
```

#### If you are using a paid Code Assist License from your organization, remember to set the Google Cloud Project

```bash
# Set your Google Cloud Project
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_NAME"
soul
```

### Option 2: Gemini API Key

**✨ Best for:** Developers who need specific model control or paid tier access

**Benefits:**

- **Free tier**: 100 requests/day with Gemini 2.5 Pro
- **Model selection**: Choose specific Gemini models
- **Usage-based billing**: Upgrade for higher limits when needed

```bash
# Get your key from https://aistudio.google.com/apikey
export GEMINI_API_KEY="YOUR_API_KEY"
soul
```

### Option 3: Vertex AI

**✨ Best for:** Enterprise teams and production workloads

**Benefits:**

- **Enterprise features**: Advanced security and compliance
- **Scalable**: Higher rate limits with billing account
- **Integration**: Works with existing Google Cloud infrastructure

```bash
# Get your key from Google Cloud Console
export GOOGLE_API_KEY="YOUR_API_KEY"
export GOOGLE_GENAI_USE_VERTEXAI=true
soul
```

For Google Workspace accounts and other authentication methods, see the [authentication guide](./docs/cli/authentication.md).

## 🚀 Getting Started

### Basic Usage

#### Start in current directory

```bash
soul
```

#### Include multiple directories

```bash
soul --include-directories ../lib,../docs
```

#### Use specific model

```bash
soul -m gemini-2.5-flash
```

#### Non-interactive mode for scripts

```bash
soul -p "Explain the architecture of this codebase"
```

### Quick Examples

#### Start a new project

````bash
cd new-project/
soul
> Write me a Discord bot that answers questions using a FAQ.md file I will provide

#### Analyze existing code
```bash
git clone https://github.com/nightskylabs/soul-cli
cd soul-cli
soul
> Give me a summary of all of the changes that went in yesterday
````

## Documentation

### Getting Started

- [**Quickstart Guide**](./docs/cli/index.md) - Get up and running quickly
- [**Authentication Setup**](./docs/cli/authentication.md) - Detailed auth configuration
- [**Configuration Guide**](./docs/cli/configuration.md) - Settings and customization
- [**Keyboard Shortcuts**](./docs/keyboard-shortcuts.md) - Productivity tips

### Core Features

- [**Commands Reference**](./docs/cli/commands.md) - All slash commands (`/help`, `/chat`, `/mcp`, etc.)
- [**Checkpointing**](./docs/checkpointing.md) - Save and resume conversations
- [**Memory Management**](./docs/tools/memory.md) - Using SOUL.md context files
- [**Token Caching**](./docs/cli/token-caching.md) - Optimize token usage

### Tools & Extensions

- [**Built-in Tools Overview**](./docs/tools/index.md)
  - [File System Operations](./docs/tools/file-system.md)
  - [Shell Commands](./docs/tools/shell.md)
  - [Web Fetch & Search](./docs/tools/web-fetch.md)
  - [Multi-file Operations](./docs/tools/multi-file.md)
- [**MCP Server Integration**](./docs/tools/mcp-server.md) - Extend with custom tools
- [**Custom Extensions**](./docs/extension.md) - Build your own commands

### Advanced Topics

- [**Architecture Overview**](./docs/architecture.md) - How Gemini CLI works
- [**IDE Integration**](./docs/ide-integration.md) - VS Code companion
- [**Sandboxing & Security**](./docs/sandbox.md) - Safe execution environments
- [**Enterprise Deployment**](./docs/deployment.md) - Docker, system-wide config
- [**Telemetry & Monitoring**](./docs/telemetry.md) - Usage tracking
- [**Tools API Development**](./docs/core/tools-api.md) - Create custom tools

### Configuration & Customization

- [**Settings Reference**](./docs/cli/configuration.md) - All configuration options
- [**Theme Customization**](./docs/cli/themes.md) - Visual customization
- [**.soul Directory**](./docs/soul-ignore.md) - Project-specific settings
- [**Environment Variables**](./docs/cli/configuration.md#environment-variables)

### Troubleshooting & Support

- [**Troubleshooting Guide**](./docs/troubleshooting.md) - Common issues and solutions
- [**FAQ**](./docs/troubleshooting.md#frequently-asked-questions) - Quick answers


### Using MCP Servers

Configure MCP servers in `~/.soul/settings.json` to extend Soul CLI with custom tools:

```text
> @github List my open pull requests
> @slack Send a summary of today's commits to #dev channel
> @database Run a query to find inactive users
```

See the [MCP Server Integration guide](./docs/tools/mcp-server.md) for setup instructions.

### Uninstall

See the [Uninstall Guide](docs/Uninstall.md) for removal instructions.

## 📄 Legal

- **License**: [Apache License 2.0](LICENSE)
- **Terms of Service**: [Terms & Privacy](./docs/tos-privacy.md)
- **Security**: [Security Policy](SECURITY.md)

## 🌟 What's New in Soul CLI

Soul CLI extends the original Gemini CLI with:

- **Enhanced Tool System**: Advanced agent tools with specialized capabilities
- **Task Management**: Built-in todo tracking for complex workflows
- **Customizable Prompts**: Flexible system prompt configuration
- **Extended Documentation**: Comprehensive CLAUDE.md development guide
- **Improved Build System**: Optimized bundling and distribution

---

<p align="center">
  Built with ❤️ by Nightsky Labs.ai, based on Google's Gemini CLI
</p>
<p align="center">
  Special thanks to the Google Gemini team and the open source community
</p>
