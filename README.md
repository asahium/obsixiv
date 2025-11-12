# ObsiXiv 📚✨

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

An Obsidian plugin that generates AlphaXiv-style blog posts from PDF papers using **AI Agent** (Kotlin + Claude API).

> Transform dense academic papers into engaging, humorous, and accessible blog posts with just one click!

---

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

---

## ✨ Features

- 📄 **PDF Text Extraction** - Automatically extracts content from academic papers
- 🔍 **Paper Search** - Search by title on ArXiv and Semantic Scholar
- 📥 **Auto Download** - Automatically downloads and processes papers
- 🤖 **Kotlin AI Agent** - Backend service with direct Claude API integration
- 🎨 **AlphaXiv Style** - Generates fun, informative, and accessible blog posts
- 😄 **Emojis & Humor** - Adds jokes, memes, and entertaining commentary
- 🔗 **Related Papers** - Automatically finds and lists similar work
- 💬 **PDF Chat** - Ask questions about any paper with Markdown support
- 📚 **Batch Processing** - Process multiple PDFs at once
- 🎯 **Custom Prompts & Styles** - Technical, casual, academic, or AlphaXiv
- 💾 **Smart Caching** - Faster re-generation of blog posts
- 🔌 **MCP Integration** - Use with Claude Desktop and other MCP clients
- ⚙️ **Flexible Settings** - Customize temperature and generation style
- 🐳 **Docker Support** - Easy deployment with Docker
- 🚀 **One-Click Setup** - Just add your API key and go!

---

## 🏗️ Architecture

ObsiXiv consists of two components:

1. **AI Agent** (Kotlin) - Backend service that calls Claude API to generate blog posts
2. **Obsidian Plugin** (TypeScript) - UI integration with Obsidian

```
┌─────────────┐      PDF Text      ┌──────────────┐      HTTP Request       ┌─────────┐
│   Obsidian  │ ──────────────────► │  AI Agent    │ ──────────────────────► │  Claude │
│   Plugin    │ ◄──────────────────  │  (Kotlin)    │ ◄──────────────────────  │   API   │
└─────────────┘    Blog Post MD     └──────────────┘       Blog Post         └─────────┘
```

---

## 📦 Prerequisites

Before you start, make sure you have:

### Required

