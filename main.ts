import {
	App,
	Editor,
	MarkdownView,
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
}

const DEFAULT_SETTINGS: ObsiXivSettings = {
	apiKey: "",
	agentUrl: "http://localhost:8080",
	outputFolder: "blog-posts",
	temperature: 0.8,
	includeEmojis: true,
	includeHumor: true,
};

export default class ObsiXivPlugin extends Plugin {
	settings: ObsiXivSettings;

	async onload() {
		await this.loadSettings();

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

		try {
			// Extract PDF content
			const pdfContent = await this.extractPdfText(pdfFile);

			if (!pdfContent || pdfContent.length < 100) {
				new Notice("Could not extract enough text from PDF");
				return;
			}

			new Notice("Generating blog post with Koog Agent...");

			// Generate blog post using Koog Agent
			const blogPost = await this.generateBlogPostWithKoogAgent(pdfContent);

			// Save blog post
			await this.saveBlogPost(pdfFile.basename, blogPost);

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

	async generateBlogPostWithKoogAgent(pdfContent: string): Promise<string> {
		try {
			const response = await requestUrl({
				url: `${this.settings.agentUrl}/api/v1/generate`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": this.settings.apiKey,
				},
				body: JSON.stringify({
					pdfContent: pdfContent,
					temperature: this.settings.temperature,
					includeEmojis: this.settings.includeEmojis,
					includeHumor: this.settings.includeHumor,
				}),
			});

			const data = response.json;

			if (data.success && data.blogPost) {
				return data.blogPost;
			} else {
				throw new Error(data.error || "No response from Koog Agent");
			}
		} catch (error) {
			console.error("Koog Agent error:", error);
			throw new Error(`Koog Agent error: ${error.message}`);
		}
	}


	async saveBlogPost(originalFilename: string, blogPost: string) {
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

		// Add frontmatter
		const frontmatter = `---
title: "${originalFilename}"
source_pdf: "${originalFilename}.pdf"
generated: ${new Date().toISOString()}
generator: ObsiXiv
---

`;

		const fullContent = frontmatter + blogPost;

		// Create the file
		await this.app.vault.create(filename, fullContent);

		// Open the new file
		const file = this.app.vault.getAbstractFileByPath(filename);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		}
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

