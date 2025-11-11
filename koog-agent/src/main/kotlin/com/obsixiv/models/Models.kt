package com.obsixiv.models

import kotlinx.serialization.Serializable

@Serializable
data class GenerateBlogPostRequest(
    val pdfContent: String,
    val temperature: Double = 0.8,
    val includeEmojis: Boolean = true,
    val includeHumor: Boolean = true
)

@Serializable
data class GenerateBlogPostResponse(
    val blogPost: String,
    val success: Boolean,
    val error: String? = null
)

