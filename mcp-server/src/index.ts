#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";

// Server configuration
const SERVER_NAME = "obsixiv-mcp";
const SERVER_VERSION = "1.0.0";
const KOOG_AGENT_URL = process.env.KOOG_AGENT_URL || "http://localhost:8080";
const API_KEY = process.env.API_KEY || "";

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: "search_paper",
    description:
      "Search for an academic paper by title using ArXiv API and Semantic Scholar. Returns paper metadata and PDF URL.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title of the academic paper to search for",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "generate_blog",
    description:
      "Generate an AlphaXiv-style blog post from paper content. Requires paper content/PDF text and optional metadata.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The text content of the paper (extracted from PDF)",
        },
        metadata: {
          type: "object",
          description: "Optional metadata (title, authors, arxiv_id, etc.)",
          properties: {
            title: { type: "string" },
            authors: { type: "array", items: { type: "string" } },
            arxivId: { type: "string" },
            published: { type: "string" },
            categories: { type: "array", items: { type: "string" } },
          },
        },
        temperature: {
          type: "number",
          description: "Generation temperature (0.0-1.0), default 0.8",
        },
        writingStyle: {
          type: "string",
          description:
            "Writing style: alphaxiv (default), technical, casual, academic",
          enum: ["alphaxiv", "technical", "casual", "academic"],
        },
      },
      required: ["content"],
    },
  },
  {
    name: "find_related",
    description:
      "Find related papers for a given paper using ArXiv categories and Semantic Scholar recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        arxiv_id: {
          type: "string",
          description: "ArXiv ID of the paper (e.g., 2103.00020)",
        },
        title: {
          type: "string",
          description: "Title of the paper (used if arxiv_id not available)",
        },
        max_results: {
          type: "number",
          description: "Maximum number of related papers to return (default 5)",
        },
      },
    },
  },
];

// ArXiv API search
async function searchArxiv(
  title: string
): Promise<{ url: string; metadata: any } | null> {
  try {
    const searchUrl = `https://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(
      title
    )}&start=0&max_results=1&sortBy=relevance&sortOrder=descending`;

    console.error("🔍 Searching ArXiv for:", title);
    const response = await fetch(searchUrl);
    const xml = await response.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const result = parser.parse(xml);

    const entry = result.feed?.entry;
    if (!entry) {
      console.error("❌ No results found on ArXiv");
      return null;
    }

    // Find PDF link
    const links = Array.isArray(entry.link) ? entry.link : [entry.link];
    const pdfLink = links.find((link: any) => link["@_title"] === "pdf")?.[
      "@_href"
    ];

    if (!pdfLink) {
      console.error("❌ No PDF link found");
      return null;
    }

    const arxivId = entry.id.split("/abs/")[1];
    const authors = Array.isArray(entry.author)
      ? entry.author.map((a: any) => a.name)
      : [entry.author.name];
    const categories = Array.isArray(entry.category)
      ? entry.category.map((c: any) => c["@_term"])
      : [entry.category["@_term"]];

    const metadata = {
      arxivId,
      title: entry.title.replace(/\n/g, " ").trim(),
      authors,
      published: entry.published,
      summary: entry.summary.replace(/\n/g, " ").trim(),
      categories,
      url: `https://arxiv.org/abs/${arxivId}`,
    };

    console.error("✅ Found on ArXiv:", metadata.title);
    return { url: pdfLink, metadata };
  } catch (error) {
    console.error("❌ ArXiv search failed:", error);
    return null;
  }
}

// Semantic Scholar API search
async function searchSemanticScholar(
  title: string
): Promise<{ url: string; metadata: any } | null> {
  try {
    const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
      title
    )}&limit=1&fields=paperId,title,authors,year,abstract,openAccessPdf,externalIds`;

    console.error("🔍 Searching Semantic Scholar for:", title);
    const response = await fetch(searchUrl);
    const data = (await response.json()) as any;

    if (!data.data || data.data.length === 0) {
      console.error("❌ No results found on Semantic Scholar");
      return null;
    }

    const paper = data.data[0];
    const pdfUrl = paper.openAccessPdf?.url;

    if (!pdfUrl) {
      console.error("❌ No open access PDF available");
      return null;
    }

    const metadata = {
      arxivId: paper.externalIds?.ArXiv || "",
      title: paper.title,
      authors: paper.authors?.map((a: any) => a.name) || [],
      published: paper.year?.toString() || "",
      summary: paper.abstract || "",
      categories: [],
      url: `https://www.semanticscholar.org/paper/${paper.paperId}`,
    };

    console.error("✅ Found on Semantic Scholar:", metadata.title);
    return { url: pdfUrl, metadata };
  } catch (error) {
    console.error("❌ Semantic Scholar search failed:", error);
    return null;
  }
}

