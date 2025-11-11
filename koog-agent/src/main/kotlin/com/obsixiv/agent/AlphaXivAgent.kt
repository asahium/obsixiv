package com.obsixiv.agent

import ai.koog.agent.Agent
import ai.koog.agent.AgentConfig
import ai.koog.models.ModelProvider
import ai.koog.prompt.PromptTemplate

class AlphaXivAgent {
    
    suspend fun generateBlogPost(
        pdfContent: String,
        apiKey: String,
        temperature: Double = 0.8,
        includeEmojis: Boolean = true,
        includeHumor: Boolean = true
    ): String {
        // Configure Koog agent
        val config = AgentConfig(
            name = "AlphaXiv Blog Generator",
            model = ModelProvider.ANTHROPIC_CLAUDE_SONNET_4,
            apiKey = apiKey,
            temperature = temperature,
            maxTokens = 4000
        )
        
        val agent = Agent(config)
        
        // Build prompt based on settings
        val styleInstructions = buildStyleInstructions(includeEmojis, includeHumor)
        
        val prompt = buildPrompt(pdfContent, styleInstructions)
        
        // Generate blog post using Koog agent
        val response = agent.generate(prompt)
        
        return response.content
    }
    
    private fun buildStyleInstructions(includeEmojis: Boolean, includeHumor: Boolean): String {
        val instructions = mutableListOf<String>()
        
        if (includeEmojis) {
            instructions.add("Use emojis generously throughout the text")
        }
        
        if (includeHumor) {
            instructions.add("Include jokes, memes references, and humorous commentary")
        }
        
        return instructions.joinToString(". ")
    }
    
    private fun buildPrompt(pdfContent: String, styleInstructions: String): String {
        val truncatedContent = if (pdfContent.length > 60000) {
            pdfContent.substring(0, 60000) + "\n\n[... content truncated ...]"
        } else {
            pdfContent
        }
        
        return """
            You are an expert at writing engaging, humorous, and informative blog posts about academic papers 
            in the style of AlphaXiv. Your posts should be entertaining, accessible, and include creative 
            commentary, memes references, and emojis.
            
            $styleInstructions
            
            Please read this academic paper and generate an engaging AlphaXiv-style blog post about it.
            
            The blog post should include:
            1. A catchy title with emojis
            2. A TL;DR section that summarizes the key findings in simple terms
            3. An introduction that hooks the reader
            4. Main sections covering:
               - What problem the paper solves
               - The key innovation/approach
               - Results and why they matter
               - Limitations and future work
            5. A conclusion with your hot takes
            6. Use Markdown formatting extensively (headers, bold, italics, lists, quotes)
            7. Include creative commentary and make it entertaining to read
            8. Add section dividers and visual breaks
            9. Keep technical accuracy but make it accessible
            
            Here's the paper content:
            
            ---
            
            $truncatedContent
            
            ---
            
            Generate the blog post in Markdown format:
        """.trimIndent()
    }
}

