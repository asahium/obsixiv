# ObsiXiv MCP Server 🔌

Model Context Protocol (MCP) server for ObsiXiv - enables Claude Desktop and other MCP clients to search papers, generate blog posts, and find related work.

## Features

### 🔧 Available Tools

1. **`search_paper`** - Search for academic papers by title
   - Searches ArXiv API first
   - Falls back to Semantic Scholar
   - Returns paper metadata and PDF URL

2. **`generate_blog`** - Generate AlphaXiv-style blog posts
   - Requires paper content (PDF text)
   - Optional metadata (title, authors, etc.)
   - Configurable temperature and writing style
   - Calls Koog Agent backend

3. **`find_related`** - Find related papers
   - By ArXiv ID or title
   - Uses ArXiv categories + Semantic Scholar recommendations
   - Returns up to N related papers

## Installation

### Prerequisites

- Node.js 18+
- npm
- Running Koog Agent (see `../agent/`)

### Setup

```bash
cd mcp-server

# Install dependencies
npm install

# Build
npm run build
```

## Usage

### Standalone Testing

```bash
# Set environment variables
export API_KEY="your-anthropic-api-key"
export KOOG_AGENT_URL="http://localhost:8080"

# Run server
npm start
```

### With MCP Inspector (Recommended for testing)

```bash
npm run inspector
```

This opens a web UI to test MCP tools interactively.

### Integration with Claude Desktop

1. **Build the server:**
   ```bash
   npm run build
   ```

2. **Edit Claude Desktop config:**

   **macOS/Linux:** `~/Library/Application Support/Claude/claude_desktop_config.json`

   **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

3. **Add to config:**
   ```json
   {
     "mcpServers": {
       "obsixiv": {
         "command": "node",
         "args": [
           "/absolute/path/to/obsixiv/mcp-server/dist/index.js"
         ],
         "env": {
           "API_KEY": "your-anthropic-api-key",
           "KOOG_AGENT_URL": "http://localhost:8080"
         }
       }
     }
   }
   ```

4. **Restart Claude Desktop**

5. **Verify:** Look for 🔧 tool icon in Claude Desktop - you should see:
   - `search_paper`
   - `generate_blog`
   - `find_related`

## Example Usage in Claude Desktop

### Search for a paper
```
Can you search for the paper "Attention Is All You Need"?
```

Claude will use the `search_paper` tool and return metadata + PDF URL.

### Generate blog post
```
I have this paper content: [paste PDF text]. 
Can you generate an AlphaXiv-style blog post?
```

Claude will use the `generate_blog` tool.

### Find related papers
```
Find papers related to ArXiv ID 1706.03762
```

Claude will use the `find_related` tool.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | Yes (for blog generation) | - | Your AI API key (Anthropic/Perplexity/OpenAI) |
| `KOOG_AGENT_URL` | No | `http://localhost:8080` | Koog Agent URL |

## Architecture

```
┌──────────────┐
│ Claude       │
│ Desktop      │
└──────┬───────┘
       │ MCP Protocol (stdio)
       ▼
┌──────────────┐
│ ObsiXiv      │
│ MCP Server   │
│ (Node.js)    │
└──────┬───────┘
       │
       ├─────► ArXiv API
       ├─────► Semantic Scholar API
       └─────► Koog Agent (localhost:8080)
                   │
                   └─────► AI APIs (Claude/Perplexity/OpenAI)
```

## Development

### Watch mode
```bash
npm run dev
```

### Test with Inspector
```bash
npm run inspector
```

### Debugging

The server logs to stderr (so it doesn't interfere with MCP protocol on stdout):

```bash
# View logs in Claude Desktop
# macOS/Linux: ~/Library/Logs/Claude/mcp.log
# Windows: %APPDATA%\Claude\logs\mcp.log
```

## Troubleshooting

### Tool not appearing in Claude Desktop
- Check config file syntax (valid JSON)
- Ensure absolute path to `index.js`
- Restart Claude Desktop completely

### "API_KEY is required" error
- Make sure `API_KEY` is set in `env` section of config
- Verify Koog Agent is running: `curl http://localhost:8080/api/v1/health`

### Paper search returns no results
- Try with exact paper title from ArXiv
- Check paper is on ArXiv or has open access PDF

## Contributing

See main project [CONTRIBUTING.md](../CONTRIBUTING.md)

## License

MIT - see [LICENSE](../LICENSE)

