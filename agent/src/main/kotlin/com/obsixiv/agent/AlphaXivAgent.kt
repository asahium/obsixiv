package com.obsixiv.agent

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

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

@Serializable
data class PerplexityResponse(
    val choices: List<PerplexityChoice>
)

@Serializable
data class PerplexityChoice(
    val message: PerplexityMessage
)

@Serializable
data class PerplexityMessage(
    val content: String
)

class AlphaXivAgent {
    
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
            })
        }
        
        engine {
            requestTimeout = 60_000  // 60 seconds
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
        
        // Determine API based on key prefix
        return when {
            apiKey.startsWith("pplx-") -> generateWithPerplexity(apiKey, systemPrompt, prompt, temperature)
            apiKey.startsWith("sk-ant-") -> generateWithClaude(apiKey, systemPrompt, prompt, temperature)
            apiKey.startsWith("sk-") -> generateWithOpenAI(apiKey, systemPrompt, prompt, temperature)
            else -> throw Exception("Unknown API key format. Supported: Perplexity (pplx-), Claude (sk-ant-), OpenAI (sk-)")
        }
    }
    
    private suspend fun generateWithPerplexity(apiKey: String, systemPrompt: String, prompt: String, temperature: Double): String {
        val escapedSystemPrompt = systemPrompt.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
        val escapedPrompt = prompt.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
        
        val requestBody = """
            {
                "model": "sonar-pro",
                "messages": [
                    {"role": "system", "content": "$escapedSystemPrompt"},
                    {"role": "user", "content": "$escapedPrompt"}
                ],
                "temperature": $temperature,
                "max_tokens": 4000
            }
        """.trimIndent()
        
        val response = client.post("https://api.perplexity.ai/chat/completions") {
            header("Authorization", "Bearer $apiKey")
            contentType(ContentType.Application.Json)
            setBody(requestBody)
        }
        
        val responseText: String = response.body()
        val json = Json.parseToJsonElement(responseText).jsonObject
        val choices = json["choices"]?.jsonArray
        val firstChoice = choices?.firstOrNull()?.jsonObject
        val message = firstChoice?.get("message")?.jsonObject
        val content = message?.get("content")?.jsonPrimitive?.content
        
        return content ?: throw Exception("Empty response from Perplexity")
    }
    
    private suspend fun generateWithClaude(apiKey: String, systemPrompt: String, prompt: String, temperature: Double): String {
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
        return claudeResponse.content.firstOrNull()?.text ?: throw Exception("Empty response from Claude")
    }
    
    private suspend fun generateWithOpenAI(apiKey: String, systemPrompt: String, prompt: String, temperature: Double): String {
        val escapedSystemPrompt = systemPrompt.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
        val escapedPrompt = prompt.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
        
        val requestBody = """
            {
                "model": "gpt-4o",
                "messages": [
                    {"role": "system", "content": "$escapedSystemPrompt"},
                    {"role": "user", "content": "$escapedPrompt"}
                ],
                "temperature": $temperature,
                "max_tokens": 4000
            }
        """.trimIndent()
        
        val response = client.post("https://api.openai.com/v1/chat/completions") {
            header("Authorization", "Bearer $apiKey")
            contentType(ContentType.Application.Json)
            setBody(requestBody)
        }
        
        val responseText: String = response.body()
        val json = Json.parseToJsonElement(responseText).jsonObject
        val choices = json["choices"]?.jsonArray
        val firstChoice = choices?.firstOrNull()?.jsonObject
        val message = firstChoice?.get("message")?.jsonObject
        val content = message?.get("content")?.jsonPrimitive?.content
        
        return content ?: throw Exception("Empty response from OpenAI")
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

