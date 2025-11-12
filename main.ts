import {
	App,
	Editor,
	MarkdownView,
	MarkdownRenderer,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	normalizePath,
	requestUrl,
} from "obsidian";

interface ObsiXivSettings {
	apiKey: string;
	agentUrl: string;
	outputFolder: string;
	temperature: number;
	includeEmojis: boolean;
	includeHumor: boolean;
	customPrompt: string;
	writingStyle: string;
	enableCache: boolean;
}

interface CacheEntry {
	pdfHash: string;
	blogPost: string;
	metadata?: any;
	timestamp: number;
	settings: {
		temperature: number;
		includeEmojis: boolean;
		includeHumor: boolean;
		customPrompt: string;
		writingStyle: string;
	};
}

const DEFAULT_SETTINGS: ObsiXivSettings = {
	apiKey: "",
	agentUrl: "http://localhost:8080",
	outputFolder: "blog-posts",
	temperature: 0.8,
	includeEmojis: true,
	includeHumor: true,
	customPrompt: "",
	writingStyle: "alphaxiv",
	enableCache: true,
};

export default class ObsiXivPlugin extends Plugin {
	settings: ObsiXivSettings;
	cache: Map<string, CacheEntry> = new Map();

	async onload() {
		await this.loadSettings();
		await this.loadCache();

		// Add ribbon icon
		const ribbonIconEl = this.addRibbonIcon(
			"file-text",
			"Generate AlphaXiv Blog Post",
			async (evt: MouseEvent) => {
				await this.generateBlogPostFromActivePdfOrSearch();
			}
		);
		ribbonIconEl.addClass("obsixiv-ribbon-class");

		// Add command
		this.addCommand({
			id: "generate-alphaxiv-post",
			name: "Generate AlphaXiv blog post from PDF",
			callback: async () => {
				await this.generateBlogPostFromActivePdfOrSearch();
			},
		});

		// Add command to search by title
		this.addCommand({
			id: "search-paper-by-title",
			name: "Search paper by title and generate blog post",
			callback: async () => {
				new PaperSearchModal(this.app, this).open();
			},
		});

		// Add command to chat about PDF
		this.addCommand({
			id: "chat-about-pdf",
			name: "Chat about PDF paper",
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile || activeFile.extension !== "pdf") {
					new Notice("Please open a PDF file first");
					return;
				}
				new PdfChatModal(this.app, this, activeFile).open();
			},
		});

		// Add command for batch processing
		this.addCommand({
			id: "batch-generate-posts",
			name: "Batch generate blog posts from PDFs",
			callback: async () => {
				new BatchProcessModal(this.app, this).open();
			},
		});

		// Add editor menu item
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "pdf") {
					menu.addItem((item) => {
						item
							.setTitle("Generate AlphaXiv blog post")
							.setIcon("file-text")
							.onClick(async () => {
								await this.generateBlogPostFromPdf(file);
							});
					});
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new ObsiXivSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async loadCache() {
		try {
			const cacheData = await this.loadData();
			if (cacheData && cacheData._cache) {
				this.cache = new Map(Object.entries(cacheData._cache));
				console.log(`📦 Loaded ${this.cache.size} cached entries`);
			}
		} catch (error) {
			console.error("Error loading cache:", error);
		}
	}

	async saveCache() {
		try {
			const data = await this.loadData() || {};
			data._cache = Object.fromEntries(this.cache);
			await this.saveData(data);
		} catch (error) {
			console.error("Error saving cache:", error);
		}
	}

	hashString(str: string): string {
		// Simple hash function for caching
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return hash.toString(36);
	}

	getCacheKey(pdfContent: string): string {
		const contentHash = this.hashString(pdfContent);
		const settingsHash = this.hashString(JSON.stringify({
			temperature: this.settings.temperature,
			includeEmojis: this.settings.includeEmojis,
			includeHumor: this.settings.includeHumor,
			customPrompt: this.settings.customPrompt,
			writingStyle: this.settings.writingStyle,
		}));
		return `${contentHash}_${settingsHash}`;
	}

	async generateBlogPostFromActivePdfOrSearch() {
		const activeFile = this.app.workspace.getActiveFile();

		// If active file is PDF, process it
		if (activeFile && activeFile.extension === "pdf") {
			await this.generateBlogPostFromPdf(activeFile);
		} else {
			// Otherwise, open search modal
			new PaperSearchModal(this.app, this).open();
		}
	}

	async generateBlogPostFromActivePdf() {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			new Notice("No file is currently active");
			return;
		}

		if (activeFile.extension !== "pdf") {
			new Notice("Active file is not a PDF");
			return;
		}

		await this.generateBlogPostFromPdf(activeFile);
	}

	// Search for multiple papers by title using ArXiv API
	async searchPapersOnArxiv(title: string, maxResults: number = 10): Promise<Array<{ url: string; metadata: any }>> {
		try {
			const searchUrl = `https://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(title)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
			
			console.log("🔍 Searching ArXiv for:", title, `(max ${maxResults} results)`);
			const response = await requestUrl({ url: searchUrl });
			
			// Parse XML response
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(response.text, "text/xml");
			
			const entries = xmlDoc.querySelectorAll("entry");
			if (!entries || entries.length === 0) {
				console.log("❌ No results found on ArXiv");
				return [];
			}

			const results: Array<{ url: string; metadata: any }> = [];

			entries.forEach((entry) => {
				// Try multiple ways to find PDF link
				const links = Array.from(entry.querySelectorAll("link"));
				
				// Method 1: Look for link with title="pdf"
				let pdfLink = links.find((link) => link.getAttribute("title") === "pdf")?.getAttribute("href");
				
				// Method 2: Look for link with type="application/pdf"
				if (!pdfLink) {
					pdfLink = links.find((link) => link.getAttribute("type") === "application/pdf")?.getAttribute("href");
				}
				
				// Method 3: Build PDF link from arxiv ID
				if (!pdfLink) {
					const idElement = entry.querySelector("id");
					if (idElement?.textContent) {
						const arxivId = idElement.textContent.split("/abs/")[1];
						if (arxivId) {
							pdfLink = `https://arxiv.org/pdf/${arxivId}.pdf`;
						}
					}
				}

				if (!pdfLink) return; // Skip this entry

				const arxivId = entry.querySelector("id")?.textContent?.split("/abs/")[1] || "";
				const paperTitle = entry.querySelector("title")?.textContent?.trim().replace(/\s+/g, ' ') || title;
				const authors = Array.from(entry.querySelectorAll("author name")).map(
					(author) => author.textContent?.trim() || ""
				);
				const published = entry.querySelector("published")?.textContent?.trim() || "";
				const summary = entry.querySelector("summary")?.textContent?.trim().replace(/\s+/g, ' ') || "";
				const categories = Array.from(entry.querySelectorAll("category")).map(
					(cat) => cat.getAttribute("term") || ""
				);

				const metadata = {
					arxivId,
					title: paperTitle,
					authors,
					published,
					summary,
					categories,
					url: `https://arxiv.org/abs/${arxivId}`,
				};

				results.push({ url: pdfLink, metadata });
			});

			console.log(`✅ Found ${results.length} results on ArXiv`);
			return results;
		} catch (error) {
			console.error("❌ ArXiv search failed:", error);
			return [];
		}
	}

	// Search for paper by title using ArXiv API (single result - for backwards compatibility)
	async searchPaperOnArxiv(title: string): Promise<{ url: string; metadata: any } | null> {
		const results = await this.searchPapersOnArxiv(title, 1);
		return results.length > 0 ? results[0] : null;
	}

	// Search for paper using Semantic Scholar API (fallback)
	async searchPaperOnSemanticScholar(title: string): Promise<{ url: string; metadata: any } | null> {
		try {
			const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=paperId,title,authors,year,abstract,openAccessPdf,externalIds`;
			
			console.log("🔍 Searching Semantic Scholar for:", title);
			const response = await requestUrl({ url: searchUrl });
			const data = JSON.parse(response.text);

			if (!data.data || data.data.length === 0) {
				console.log("❌ No results found on Semantic Scholar");
				return null;
			}

			const paper = data.data[0];
			const pdfUrl = paper.openAccessPdf?.url;

			if (!pdfUrl) {
				console.log("❌ No open access PDF available on Semantic Scholar");
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

			console.log("✅ Found on Semantic Scholar:", paper.title);
			return { url: pdfUrl, metadata };
		} catch (error) {
			console.error("❌ Semantic Scholar search failed:", error);
			return null;
		}
	}

	// Download PDF from URL
	async downloadPdfFromUrl(url: string, filename: string): Promise<TFile> {
		console.log("📥 Downloading PDF from:", url);
		new Notice("Downloading PDF...");

		const response = await requestUrl({ url, method: "GET" });
		const pdfData = response.arrayBuffer;

		// Save PDF to vault
		const pdfFolder = "papers-downloads";
		const folder = normalizePath(pdfFolder);
		
		try {
			await this.app.vault.createFolder(folder);
		} catch (error) {
			// Folder might already exist
		}

		const sanitizedFilename = filename.replace(/[^a-zA-Z0-9-_]/g, "_");
		const filepath = normalizePath(`${folder}/${sanitizedFilename}.pdf`);

		// Check if file already exists
		let existingFile = this.app.vault.getAbstractFileByPath(filepath);
		if (existingFile instanceof TFile) {
			console.log("ℹ️ PDF already exists, using existing file");
			return existingFile;
		}

		const file = await this.app.vault.createBinary(filepath, pdfData);
		console.log("✅ PDF downloaded to:", filepath);
		new Notice(`PDF downloaded: ${file.name}`);
		
		return file;
	}

	// Find related papers based on references in PDF content
	async findRelatedPapers(pdfContent: string, metadata: any): Promise<string[]> {
		try {
			console.log("🔗 Finding related papers...");
			const relatedPapers: string[] = [];

			// Method 1: Use ArXiv API to find related papers by category
			if (metadata?.arxivId) {
				try {
					const categoryQuery = metadata.categories?.[0] || "";
					if (categoryQuery) {
						const searchUrl = `https://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(categoryQuery)}&start=0&max_results=5&sortBy=relevance&sortOrder=descending`;
						const response = await requestUrl({ url: searchUrl });
						
						const parser = new DOMParser();
						const xmlDoc = parser.parseFromString(response.text, "text/xml");
						
						const entries = xmlDoc.querySelectorAll("entry");
						entries.forEach((entry, index) => {
							if (index === 0) return; // Skip first (original paper)
							
							const title = entry.querySelector("title")?.textContent?.trim() || "";
							const arxivId = entry.querySelector("id")?.textContent?.split("/abs/")[1] || "";
							const url = `https://arxiv.org/abs/${arxivId}`;
							
							if (title && url && arxivId !== metadata.arxivId) {
								relatedPapers.push(`- [${title}](${url})`);
							}
						});
					}
				} catch (error) {
					console.error("Failed to fetch related papers from ArXiv:", error);
				}
			}

			// Method 2: Use Semantic Scholar API if we have the paper
			if (metadata?.title && relatedPapers.length < 3) {
				try {
					const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(metadata.title)}&limit=1&fields=paperId`;
					const response = await requestUrl({ url: searchUrl });
					const data = JSON.parse(response.text);

					if (data.data && data.data.length > 0) {
						const paperId = data.data[0].paperId;
						const recsUrl = `https://api.semanticscholar.org/graph/v1/paper/${paperId}/recommendations?limit=5&fields=title,externalIds`;
						const recsResponse = await requestUrl({ url: recsUrl });
						const recsData = JSON.parse(recsResponse.text);

						if (recsData.recommendedPapers) {
							recsData.recommendedPapers.forEach((paper: any) => {
								const title = paper.title;
								const arxivId = paper.externalIds?.ArXiv;
								const url = arxivId 
									? `https://arxiv.org/abs/${arxivId}`
									: `https://www.semanticscholar.org/paper/${paper.paperId}`;
								
								if (title && !relatedPapers.some(p => p.includes(title))) {
									relatedPapers.push(`- [${title}](${url})`);
								}
							});
						}
					}
				} catch (error) {
					console.error("Failed to fetch recommendations from Semantic Scholar:", error);
				}
			}

			console.log(`✅ Found ${relatedPapers.length} related papers`);
			return relatedPapers.slice(0, 5); // Limit to 5
		} catch (error) {
			console.error("❌ Error finding related papers:", error);
			return [];
		}
	}

	async generateBlogPostFromPdf(pdfFile: TFile) {
		if (!this.settings.apiKey) {
			new Notice("Please set your AI API key in settings");
			return;
		}

		new Notice("Extracting text from PDF...");
		console.log("🚀 Starting PDF processing for:", pdfFile.name);

		// Try to extract ArXiv ID from filename
		const arxivId = this.extractArxivId(pdfFile.name);
		let metadata = null;
		if (arxivId) {
			console.log("📑 Found ArXiv ID:", arxivId);
			metadata = await this.fetchArxivMetadata(arxivId);
			if (metadata) {
				console.log("✅ ArXiv metadata fetched:", metadata.title);
				new Notice(`Found ArXiv: ${metadata.title.substring(0, 50)}...`);
			}
		}

		try {
			// Extract PDF content
			console.log("📄 Extracting PDF text...");
			let pdfContent = await this.extractPdfText(pdfFile);
			console.log("✅ PDF text extracted. Length:", pdfContent.length);

			if (!pdfContent || pdfContent.length < 100) {
				console.error("❌ Not enough text extracted:", pdfContent.length);
				new Notice("Could not extract enough text from PDF");
				return;
			}

			// Limit text size to avoid API timeouts (take first 8000 chars)
			const maxLength = 8000;
			if (pdfContent.length > maxLength) {
				console.log(`✂️ Trimming PDF content from ${pdfContent.length} to ${maxLength} chars`);
				pdfContent = pdfContent.substring(0, maxLength) + "\n\n[Content truncated for processing]";
			}

			// Check cache first
			let blogPost: string;
			if (this.settings.enableCache) {
				const cacheKey = this.getCacheKey(pdfContent);
				const cached = this.cache.get(cacheKey);
				
				if (cached && cached.metadata?.arxivId === metadata?.arxivId) {
					console.log("💾 Using cached blog post");
					new Notice("✨ Using cached result!");
					blogPost = cached.blogPost;
					metadata = cached.metadata || metadata;
				} else {
					new Notice("Generating blog post with Koog Agent...");
					console.log("🤖 Calling agent with text length:", pdfContent.length);
					console.log("🔑 API key:", this.settings.apiKey.substring(0, 10) + "...");
					console.log("🌐 Agent URL:", this.settings.agentUrl);

					// Generate blog post using Koog Agent
					blogPost = await this.generateBlogPostWithKoogAgent(pdfContent, metadata);
					console.log("✅ Blog post received! Length:", blogPost.length);
					
					// Save to cache
					this.cache.set(cacheKey, {
						pdfHash: cacheKey,
						blogPost: blogPost,
						metadata: metadata,
						timestamp: Date.now(),
						settings: {
							temperature: this.settings.temperature,
							includeEmojis: this.settings.includeEmojis,
							includeHumor: this.settings.includeHumor,
							customPrompt: this.settings.customPrompt,
							writingStyle: this.settings.writingStyle,
						}
					});
					await this.saveCache();
					console.log("💾 Cached result for future use");
				}
			} else {
				new Notice("Generating blog post with Koog Agent...");
				console.log("🤖 Calling agent with text length:", pdfContent.length);
				console.log("🔑 API key:", this.settings.apiKey.substring(0, 10) + "...");
				console.log("🌐 Agent URL:", this.settings.agentUrl);

				// Generate blog post using Koog Agent
				blogPost = await this.generateBlogPostWithKoogAgent(pdfContent, metadata);
				console.log("✅ Blog post received! Length:", blogPost.length);
			}

			// Find and add related papers
			new Notice("🔗 Finding related papers...");
			const relatedPapers = await this.findRelatedPapers(pdfContent, metadata);
			
			if (relatedPapers.length > 0) {
				blogPost += `\n\n---\n\n## 📚 Related Papers\n\n${relatedPapers.join('\n')}\n`;
				console.log(`✅ Added ${relatedPapers.length} related papers to blog post`);
			}

			// Save blog post
			await this.saveBlogPost(pdfFile.basename, blogPost, metadata);

			new Notice("✨ Blog post generated successfully!");
		} catch (error) {
			console.error("Error generating blog post:", error);
			new Notice(`Error: ${error.message}`);
		}
	}

	async extractPdfText(pdfFile: TFile): Promise<string> {
		try {
			// SOLUTION: Send PDF to Koog Agent for text extraction
			// This completely avoids PDF.js conflicts with Obsidian
			console.log("📤 Sending PDF to agent for text extraction...");
			
			const arrayBuffer = await this.app.vault.readBinary(pdfFile);
			
			// Convert to base64 for transmission
			const base64 = this.arrayBufferToBase64(arrayBuffer);
			
			const response = await requestUrl({
				url: `${this.settings.agentUrl}/api/v1/extract-pdf`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": this.settings.apiKey,
				},
				body: JSON.stringify({
					pdfBase64: base64,
					filename: pdfFile.name
				}),
			});

			if (response.status !== 200) {
				throw new Error(`Agent responded with status ${response.status}`);
			}

			const result = JSON.parse(response.text);
			
			if (!result.success || !result.text) {
				throw new Error("Agent failed to extract PDF text");
			}

			console.log("✅ PDF text extracted by agent. Length:", result.text.length);
			return result.text;
			
		} catch (error) {
			console.error("❌ Agent extraction failed:", error);
			
			// No fallback to local extraction to avoid PDF.js version conflicts with Obsidian
			new Notice("⚠️ Failed to extract PDF. Make sure Koog Agent is running.");
			throw new Error(`PDF extraction failed: ${error.message}. Please ensure Koog Agent is running at ${this.settings.agentUrl}`);
		}
	}

	arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	async askQuestion(pdfContent: string, question: string): Promise<string> {
		try {
			console.log("💬 Sending question to agent:", question);
			const requestBody = {
				pdfContent: pdfContent,
				question: question,
				temperature: 0.7,
			};
			
			const response = await requestUrl({
				url: `${this.settings.agentUrl}/api/v1/chat`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": this.settings.apiKey,
				},
				body: JSON.stringify(requestBody),
				throw: false,
			});

			console.log("📨 Chat response status:", response.status);
			
			if (response.status !== 200) {
				console.error("❌ Agent error response:", response);
				throw new Error(`Request failed, status ${response.status}`);
			}

			const data = response.json;

			if (data.success && data.answer) {
				return data.answer;
			} else {
				throw new Error(data.error || "No response from agent");
			}
		} catch (error) {
			console.error("Chat error:", error);
			throw new Error(`Chat error: ${error.message || error}`);
		}
	}

	extractArxivId(filename: string): string | null {
		// Try various ArXiv ID formats
		// Format: YYMM.NNNNN or YYMM.NNNNNvN
		const patterns = [
			/(\d{4}\.\d{4,5}(?:v\d+)?)/,  // e.g., 2506.21170v2
			/arxiv[_-]?(\d{4}\.\d{4,5}(?:v\d+)?)/i,  // e.g., arxiv_2506.21170
		];
		
		for (const pattern of patterns) {
			const match = filename.match(pattern);
			if (match) {
				return match[1];
			}
		}
		return null;
	}

	async fetchArxivMetadata(arxivId: string): Promise<any | null> {
		try {
			const apiUrl = `http://export.arxiv.org/api/query?id_list=${arxivId}`;
			const response = await requestUrl({ url: apiUrl });
			
			if (response.status !== 200) {
				console.warn("⚠️ ArXiv API returned status:", response.status);
				return null;
			}
			
			// Parse XML response
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(response.text, "text/xml");
			
			const entry = xmlDoc.querySelector("entry");
			if (!entry) {
				console.warn("⚠️ No entry found in ArXiv response");
				return null;
			}
			
			const title = entry.querySelector("title")?.textContent?.trim() || "";
			const summary = entry.querySelector("summary")?.textContent?.trim() || "";
			const published = entry.querySelector("published")?.textContent?.trim() || "";
			const updated = entry.querySelector("updated")?.textContent?.trim() || "";
			
			const authors: string[] = [];
			entry.querySelectorAll("author name").forEach(authorNode => {
				const authorName = authorNode.textContent?.trim();
				if (authorName) authors.push(authorName);
			});
			
			const categories: string[] = [];
			entry.querySelectorAll("category").forEach(catNode => {
				const term = catNode.getAttribute("term");
				if (term) categories.push(term);
			});
			
			return {
				arxivId,
				title,
				authors,
				summary,
				published,
				updated,
				categories,
				url: `https://arxiv.org/abs/${arxivId}`,
			};
		} catch (error) {
			console.error("❌ Error fetching ArXiv metadata:", error);
			return null;
		}
	}

	async generateBlogPostWithKoogAgent(pdfContent: string, metadata?: any): Promise<string> {
		try {
			console.log("📡 Sending request to agent...");
			const requestBody = {
				pdfContent: pdfContent,
				temperature: this.settings.temperature,
				includeEmojis: this.settings.includeEmojis,
				includeHumor: this.settings.includeHumor,
				customPrompt: this.settings.customPrompt,
				writingStyle: this.settings.writingStyle,
				arxivMetadata: metadata || undefined,
			};
			console.log("📦 Request body size:", JSON.stringify(requestBody).length);
			
			const response = await requestUrl({
				url: `${this.settings.agentUrl}/api/v1/generate`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": this.settings.apiKey,
				},
				body: JSON.stringify(requestBody),
				throw: false,
			});

			console.log("📨 Response status:", response.status);
			
			if (response.status !== 200) {
				console.error("❌ Agent error response:", response);
				console.error("Response body:", response.text);
				throw new Error(`Request failed, status ${response.status}`);
			}

			const data = response.json;

			if (data.success && data.blogPost) {
				return data.blogPost;
			} else {
				throw new Error(data.error || "No response from Koog Agent");
			}
		} catch (error) {
			console.error("Koog Agent error:", error);
			throw new Error(`Koog Agent error: ${error.message || error}`);
		}
	}


	async saveBlogPost(originalFilename: string, blogPost: string, metadata?: any) {
		// Ensure output folder exists
		const folder = normalizePath(this.settings.outputFolder);
		try {
			await this.app.vault.createFolder(folder);
		} catch (error) {
			// Folder might already exist
		}

		// Generate filename
		const timestamp = new Date().toISOString().split("T")[0];
		const sanitizedName = originalFilename
			.replace(/[^a-zA-Z0-9-_]/g, "_")
			.toLowerCase();
		const filename = normalizePath(
			`${folder}/${timestamp}_${sanitizedName}.md`
		);

		// Add frontmatter (with ArXiv metadata if available)
		let frontmatter = '';
		if (metadata) {
			frontmatter = `---
title: "${metadata.title?.replace(/"/g, '\\"') || originalFilename}"
arxiv_id: "${metadata.arxivId || ''}"
arxiv_url: "${metadata.url || ''}"
authors: "${metadata.authors?.join(', ') || ''}"
published: "${metadata.published || ''}"
categories: "${metadata.categories?.join(', ') || ''}"
source_pdf: "${originalFilename}.pdf"
generated: ${new Date().toISOString()}
generator: ObsiXiv
---

`;
		} else {
			frontmatter = `---
title: "${originalFilename}"
source_pdf: "${originalFilename}.pdf"
generated: ${new Date().toISOString()}
generator: ObsiXiv
---

`;
		}

		const fullContent = frontmatter + blogPost;

		// Create the file
		await this.app.vault.create(filename, fullContent);

		// Open the new file in split screen on the right
		const file = this.app.vault.getAbstractFileByPath(filename);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf('split', 'vertical');
			await leaf.openFile(file);
		}
	}
}

