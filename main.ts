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
				await this.generateBlogPostFromActivePdf();
			}
		);
		ribbonIconEl.addClass("obsixiv-ribbon-class");

		// Add command
		this.addCommand({
			id: "generate-alphaxiv-post",
			name: "Generate AlphaXiv blog post from PDF",
			callback: async () => {
				await this.generateBlogPostFromActivePdf();
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
			// Get PDF as array buffer
			const arrayBuffer = await this.app.vault.readBinary(pdfFile);

			// Use pdfjs-dist to extract text
			const pdfjsLib = await this.loadPdfJs();
			const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
			const pdf = await loadingTask.promise;

			let fullText = "";

			// Extract text from all pages
			for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
				const page = await pdf.getPage(pageNum);
				const textContent = await page.getTextContent();
				const pageText = textContent.items
					.map((item: any) => item.str)
					.join(" ");
				fullText += pageText + "\n\n";
			}

			return fullText;
		} catch (error) {
			console.error("Error extracting PDF text:", error);
			throw new Error("Failed to extract text from PDF");
		}
	}

	async loadPdfJs() {
		// Dynamically import pdfjs-dist
		// @ts-ignore
		const pdfjsLib = await import("pdfjs-dist");

		// Set worker path
		// @ts-ignore
		const pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.entry");
		pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

		return pdfjsLib;
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
		roleSpan.style.cssText = "font-size: 0.85em; opacity: 0.8;";

		// Add copy button for assistant messages
		if (role === "assistant") {
			const copyButton = headerDiv.createEl("button", { text: "📋 Copy" });
			copyButton.style.cssText = "padding: 2px 8px; font-size: 0.8em; border-radius: 4px; cursor: pointer; opacity: 0.7;";
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
		
		if (role === "user" || role === "error") {
			// Simple text for user messages and errors
			contentDiv.textContent = content;
		} else {
			// Render markdown for assistant messages
			contentDiv.style.cssText = "line-height: 1.6;";
			MarkdownRenderer.renderMarkdown(content, contentDiv, "", this.plugin);
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

