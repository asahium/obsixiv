package com.obsixiv.agent

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class ClaudeMessage(
    val role: String,
    val content: String
)

@Serializable
data class ClaudeRequest(
    val model: String,
    val max_tokens: Int,
    val temperature: Double,
    val messages: List<ClaudeMessage>
)

@Serializable
data class ClaudeContent(
    val type: String,
    val text: String
)

@Serializable
data class ClaudeResponse(
    val content: List<ClaudeContent>
)

class AlphaXivAgent {
    
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
            })
        }
    }
    
    suspend fun generateBlogPost(
        pdfContent: String,
        apiKey: String,
        temperature: Double = 0.8,
        includeEmojis: Boolean = true,
        includeHumor: Boolean = true
    ): String {
        // Build prompt based on settings
        val styleInstructions = buildStyleInstructions(includeEmojis, includeHumor)
        val prompt = buildPrompt(pdfContent, styleInstructions)
        
        // Call Claude API directly
        val systemPrompt = """
            You are an expert at writing engaging, humorous, and informative blog posts about 
            academic papers in the style of AlphaXiv. Your posts should be entertaining, 
            accessible, and include creative commentary, memes references, and emojis.
        """.trimIndent()
        
        val request = ClaudeRequest(
            model = "claude-sonnet-4-20250514",
            max_tokens = 4000,
            temperature = temperature,
            messages = listOf(
                ClaudeMessage(role = "user", content = "$systemPrompt\n\n$prompt")
            )
        )
        
        val response = client.post("https://api.anthropic.com/v1/messages") {
            header("x-api-key", apiKey)
            header("anthropic-version", "2023-06-01")
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        
        val claudeResponse: ClaudeResponse = response.body()
        return claudeResponse.content.firstOrNull()?.text ?: throw Exception("Empty response from Claude API")
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