class PaperSearchModal extends Modal {
	plugin: ObsiXivPlugin;
	results: Array<{ url: string; metadata: any }> = [];

	constructor(app: App, plugin: ObsiXivPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("obsixiv-search-modal");

		contentEl.createEl("h2", { text: "🔍 Search Paper by Title" });

		contentEl.createEl("p", {
			text: "Enter the title of the academic paper you want to find:",
		});

		// Input field
		const inputContainer = contentEl.createDiv("search-input-container");
		inputContainer.style.cssText = "margin: 20px 0;";

		const input = inputContainer.createEl("input", {
			type: "text",
			placeholder: "e.g., Attention Is All You Need",
		});
		input.style.cssText = "width: 100%; padding: 10px; font-size: 14px; border: 1px solid var(--background-modifier-border); border-radius: 5px;";

		// Status message
		const statusDiv = contentEl.createDiv("search-status");
		statusDiv.style.cssText = "margin: 15px 0; min-height: 20px; color: var(--text-muted);";

		// Results container (hidden initially)
		const resultsContainer = contentEl.createDiv("search-results");
		resultsContainer.style.cssText = "display: none; max-height: 400px; overflow-y: auto; border: 1px solid var(--background-modifier-border); border-radius: 5px; margin: 15px 0;";

		// Buttons
		const buttonsDiv = contentEl.createDiv("search-buttons");
		buttonsDiv.style.cssText = "display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;";

		const cancelBtn = buttonsDiv.createEl("button", { text: "Cancel" });
		cancelBtn.onclick = () => this.close();

		const searchBtn = buttonsDiv.createEl("button", {
			text: "Search",
			cls: "mod-cta",
		});

		const performSearch = async () => {
			const title = input.value.trim();
			if (!title) {
				statusDiv.textContent = "⚠️ Please enter a paper title";
				statusDiv.style.color = "var(--text-error)";
				return;
			}

			input.disabled = true;
			searchBtn.disabled = true;
			resultsContainer.style.display = "none";
			resultsContainer.empty();

			try {
				statusDiv.textContent = "🔍 Searching ArXiv...";
				statusDiv.style.color = "var(--text-muted)";

				// Search ArXiv for multiple results
				this.results = await this.plugin.searchPapersOnArxiv(title, 10);

				if (this.results.length === 0) {
					statusDiv.textContent = "❌ No papers found on ArXiv. Try a different search term.";
					statusDiv.style.color = "var(--text-error)";
					input.disabled = false;
					searchBtn.disabled = false;
					return;
				}

				statusDiv.textContent = `✅ Found ${this.results.length} result(s). Select one:`;
				statusDiv.style.color = "var(--text-success)";

				// Display results
				this.displayResults(resultsContainer);
				resultsContainer.style.display = "block";

			} catch (error) {
				console.error("Search error:", error);
				statusDiv.textContent = `❌ Error: ${error.message}`;
				statusDiv.style.color = "var(--text-error)";
			} finally {
				input.disabled = false;
				searchBtn.disabled = false;
			}
		};

		searchBtn.onclick = performSearch;
		input.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				performSearch();
			}
		});

		// Focus input
		setTimeout(() => input.focus(), 100);
	}

	displayResults(container: HTMLElement) {
		container.empty();

		this.results.forEach((result, index) => {
			const resultDiv = container.createDiv("search-result-item");
			resultDiv.style.cssText = `
				padding: 15px;
				margin: 10px;
				border: 2px solid var(--background-modifier-border);
				border-radius: 8px;
				cursor: pointer;
				transition: all 0.2s;
			`;

			// Title
			const titleEl = resultDiv.createEl("div", {
				text: result.metadata.title,
			});
			titleEl.style.cssText = "font-weight: bold; font-size: 15px; margin-bottom: 8px; color: var(--text-normal);";

			// Authors
			if (result.metadata.authors && result.metadata.authors.length > 0) {
				const authorsText = result.metadata.authors.slice(0, 3).join(", ") +
					(result.metadata.authors.length > 3 ? " et al." : "");
				const authorsEl = resultDiv.createEl("div", { text: `👤 ${authorsText}` });
				authorsEl.style.cssText = "font-size: 13px; color: var(--text-muted); margin-bottom: 5px;";
			}

			// Published date + ArXiv ID
			const metaDiv = resultDiv.createDiv();
			metaDiv.style.cssText = "font-size: 12px; color: var(--text-muted); margin-bottom: 8px;";
			
			if (result.metadata.published) {
				const date = new Date(result.metadata.published);
				metaDiv.createSpan({ text: `📅 ${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` });
			}
			
			if (result.metadata.arxivId) {
				if (metaDiv.textContent) metaDiv.createSpan({ text: " • " });
				metaDiv.createSpan({ text: `🔖 ${result.metadata.arxivId}` });
			}

			// Summary (truncated)
			if (result.metadata.summary) {
				const summary = result.metadata.summary.length > 200
					? result.metadata.summary.substring(0, 200) + "..."
					: result.metadata.summary;
				const summaryEl = resultDiv.createEl("div", { text: summary });
				summaryEl.style.cssText = "font-size: 13px; color: var(--text-faint); margin-top: 8px; line-height: 1.4;";
			}

			// Hover effect
			resultDiv.onmouseenter = () => {
				resultDiv.style.borderColor = "var(--interactive-accent)";
				resultDiv.style.backgroundColor = "var(--background-secondary)";
			};
			resultDiv.onmouseleave = () => {
				resultDiv.style.borderColor = "var(--background-modifier-border)";
				resultDiv.style.backgroundColor = "transparent";
			};

			// Click to select
			resultDiv.onclick = async () => {
				await this.selectPaper(result);
			};
		});
	}

	async selectPaper(result: { url: string; metadata: any }) {
		const statusDiv = this.contentEl.querySelector(".search-status") as HTMLElement;
		
		try {
			statusDiv.textContent = `📥 Downloading: ${result.metadata.title.substring(0, 60)}...`;
			statusDiv.style.color = "var(--text-muted)";

			// Download PDF
			const pdfFile = await this.plugin.downloadPdfFromUrl(
				result.url,
				result.metadata.title
			);

			this.close();

			// Generate blog post from downloaded PDF
			await this.plugin.generateBlogPostFromPdf(pdfFile);
		} catch (error) {
			console.error("Download error:", error);
			statusDiv.textContent = `❌ Error: ${error.message}`;
			statusDiv.style.color = "var(--text-error)";
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class BatchProcessModal extends Modal {
	plugin: ObsiXivPlugin;
	selectedFiles: TFile[] = [];

	constructor(app: App, plugin: ObsiXivPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("obsixiv-batch-modal");

		contentEl.createEl("h2", { text: "📚 Batch Generate Blog Posts" });

		// Get all PDF files
		const allFiles = this.app.vault.getFiles();
		const pdfFiles = allFiles.filter(f => f.extension === "pdf");

		if (pdfFiles.length === 0) {
			contentEl.createEl("p", { text: "No PDF files found in vault" });
			return;
		}

		contentEl.createEl("p", { 
			text: `Found ${pdfFiles.length} PDF files. Select which ones to process:` 
		});

		// File list container
		const fileListContainer = contentEl.createDiv("batch-file-list");
		fileListContainer.style.cssText = "max-height: 300px; overflow-y: auto; border: 1px solid var(--background-modifier-border); padding: 10px; margin: 10px 0; border-radius: 5px;";

		// Add checkboxes for each PDF
		pdfFiles.forEach(file => {
			const fileItem = fileListContainer.createDiv("batch-file-item");
			fileItem.style.cssText = "display: flex; align-items: center; padding: 5px; margin: 2px 0;";

			const checkbox = fileItem.createEl("input", { type: "checkbox" });
			checkbox.style.cssText = "margin-right: 10px;";
			checkbox.checked = false;
			
			checkbox.onchange = () => {
				if (checkbox.checked) {
					this.selectedFiles.push(file);
				} else {
					this.selectedFiles = this.selectedFiles.filter(f => f !== file);
				}
				updateCounter();
			};

			fileItem.createEl("span", { text: file.path });
		});

		// Counter and buttons
		const controlsDiv = contentEl.createDiv("batch-controls");
		controlsDiv.style.cssText = "margin-top: 15px; display: flex; justify-content: space-between; align-items: center;";

		const counterSpan = controlsDiv.createEl("span", { text: "0 selected" });
		counterSpan.style.cssText = "font-weight: bold;";

		const updateCounter = () => {
			counterSpan.textContent = `${this.selectedFiles.length} selected`;
		};

		const buttonsDiv = controlsDiv.createDiv();
		buttonsDiv.style.cssText = "display: flex; gap: 10px;";

		const selectAllBtn = buttonsDiv.createEl("button", { text: "Select All" });
		selectAllBtn.onclick = () => {
			const checkboxes = fileListContainer.querySelectorAll('input[type="checkbox"]');
			this.selectedFiles = [...pdfFiles];
			checkboxes.forEach((cb: any) => cb.checked = true);
			updateCounter();
		};

		const deselectAllBtn = buttonsDiv.createEl("button", { text: "Deselect All" });
		deselectAllBtn.onclick = () => {
			const checkboxes = fileListContainer.querySelectorAll('input[type="checkbox"]');
			this.selectedFiles = [];
			checkboxes.forEach((cb: any) => cb.checked = false);
			updateCounter();
		};

		const generateBtn = buttonsDiv.createEl("button", { 
			text: "Generate Posts",
			cls: "mod-cta"
		});
		generateBtn.onclick = async () => {
			if (this.selectedFiles.length === 0) {
				new Notice("Please select at least one PDF");
				return;
			}
			await this.processBatch();
		};
	}

	async processBatch() {
		this.close();
		
		const total = this.selectedFiles.length;
		new Notice(`Starting batch processing of ${total} PDFs...`);

		let successful = 0;
		let failed = 0;

		for (let i = 0; i < this.selectedFiles.length; i++) {
			const file = this.selectedFiles[i];
			const progress = `[${i + 1}/${total}]`;
			
			try {
				new Notice(`${progress} Processing ${file.basename}...`);
				await this.plugin.generateBlogPostFromPdf(file);
				successful++;
				new Notice(`${progress} ✅ ${file.basename} completed`);
			} catch (error) {
				failed++;
				new Notice(`${progress} ❌ ${file.basename} failed: ${error.message}`);
				console.error(`Failed to process ${file.path}:`, error);
			}

			// Small delay between requests to avoid rate limiting
			if (i < this.selectedFiles.length - 1) {
				await new Promise(resolve => setTimeout(resolve, 2000));
			}
		}

		new Notice(`✅ Batch complete! ${successful} successful, ${failed} failed`, 5000);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class PdfChatModal extends Modal {
	plugin: ObsiXivPlugin;
	pdfFile: TFile;
	pdfContent: string = "";
	chatHistory: { role: string; content: string }[] = [];
	
	constructor(app: App, plugin: ObsiXivPlugin, pdfFile: TFile) {
		super(app);
		this.plugin = plugin;
		this.pdfFile = pdfFile;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("obsixiv-chat-modal");

		// Title
		contentEl.createEl("h2", { text: `💬 Chat about: ${this.pdfFile.basename}` });

		// Extract PDF text
		new Notice("Loading PDF...");
		try {
			let fullText = await this.plugin.extractPdfText(this.pdfFile);
			// Limit to 8000 chars like in blog generation
			if (fullText.length > 8000) {
				fullText = fullText.substring(0, 8000);
			}
			this.pdfContent = fullText;
			new Notice("PDF loaded! Ask me anything.");
		} catch (error) {
			new Notice("Failed to load PDF");
			console.error(error);
			return;
		}

		// Chat container
		const chatContainer = contentEl.createDiv("obsixiv-chat-container");
		chatContainer.style.cssText = "max-height: 400px; overflow-y: auto; border: 1px solid var(--background-modifier-border); padding: 10px; margin: 10px 0; border-radius: 5px;";

		// Input container
		const inputContainer = contentEl.createDiv("obsixiv-input-container");
		inputContainer.style.cssText = "display: flex; gap: 10px; margin-top: 10px;";

		const input = inputContainer.createEl("input", {
			type: "text",
			placeholder: "Ask a question about the paper...",
		});
		input.style.cssText = "flex: 1; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 5px;";

		const sendButton = inputContainer.createEl("button", { text: "Send" });
		sendButton.style.cssText = "padding: 8px 16px; border-radius: 5px;";

		const sendQuestion = async () => {
			const question = input.value.trim();
			if (!question) return;

			input.value = "";
			input.disabled = true;
			sendButton.disabled = true;

			// Add user message
			this.addMessage(chatContainer, "user", question);

			try {
				// Call agent
				const answer = await this.plugin.askQuestion(this.pdfContent, question);
				this.addMessage(chatContainer, "assistant", answer);
			} catch (error) {
				this.addMessage(chatContainer, "error", `Error: ${error.message}`);
			}

			input.disabled = false;
			sendButton.disabled = false;
			input.focus();
		};

		sendButton.onclick = sendQuestion;
		input.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				sendQuestion();
			}
		});

		input.focus();
	}

	addMessage(container: HTMLElement, role: string, content: string) {
		const messageDiv = container.createDiv("obsixiv-chat-message");
		messageDiv.style.cssText = `
			margin: 8px 0;
			padding: 8px 12px;
			border-radius: 8px;
			position: relative;
			user-select: text;
			cursor: text;
			${role === "user" ? "background: var(--interactive-accent); color: var(--text-on-accent); margin-left: 20%;" : ""}
			${role === "assistant" ? "background: var(--background-secondary); margin-right: 20%;" : ""}
			${role === "error" ? "background: var(--background-modifier-error); margin-right: 20%;" : ""}
		`;

		// Header with role and copy button
		const headerDiv = messageDiv.createDiv();
		headerDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;";

		const roleSpan = headerDiv.createEl("div", {
			text: role === "user" ? "You" : role === "assistant" ? "🤖 Assistant" : "⚠️ Error",
		});
		roleSpan.style.cssText = "font-size: 0.85em; opacity: 0.8; user-select: none;";

		// Add copy button for assistant messages
		if (role === "assistant") {
			const copyButton = headerDiv.createEl("button", { text: "📋 Copy" });
			copyButton.style.cssText = "padding: 2px 8px; font-size: 0.8em; border-radius: 4px; cursor: pointer; opacity: 0.7; user-select: none;";
			copyButton.onclick = () => {
				navigator.clipboard.writeText(content);
				copyButton.textContent = "✅ Copied!";
				setTimeout(() => {
					copyButton.textContent = "📋 Copy";
				}, 2000);
			};
			copyButton.onmouseenter = () => {
				copyButton.style.opacity = "1";
			};
			copyButton.onmouseleave = () => {
				copyButton.style.opacity = "0.7";
			};
		}

		// Content div for markdown rendering
		const contentDiv = messageDiv.createDiv("obsixiv-chat-content");
		contentDiv.style.cssText = "user-select: text; cursor: text;";
		
		if (role === "user" || role === "error") {
			// Simple text for user messages and errors
			contentDiv.textContent = content;
			contentDiv.style.cssText += " white-space: pre-wrap; word-wrap: break-word;";
		} else {
			// Render markdown for assistant messages
			contentDiv.style.cssText += " line-height: 1.6;";
			MarkdownRenderer.renderMarkdown(content, contentDiv, "", this.plugin);
			
			// Make sure all rendered elements are selectable
			contentDiv.querySelectorAll('*').forEach((el: HTMLElement) => {
				el.style.userSelect = 'text';
			});
		}

		// Scroll to bottom
		container.scrollTop = container.scrollHeight;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ObsiXivSettingTab extends PluginSettingTab {
	plugin: ObsiXivPlugin;

	constructor(app: App, plugin: ObsiXivPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "ObsiXiv Settings" });

		containerEl.createEl("p", {
			text: "Generate AlphaXiv-style blog posts from PDF papers using Koog Agent",
		});

		new Setting(containerEl)
			.setName("AI API Key")
			.setDesc("Your Anthropic Claude API key (or other provider)")
			.addText((text) =>
				text
					.setPlaceholder("sk-ant-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Koog Agent URL")
			.setDesc("URL where Koog Agent is running (default: http://localhost:8080)")
			.addText((text) =>
				text
					.setPlaceholder("http://localhost:8080")
					.setValue(this.plugin.settings.agentUrl)
					.onChange(async (value) => {
						this.plugin.settings.agentUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Output Folder")
			.setDesc("Folder where generated blog posts will be saved")
			.addText((text) =>
				text
					.setPlaceholder("blog-posts")
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Temperature")
			.setDesc(
				"Creativity level (0.0 = focused, 1.0 = creative). Higher = more creative/humorous"
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.1)
					.setValue(this.plugin.settings.temperature)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.temperature = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Include Emojis")
			.setDesc("Add emojis throughout the blog post")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeEmojis)
					.onChange(async (value) => {
						this.plugin.settings.includeEmojis = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Include Humor")
			.setDesc("Add jokes, memes, and humorous commentary")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeHumor)
					.onChange(async (value) => {
						this.plugin.settings.includeHumor = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Advanced Options" });

		new Setting(containerEl)
			.setName("Writing Style")
			.setDesc("Choose the writing style for blog posts")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("alphaxiv", "AlphaXiv (fun & memes)")
					.addOption("technical", "Technical (detailed)")
					.addOption("casual", "Casual (easy to read)")
					.addOption("academic", "Academic (formal)")
					.setValue(this.plugin.settings.writingStyle)
					.onChange(async (value) => {
						this.plugin.settings.writingStyle = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Custom Prompt")
			.setDesc("Add custom instructions for the AI (optional, will be added to the system prompt)")
			.addTextArea((text) =>
				text
					.setPlaceholder("e.g., Focus on the methodology section...\nExplain complex concepts simply...")
					.setValue(this.plugin.settings.customPrompt)
					.onChange(async (value) => {
						this.plugin.settings.customPrompt = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable Caching")
			.setDesc("Cache generated blog posts to speed up re-generation with same settings")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableCache)
					.onChange(async (value) => {
						this.plugin.settings.enableCache = value;
						await this.plugin.saveSettings();
					})
			);

		if (this.plugin.settings.enableCache) {
			new Setting(containerEl)
				.setName("Clear Cache")
				.setDesc(`Currently ${this.plugin.cache.size} cached entries`)
				.addButton((button) =>
					button
						.setButtonText("Clear All Cache")
						.setWarning()
						.onClick(async () => {
							this.plugin.cache.clear();
							await this.plugin.saveCache();
							new Notice("✅ Cache cleared!");
							this.display(); // Refresh settings
						})
				);
		}

		containerEl.createEl("h3", { text: "Setup" });
		containerEl.createEl("p", {
			text: "1. Start Koog Agent: cd koog-agent && docker-compose up",
		});
		containerEl.createEl("p", {
			text: "2. Add your Anthropic API key above",
		});
		containerEl.createEl("p", {
			text: "3. Make sure Agent URL is correct (default: http://localhost:8080)",
		});
		
		containerEl.createEl("h3", { text: "How to Use" });
		containerEl.createEl("p", {
			text: "1. Open a PDF file in Obsidian",
		});
		containerEl.createEl("p", {
			text: '2. Right-click → "Generate AlphaXiv blog post" or use Cmd/Ctrl+P',
		});
		containerEl.createEl("p", {
			text: "3. Wait ~30-60 seconds for generation",
		});
		containerEl.createEl("p", {
			text: "4. Blog post will open automatically! ✨",
		});
	}
}