| Tool | Version | Purpose | Download |
|------|---------|---------|----------|
| **Docker Desktop** | Latest | Run Koog Agent | [docker.com](https://www.docker.com/get-started) |
| **Docker Compose** | 2.0+ | Orchestration | Included with Docker Desktop |
| **Node.js** | 16+ | Build plugin | [nodejs.org](https://nodejs.org/) |
| **npm** | 8+ | Package manager | Included with Node.js |
| **Obsidian** | 0.15.0+ | Note-taking app | [obsidian.md](https://obsidian.md/) |
| **Anthropic API Key** | - | AI generation | [console.anthropic.com](https://console.anthropic.com) |

### Optional

| Tool | Purpose |
|------|---------|
| **Git** | Clone repository |
| **JDK 17+** | Build Koog Agent from source (if not using Docker) |

### Quick Check

Verify you have everything:

```bash
# Check Docker
docker --version
docker-compose --version

# Check Node.js & npm
node --version
npm --version

# Check Git (optional)
git --version
```

Expected output:
```
Docker version 24.0.0+
Docker Compose version 2.0.0+
v16.0.0+ (Node)
8.0.0+ (npm)
```

---

## 🚀 Quick Start

### Step 1: Start AI Agent

**macOS/Linux:**
```bash
./scripts/start-agent.sh
```

**Windows:**
```bash
scripts\start-agent.bat
```

**Or manually with Docker:**
```bash
cd agent
docker-compose up -d
```

✅ Agent will start on `http://localhost:8080`

### Step 2: Install Obsidian Plugin

```bash
# Clone repository
git clone https://github.com/yourusername/obsixiv.git
cd obsixiv

# Install dependencies
npm install

# Build plugin
npm run build

# Copy to your vault
cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/obsixiv/
```

Then restart Obsidian and enable the plugin in Settings → Community Plugins

### Step 3: Configure

1. Open Obsidian Settings → ObsiXiv
2. Add your **Anthropic Claude API key** (get from [console.anthropic.com](https://console.anthropic.com))
3. Verify Agent URL is `http://localhost:8080`
4. Done! Start generating blog posts! 🎉

---

## 📥 Installation

### Full Setup Guide

#### 1. Clone Repository

```bash
git clone https://github.com/yourusername/obsixiv.git
cd obsixiv
```

#### 2. Start Koog Agent

```bash
# Using convenience script
./scripts/start-agent.sh

# Or with Docker directly
cd agent
docker-compose up -d

# Verify it's running
curl http://localhost:8080/api/v1/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "obsixiv-agent",
  "version": "1.0.0"
}
```

#### 3. Build & Install Obsidian Plugin

```bash
# Install dependencies
npm install

# Build plugin
npm run build

# Option A: Symlink (recommended for development)
ln -s $(pwd) /path/to/your/vault/.obsidian/plugins/obsixiv

# Option B: Copy files
mkdir -p /path/to/your/vault/.obsidian/plugins/obsixiv
cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/obsixiv/
```

#### 4. Configure in Obsidian

1. Restart Obsidian
2. Settings → Community Plugins → Enable "ObsiXiv"
3. Settings → ObsiXiv:
   - Add your Anthropic API key
   - Agent URL: `http://localhost:8080` (default)
   - Configure temperature and other settings

---

## 💡 Usage

### Generate Blog Post

**Method 1: Context Menu**
- Right-click any PDF → "Generate AlphaXiv blog post"

**Method 2: Command Palette**
- Open PDF → `Cmd/Ctrl+P` → "Generate AlphaXiv blog post"

**Method 3: Ribbon Icon**
- Open PDF → Click plugin icon in left sidebar

### What Gets Generated

The plugin creates a Markdown file with **consistent structure across all posts**:

#### 📋 Standard Sections (always in this order):
1. 🎯 **Title with emojis** + paper metadata
2. 🔥 **TL;DR** - 2-3 sentence hook with key findings
3. 🤔 **The Problem** - what current approaches lack
4. 💡 **The Big Idea** - core innovation explained simply
5. 🔧 **How It Works** - technical details broken down
6. 🔢 **Key Formulas** - important math (if applicable)
7. 📊 **Results That Matter** - quantitative results with exact numbers
8. 🎨 **Why This Is Cool** - creative commentary & hot takes
9. ⚠️ **Limitations & Caveats** - what to watch out for
10. 🔮 **Future Directions** - where this could go
11. 💭 **Final Thoughts** - impact on the field
12. 🏷️ **Tags** - keywords for organization
13. 📚 **Related Papers** - auto-discovered similar work

#### ✨ Consistent Style:
- Same emoji for each section header across all posts
- Bold for key terms and metrics
- Tables for comparisons
- Horizontal rules between sections
- Exact numbers (not "good performance" but "**92.4% accuracy**")

**See:** 
- [examples/example-output.md](examples/example-output.md) - Example blog post
- [BLOG_POST_STRUCTURE.md](BLOG_POST_STRUCTURE.md) - Detailed structure guide

---

## ⚙️ Configuration

### Settings Panel

Access via Obsidian Settings → ObsiXiv

| Setting | Default | Description |
|---------|---------|-------------|
| **AI API Key** | (empty) | Your Anthropic Claude API key (required) |
| **Agent URL** | http://localhost:8080 | Where Koog Agent is running |
| **Output Folder** | blog-posts | Folder for generated posts |
| **Temperature** | 0.8 | Creativity level (0.0-1.0) |
| **Include Emojis** | Yes | Add emojis to posts |
| **Include Humor** | Yes | Add jokes and memes |

### Temperature Guide

- **0.0-0.3**: More focused, technical style
- **0.5-0.7**: Balanced approach
- **0.8-1.0**: Maximum creativity and humor (recommended for AlphaXiv style!)

---

## 📁 Project Structure

```
obsixiv/
│
├── 📂 agent/              # Kotlin AI Agent
│   ├── src/main/kotlin/        # Source code
│   │   ├── agent/              # Koog agent implementation
│   │   ├── routes/             # API endpoints
│   │   └── models/             # Data models
│   ├── build.gradle.kts        # Gradle config
│   ├── Dockerfile              # Docker image
│   └── docker-compose.yml      # Docker Compose
│
├── 📂 mcp-server/              # MCP Server (for Claude Desktop)
│   ├── src/                    # TypeScript source
│   ├── package.json            # Dependencies
│   └── README.md               # MCP setup guide
│
├── 📂 scripts/                 # Automation Scripts
│   ├── start-agent.sh          # Start agent (Unix)
│   ├── start-agent.bat         # Start agent (Windows)
│   └── stop-agent.sh           # Stop agent
│
├── 📂 examples/                # Examples
│   └── example-output.md       # Sample blog post
│
├── 📂 .github/                 # GitHub Config
│   ├── workflows/              # CI/CD
│   └── ISSUE_TEMPLATE/         # Issue templates
│
├── 📄 Core Files
│   ├── main.ts                 # Plugin source code
│   ├── manifest.json           # Plugin metadata
│   ├── package.json            # npm dependencies
│   ├── tsconfig.json           # TypeScript config
│   ├── styles.css              # Custom styles
│   └── ...                     # Config files
│
└── README.md                   # This file (English)
```

---

## 🛠️ Development

### Running in Dev Mode

```bash
# Watch mode (auto-rebuild)
npm run dev

# In Obsidian, reload with Ctrl+R after changes
```

### Building

```bash
# Production build
npm run build

# Type check only
npm run build -- --no-emit
```

### Koog Agent Development

```bash
cd agent

# Run with Gradle
./gradlew run

# Build JAR
./gradlew build
java -jar build/libs/*.jar
```

### Project Commands

```bash
# Start agent
./scripts/start-agent.sh

# Stop agent
./scripts/stop-agent.sh

# Build plugin
npm run build

# Dev mode
npm run dev
```

---

## 🔧 Troubleshooting

### Agent won't start

**Check Docker is running:**
```bash
docker ps
# Should show running containers

# If Docker isn't running:
# - macOS: Open Docker Desktop app
# - Linux: sudo systemctl start docker
# - Windows: Start Docker Desktop
```

**Check logs:**
```bash
cd agent
docker-compose logs -f
```

### Plugin can't connect to agent

```bash
# Verify agent is running
curl http://localhost:8080/api/v1/health

# Check Agent URL in Obsidian settings
# Should be: http://localhost:8080
```

### "API key required" error

Add your Anthropic API key in Obsidian Settings → ObsiXiv

### PDF won't process

- Ensure PDF has extractable text (not just images)
- Check PDF isn't password-protected
- Try a different PDF
- Check console (Ctrl+Shift+I) for errors

### Port 8080 already in use

```bash
# Find what's using port 8080
lsof -i :8080  # macOS/Linux
netstat -ano | findstr :8080  # Windows

# Kill that process or change agent port in docker-compose.yml
```

---

## ❓ FAQ

### Does this work offline?
No, you need internet connection to use the Claude API for generation. PDF extraction works offline.

### How much does it cost?
The plugin is free! You only pay for Claude API calls (typically $0.01-0.10 per blog post depending on paper length).

### Can I use a different AI provider?
Yes! The Koog framework supports multiple providers. Edit the agent code to change the model provider.

### Can I deploy the agent to the cloud?
Yes! Deploy to Railway, Fly.io, AWS, GCP, or any platform that supports Docker. Then update the Agent URL in Obsidian settings.

### What PDF formats are supported?
Any standard PDF with extractable text. Scanned PDFs (images) won't work unless they have OCR text.

### How long does generation take?
Usually 30-60 seconds depending on paper length and API response time.

### Can I customize the writing style?
Yes! Adjust temperature, toggle emojis and humor in settings. Custom prompts are coming in future versions.

---

## 🔌 MCP Integration (Claude Desktop)

ObsiXiv includes an MCP server for integration with Claude Desktop and other MCP clients!

### What is MCP?

Model Context Protocol (MCP) allows AI assistants like Claude to use external tools. With ObsiXiv MCP, Claude can:
- 🔍 Search for papers by title
- 📝 Generate blog posts from paper content
- 🔗 Find related papers

### Setup

See **[mcp-server/README.md](mcp-server/README.md)** for detailed instructions.

Quick start:
```bash
cd mcp-server
npm install
npm run build

# Add to Claude Desktop config:
# ~/Library/Application Support/Claude/claude_desktop_config.json
```

### Example with Claude Desktop

> **You:** "Search for the paper 'Attention Is All You Need' and generate a blog post"
>
> **Claude:** *Uses `search_paper` tool → downloads PDF → uses `generate_blog` tool → returns formatted blog post*

---

## 🎯 Roadmap

- [x] ~~Support more AI providers~~ ✅ (Perplexity, Claude, OpenAI)
- [x] ~~Batch processing multiple PDFs~~ ✅
- [x] ~~Custom prompt templates~~ ✅
- [x] ~~ArXiv metadata integration~~ ✅
- [x] ~~Different writing styles~~ ✅ (technical, casual, academic, alphaxiv)
- [x] ~~Caching for faster re-generation~~ ✅
- [x] ~~PDF Chat feature~~ ✅
- [x] ~~Extract key results and formulas~~ ✅
- [x] ~~Paper search by title~~ ✅
- [x] ~~Related papers discovery~~ ✅
- [x] ~~MCP server integration~~ ✅
- [ ] Image extraction from PDFs (tables, figures)
- [ ] Export to HTML/PDF
- [ ] Support for local LLMs

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- [Koog](https://koog.ai) - Amazing Kotlin AI framework
- [AlphaXiv](https://alphaxiv.org) - Inspiration for blog style
- [Obsidian](https://obsidian.md) - Best note-taking app
- [Anthropic](https://anthropic.com) - Claude AI

---

## 💬 Support

- 🐛 [Report Bug](https://github.com/yourusername/obsixiv/issues/new?template=bug_report.md)
- 💡 [Request Feature](https://github.com/yourusername/obsixiv/issues/new?template=feature_request.md)
- ⭐ Star this repo if you find it useful!

---

<div align="center">

**Made with ❤️ using Koog Framework**

Powered by Kotlin + TypeScript + Claude AI

**[⬆ Back to top](#obsixiv-)**

</div>
