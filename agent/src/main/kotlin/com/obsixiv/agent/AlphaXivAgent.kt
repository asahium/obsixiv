package com.obsixiv.agent

import com.obsixiv.models.PerplexityMessage
import com.obsixiv.models.PerplexityRequest
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
        includeHumor: Boolean = true,
        customPrompt: String = "",
        writingStyle: String = "alphaxiv",
        extractedImages: List<String> = emptyList()
    ): String {
        // Build style instructions based on writing style
        val styleDesc = when(writingStyle) {
            "technical" -> "Write in a detailed technical style, focusing on methodology, algorithms, and implementation details. Use precise terminology."
            "casual" -> "Write in a casual, easy-to-read style. Explain concepts simply without jargon. Make it accessible to beginners."
            "academic" -> "Write in a formal academic style with proper citations, structured sections, and scholarly tone."
            else -> "Write in the AlphaXiv style: entertaining, accessible, with creative commentary, memes references, and emojis."
        }
        
        val customInstructions = if (customPrompt.isNotEmpty()) "\n\nAdditional instructions: $customPrompt" else ""
        val emojiHumorInstructions = buildStyleInstructions(includeEmojis, includeHumor)
        
        val systemPrompt = """
            You are an expert at writing engaging, consistent blog posts about academic papers in the AlphaXiv style.
            
            Style: $styleDesc
            $emojiHumorInstructions
            
            ═══════════════════════════════════════════════════════════════
            📋 MANDATORY STRUCTURE - FOLLOW THIS EXACTLY FOR EVERY POST:
            ═══════════════════════════════════════════════════════════════
            
            # 🎯 [Creative Title with Emojis]
            > **Paper**: [Exact Title] | **Authors**: [First Author et al.] | **Year**: [YYYY]
            
            ---
            
            ## 🔥 TL;DR
            [2-3 sentences. Hook the reader with the most exciting finding. Use bold for key terms.]
            
            ---
            
            ## 🤔 The Problem
            [Explain what sucks about current approaches. Make it relatable. 3-4 sentences.]
            
            **Why this matters:** [1 sentence on real-world impact]
            
            ---
            
            ## 💡 The Big Idea
            [Core innovation explained simply. Use analogies. 4-5 sentences.]
            
            **In other words:** [One-line ELI5 explanation]
            
            ---
            
            ## 🔧 How It Works
            [Technical details broken down into digestible chunks. Use numbered lists or bullet points.]
            
            **Key Components:**
            1. **[Component 1]**: [What it does]
            2. **[Component 2]**: [What it does]
            3. **[Component 3]**: [What it does]
            
            ---
            
            ## 🔢 Key Formulas
            
            $$[Formula in LaTeX]$$
            
            **Translation:** [What this means in plain English]
            - **[Variable]**: [What it represents]
            
            ---
            
            ## 📊 Results That Matter
            [Quantitative results with exact numbers. Use tables or bullet points.]
            
            | Metric | Baseline | This Paper | Improvement |
            |--------|----------|------------|-------------|
            | [Metric 1] | [X] | [Y] | **+Z%** ✨ |
            | [Metric 2] | [X] | [Y] | **+Z%** 🚀 |
            
            **Key Takeaway:** [One sentence on what these numbers mean]
            
            ---
            
            ## 🎨 Why This Is Cool
            [Creative commentary. Memes, analogies, hot takes. 3-4 sentences. Be entertaining.]
            
            ---
            
            ## ⚠️ Limitations & Caveats
            - **[Limitation 1]**: [Why it matters]
            - **[Limitation 2]**: [Why it matters]
            
            ---
            
            ## 🔮 Future Directions
            [What's next? Where could this go? 2-3 bullets.]
            
            ---
            
            ## 💭 Final Thoughts
            [Your hot take. What does this mean for the field? 2-3 sentences. End with impact.]
            
            ---
            
            **Tags:** #[Keyword1] #[Keyword2] #[Keyword3] #[Field] #ML #AI
            
            ═══════════════════════════════════════════════════════════════
            🎨 STYLE GUIDELINES - APPLY TO EVERY SECTION:
            ═══════════════════════════════════════════════════════════════
            
            **Emojis Usage:**
            - Title: 1-2 relevant emojis
            - Section headers: ALWAYS use the exact emojis shown above
            - In-text: Sprinkle throughout (🚀 for improvements, ✨ for highlights, 💪 for strength, 🤔 for questions, 😅 for humor)
            - Results: Use ✅ for success, 📈 for growth, 🎯 for targets
            
            **Formatting Rules:**
            - Use **bold** for all key terms, metrics, and important phrases
            - Use *italics* for emphasis or quotes
            - Use code formatting (backticks) for technical terms, variable names, model names
            - Use > blockquotes for important takeaways
            - Use --- for section dividers (horizontal rules)
            - Use tables for comparisons (always include headers)
            - **Math formulas**: Use double dollar signs for display math (block formulas) and single dollar signs for inline math
              - Example block: ${"$$"}$\mathcal{L} = \sum_{i=1}^N \log p(y_i|x_i)${"$$"}
              - Example inline: The loss function ${"$"}\mathcal{L}${" $"} measures...
              - **NEVER use** square brackets with backslash - they don't render in Markdown
            
            **Tone Consistency:**
            - Enthusiastic but not annoying
            - Accessible but technically accurate
            - Humorous but respectful to authors
            - Critical but constructive
            
            **Number Formatting:**
            - Always include exact numbers: "92.4% accuracy" not "high accuracy"
            - Show improvements: "3.2x faster" or "+15.3% improvement"
            - Use bold for impressive numbers: **92.4%**
            
            **Lists:**
            - Use numbered lists for sequential steps
            - Use bullet points for parallel items
            - Maximum 5-7 items per list
            - Each item starts with **bold term**: followed by explanation
            
            ═══════════════════════════════════════════════════════════════
            ⚠️ CRITICAL REQUIREMENTS:
            ═══════════════════════════════════════════════════════════════
            
            1. **ALWAYS** follow the structure above, in that exact order
            2. **ALWAYS** include quantitative results with exact numbers
            3. **ALWAYS** use the specified emojis for each section header
            4. **ALWAYS** include horizontal rules (---) between major sections
            5. **ALWAYS** end with tags
            6. **NEVER** skip sections (except 🔢 Key Formulas if no math)
            7. **NEVER** use generic phrases like "impressive results" - give numbers!
            8. **NEVER** forget the metadata quote block at the top
            
            $customInstructions
        """.trimIndent()
        
        val prompt = buildPrompt(pdfContent, extractedImages)
        
        // Determine API based on key format
        return when {
            apiKey.startsWith("pplx-") -> generateWithPerplexity(apiKey, systemPrompt, prompt, temperature)
            apiKey.startsWith("sk-ant-") -> generateWithClaude(apiKey, systemPrompt, prompt, temperature)
            apiKey.startsWith("sk-") -> generateWithOpenAI(apiKey, systemPrompt, prompt, temperature)
            apiKey.startsWith("http://") || apiKey.startsWith("https://") -> {
                // Local model (Ollama, LM Studio, etc.) - format: http://localhost:11434|model_name
                generateWithLocalModel(apiKey, systemPrompt, prompt, temperature)
            }
            else -> throw Exception("Unknown API key format. Supported: Perplexity (pplx-), Claude (sk-ant-), OpenAI (sk-), Local (http://...)")
        }
    }
    
    private suspend fun generateWithPerplexity(apiKey: String, systemPrompt: String, prompt: String, temperature: Double): String {
        // Use proper serialization instead of manual JSON construction
        val request = PerplexityRequest(
            model = "sonar-pro",
            messages = listOf(
                PerplexityMessage(role = "system", content = systemPrompt),
                PerplexityMessage(role = "user", content = prompt)
            ),
            temperature = temperature,
            max_tokens = 4000
        )
        
        val response = client.post("https://api.perplexity.ai/chat/completions") {
            header("Authorization", "Bearer $apiKey")
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        
        val responseText: String = response.body()
        println("🔍 Perplexity response: ${responseText.take(500)}")
        
        val json = Json.parseToJsonElement(responseText).jsonObject
        println("📦 Parsed JSON keys: ${json.keys}")
        
        val choices = json["choices"]?.jsonArray
        println("📋 Choices count: ${choices?.size}")
        
        val firstChoice = choices?.firstOrNull()?.jsonObject
        println("🎯 First choice keys: ${firstChoice?.keys}")
        
        val message = firstChoice?.get("message")?.jsonObject
        println("💬 Message keys: ${message?.keys}")
        
        val content = message?.get("content")?.jsonPrimitive?.content
        println("✍️ Content length: ${content?.length ?: 0}")
        
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
    
    private suspend fun generateWithLocalModel(apiConfig: String, systemPrompt: String, prompt: String, temperature: Double): String {
        // Format: http://localhost:11434|llama3.1 (URL|model_name)
        val parts = apiConfig.split("|")
        val baseUrl = parts[0].trim()
        val modelName = parts.getOrNull(1)?.trim() ?: "llama3.1" // Default model
        
        println("🏠 Using local model: $modelName at $baseUrl")
        
        val request = PerplexityRequest( // Reuse same structure as OpenAI-compatible
            model = modelName,
            messages = listOf(
                PerplexityMessage(role = "system", content = systemPrompt),
                PerplexityMessage(role = "user", content = prompt)
            ),
            temperature = temperature,
            max_tokens = 4000
        )
        
        // OpenAI-compatible endpoint (Ollama, LM Studio use /v1/chat/completions)
        val endpoint = if (baseUrl.contains("/v1/")) baseUrl else "$baseUrl/v1/chat/completions"
        
        val response = client.post(endpoint) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        
        val responseText: String = response.body()
        println("🏠 Local model response: ${responseText.take(200)}")
        
        val json = Json.parseToJsonElement(responseText).jsonObject
        
        // Handle error response
        if (json.containsKey("error")) {
            val errorMsg = json["error"]?.jsonObject?.get("message")?.jsonPrimitive?.content
            throw Exception("Local model error: $errorMsg")
        }
        
        val choices = json["choices"]?.jsonArray
        val firstChoice = choices?.firstOrNull()?.jsonObject
        val message = firstChoice?.get("message")?.jsonObject
        val content = message?.get("content")?.jsonPrimitive?.content
        
        return content ?: throw Exception("Empty response from local model")
    }
    
    suspend fun answerQuestion(
        pdfContent: String,
        question: String,
        apiKey: String,
        temperature: Double = 0.7
    ): String {
        val prompt = """
            Based on the following PDF content, answer the question.
            
            PDF Content:
            $pdfContent
            
            Question: $question
            
            Please provide a clear, concise, and helpful answer based on the content provided.
        """.trimIndent()
        
        val systemPrompt = "You are a helpful research assistant. Answer questions about academic papers clearly and accurately."
        
        return when {
            apiKey.startsWith("pplx-") -> generateWithPerplexity(apiKey, systemPrompt, prompt, temperature)
            apiKey.startsWith("sk-ant-") -> generateWithClaude(apiKey, systemPrompt, prompt, temperature)
            apiKey.startsWith("sk-") -> generateWithOpenAI(apiKey, systemPrompt, prompt, temperature)
            apiKey.startsWith("http://") || apiKey.startsWith("https://") -> generateWithLocalModel(apiKey, systemPrompt, prompt, temperature)
            else -> throw Exception("Unknown API key format")
        }
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
    
    private fun buildPrompt(pdfContent: String, extractedImages: List<String> = emptyList()): String {
        val truncatedContent = if (pdfContent.length > 60000) {
            pdfContent.substring(0, 60000) + "\n\n[... content truncated ...]"
        } else {
            pdfContent
        }
        
        val imageSection = if (extractedImages.isNotEmpty()) {
            val imageList = extractedImages.joinToString("\n") { "  - $it" }
            """
            
            🖼️ AVAILABLE FIGURES (extracted from LaTeX source):
            
            $imageList
            
            **CRITICAL INSTRUCTIONS FOR USING FIGURES:**
            
            ⚠️ **SYNTAX:** Use EXACTLY this format: ![[figures_folder/EXACT_FILENAME]]
            
            ✅ CORRECT Examples:
              - ![[figures_folder/framework.pdf]]
              - ![[figures_folder/architecture_diagram.png]]
              - ![[figures_folder/results_table.pdf]]
            
            ❌ WRONG Examples:
              - ![Description|figures_folder/file.jpg]  ← NO alt text syntax!
              - ![[Text|figures_folder/file.jpg]]  ← NO pipe character!
              - ![[figures_folder/file.jpg]]  ← Must use .pdf if file is .pdf!
            
            **RULES:**
            1. **Use EXACT filenames** from the list above - DO NOT change file extensions!
            2. **Select 2-4 most important figures** - prioritize: architecture, model, results, framework, comparison
            3. **Simple syntax only:** ![[figures_folder/exact_filename.ext]]
            4. **Place contextually** in relevant sections (after section headers)
            5. **NO alt text, NO descriptions inside brackets** - keep it clean and simple
            6. If the original file is .pdf, keep .pdf - if .png, keep .png - DO NOT change extensions!
            
            """.trimIndent()
        } else {
            ""
        }
        
        return """
            Please read this academic paper and generate a blog post following the EXACT structure and style guidelines provided in the system prompt.
            
            📄 PAPER CONTENT:
            
            $truncatedContent
            $imageSection
            
            ═══════════════════════════════════════════════════════════════
            
            Now generate the blog post in Markdown format, following ALL structure requirements, emoji usage, and formatting rules specified above.
            
            Remember:
            - Use the EXACT section headers with their emojis (🔥 TL;DR, 🤔 The Problem, etc.)
            - Include quantitative results with exact numbers
            - Add horizontal rules (---) between sections
            - Include the metadata quote block at the top
            - End with tags
            
            Begin the blog post now:
        """.trimIndent()
    }
}