// Find related papers
async function findRelatedPapers(
  arxivId?: string,
  title?: string,
  maxResults: number = 5
): Promise<any[]> {
  const relatedPapers: any[] = [];

  // Method 1: ArXiv by category
  if (arxivId) {
    try {
      // First get the paper info to get categories
      const infoUrl = `https://export.arxiv.org/api/query?id_list=${arxivId}`;
      const response = await fetch(infoUrl);
      const xml = await response.text();

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
      });
      const result = parser.parse(xml);
      const entry = result.feed?.entry;

      if (entry) {
        const categories = Array.isArray(entry.category)
          ? entry.category.map((c: any) => c["@_term"])
          : [entry.category["@_term"]];

        if (categories.length > 0) {
          const categoryQuery = categories[0];
          const searchUrl = `https://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(
            categoryQuery
          )}&start=0&max_results=${maxResults + 1}&sortBy=relevance&sortOrder=descending`;

          const catResponse = await fetch(searchUrl);
          const catXml = await catResponse.text();
          const catResult = parser.parse(catXml);

          const entries = Array.isArray(catResult.feed?.entry)
            ? catResult.feed.entry
            : [catResult.feed?.entry];

          entries.forEach((e: any, index: number) => {
            if (index === 0 || !e) return; // Skip first (might be original)

            const relArxivId = e.id.split("/abs/")[1];
            if (relArxivId === arxivId) return; // Skip original paper

            relatedPapers.push({
              title: e.title.replace(/\n/g, " ").trim(),
              url: `https://arxiv.org/abs/${relArxivId}`,
              arxivId: relArxivId,
              source: "ArXiv",
            });
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch related papers from ArXiv:", error);
    }
  }

  // Method 2: Semantic Scholar recommendations
  if (title && relatedPapers.length < maxResults) {
    try {
      const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
        title
      )}&limit=1&fields=paperId`;
      const response = await fetch(searchUrl);
      const data = (await response.json()) as any;

      if (data.data && data.data.length > 0) {
        const paperId = data.data[0].paperId;
        const recsUrl = `https://api.semanticscholar.org/graph/v1/paper/${paperId}/recommendations?limit=${maxResults}&fields=title,externalIds`;
        const recsResponse = await fetch(recsUrl);
        const recsData = (await recsResponse.json()) as any;

        if (recsData.recommendedPapers) {
          recsData.recommendedPapers.forEach((paper: any) => {
            if (
              relatedPapers.length >= maxResults ||
              relatedPapers.some((p) => p.title === paper.title)
            ) {
              return;
            }

            const relArxivId = paper.externalIds?.ArXiv;
            const url = relArxivId
              ? `https://arxiv.org/abs/${relArxivId}`
              : `https://www.semanticscholar.org/paper/${paper.paperId}`;

            relatedPapers.push({
              title: paper.title,
              url: url,
              arxivId: relArxivId || "",
              source: "Semantic Scholar",
            });
          });
        }
      }
    } catch (error) {
      console.error(
        "Failed to fetch recommendations from Semantic Scholar:",
        error
      );
    }
  }

  return relatedPapers.slice(0, maxResults);
}

// Generate blog post using Koog Agent
async function generateBlogPost(
  content: string,
  metadata?: any,
  temperature: number = 0.8,
  writingStyle: string = "alphaxiv"
): Promise<string> {
  try {
    // Limit content to 8000 chars
    const limitedContent =
      content.length > 8000
        ? content.substring(0, 8000) + "\n\n[Content truncated for processing]"
        : content;

    const requestBody = {
      pdfContent: limitedContent,
      temperature,
      includeEmojis: writingStyle === "alphaxiv",
      includeHumor: writingStyle === "alphaxiv" || writingStyle === "casual",
      customPrompt: "",
      writingStyle,
      metadata: metadata || null,
    };

    console.error("🤖 Calling Koog Agent at:", KOOG_AGENT_URL);
    const response = await fetch(`${KOOG_AGENT_URL}/api/v1/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Agent error: ${error}`);
    }

    const result = (await response.json()) as any;
    return result.blogPost;
  } catch (error) {
    console.error("❌ Blog generation failed:", error);
    throw error;
  }
}

// Create and run server
const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("📋 Client requested tool list");
  return { tools: TOOLS };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`🔧 Tool called: ${name}`);

  try {
    switch (name) {
      case "search_paper": {
        const title = args?.title as string;
        if (!title) {
          throw new Error("Title is required");
        }

        // Try ArXiv first
        let result = await searchArxiv(title);

        // Fallback to Semantic Scholar
        if (!result) {
          result = await searchSemanticScholar(title);
        }

        if (!result) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "Paper not found on ArXiv or Semantic Scholar",
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                result,
              }),
            },
          ],
        };
      }

      case "generate_blog": {
        const content = args?.content as string;
        const metadata = args?.metadata as any;
        const temperature = (args?.temperature as number) || 0.8;
        const writingStyle = (args?.writingStyle as string) || "alphaxiv";

        if (!content) {
          throw new Error("Content is required");
        }

        if (!API_KEY) {
          throw new Error(
            "API_KEY environment variable is required for blog generation"
          );
        }

        const blogPost = await generateBlogPost(
          content,
          metadata,
          temperature,
          writingStyle
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                blogPost,
              }),
            },
          ],
        };
      }

      case "find_related": {
        const arxivId = args?.arxiv_id as string;
        const title = args?.title as string;
        const maxResults = (args?.max_results as number) || 5;

        if (!arxivId && !title) {
          throw new Error("Either arxiv_id or title is required");
        }

        const relatedPapers = await findRelatedPapers(
          arxivId,
          title,
          maxResults
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                relatedPapers,
              }),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    console.error(`❌ Error in tool ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error.message,
          }),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  console.error("🚀 Starting ObsiXiv MCP Server...");
  console.error(`📦 Server: ${SERVER_NAME} v${SERVER_VERSION}`);
  console.error(`🔗 Koog Agent URL: ${KOOG_AGENT_URL}`);
  console.error(`🔑 API Key: ${API_KEY ? "✅ Set" : "❌ Not set (required for blog generation)"}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("✅ MCP Server ready and listening on stdio");
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

