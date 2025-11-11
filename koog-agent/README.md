# ObsiXiv Koog Agent

Kotlin-based AI agent using Koog framework for generating AlphaXiv-style blog posts from PDF papers.

## Features

- 🚀 Built with Koog AI framework
- ⚡ Fast HTTP API with Ktor
- 🐳 Docker support for easy deployment
- 🔒 API key authentication
- 📝 PDF content processing
- 🎨 Customizable generation (temperature, emojis, humor)

## Quick Start

### Option 1: Run with Docker (Easiest)

```bash
# Build and run
docker-compose up -d

# Check health
curl http://localhost:8080/api/v1/health
```

### Option 2: Run with Gradle

```bash
# Install dependencies and run
./gradlew run

# Or build JAR and run
./gradlew build
java -jar build/libs/*.jar
```

## Configuration

Create `.env` file:

```bash
PORT=8080
```

API keys are passed from the Obsidian plugin, not stored here.

## API Endpoints

### Health Check

```bash
GET /api/v1/health
```

Response:
```json
{
  "status": "ok",
  "service": "obsixiv-koog-agent",
  "version": "1.0.0"
}
```

### Generate Blog Post

```bash
POST /api/v1/generate
Headers:
  Content-Type: application/json
  X-API-Key: your-anthropic-api-key

Body:
{
  "pdfContent": "extracted PDF text...",
  "temperature": 0.8,
  "includeEmojis": true,
  "includeHumor": true
}
```

Response:
```json
{
  "blogPost": "# Generated markdown content...",
  "success": true
}
```

## Development

### Project Structure

```
koog-agent/
├── src/main/kotlin/com/obsixiv/
│   ├── Main.kt              # Application entry point
│   ├── agent/
│   │   └── AlphaXivAgent.kt # Koog agent implementation
│   ├── routes/
│   │   └── BlogPostRoutes.kt # API routes
│   └── models/
│       └── Models.kt         # Data models
├── build.gradle.kts          # Gradle configuration
└── Dockerfile                # Docker image
```

### Build

```bash
./gradlew build
```

### Run

```bash
./gradlew run
```

### Test

```bash
curl -X POST http://localhost:8080/api/v1/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"pdfContent":"Test content","temperature":0.8}'
```

## Deployment

### Deploy to local server

```bash
# Build
./gradlew build

# Run as service
java -jar build/libs/*.jar
```

### Deploy with Docker

```bash
docker-compose up -d
```

### Deploy to cloud

The agent can be deployed to:
- Railway
- Fly.io
- AWS ECS
- Google Cloud Run
- Any Kubernetes cluster

Just use the provided Dockerfile.

## Technology Stack

- **Kotlin** 1.9.21
- **Koog** 0.1.0 - AI agent framework
- **Ktor** 2.3.6 - HTTP server
- **PDFBox** 3.0.0 - PDF processing
- **Kotlinx Serialization** - JSON handling

## Requirements

- JDK 17 or higher
- Gradle 8.5 or higher (or use wrapper)
- Docker (optional, for containerized deployment)

## License

MIT

