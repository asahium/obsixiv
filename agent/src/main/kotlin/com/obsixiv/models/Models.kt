package com.obsixiv.models

import kotlinx.serialization.Serializable

@Serializable
data class GenerateBlogPostRequest(
    val pdfContent: String,
    val temperature: Double = 0.8,
    val includeEmojis: Boolean = true,
    val includeHumor: Boolean = true,
    val customPrompt: String = "",
    val writingStyle: String = "alphaxiv"
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

