package com.obsixiv.models

import kotlinx.serialization.Serializable

@Serializable
data class ArxivMetadata(
    val arxivId: String? = null,
    val title: String? = null,
    val authors: List<String>? = null,
    val summary: String? = null,
    val published: String? = null,
    val updated: String? = null,
    val categories: List<String>? = null,
    val url: String? = null
)

@Serializable
data class GenerateBlogPostRequest(
    val pdfContent: String,
    val temperature: Double = 0.8,
    val includeEmojis: Boolean = true,
    val includeHumor: Boolean = true,
    val customPrompt: String = "",
    val writingStyle: String = "alphaxiv",
    val arxivMetadata: ArxivMetadata? = null,
    val extractedImages: List<String> = emptyList()
)

@Serializable
data class GenerateBlogPostResponse(
    val blogPost: String,
    val success: Boolean,
    val error: String? = null
)

@Serializable
data class ChatRequest(
    val pdfContent: String,
    val question: String,
    val temperature: Double = 0.7
)

@Serializable
data class ChatResponse(
    val answer: String,
    val success: Boolean
)

@Serializable
data class ExtractPdfRequest(
    val pdfBase64: String,
    val filename: String = "document.pdf"
)

@Serializable
data class ExtractPdfResponse(
    val text: String,
    val success: Boolean,
    val error: String? = null
)

@Serializable
data class PerplexityRequest(
    val model: String,
    val messages: List<PerplexityMessage>,
    val temperature: Double,
    val max_tokens: Int
)

@Serializable
data class PerplexityMessage(
    val role: String,
    val content: String
)

