package com.obsixiv.routes

import com.obsixiv.agent.AlphaXivAgent
import com.obsixiv.models.GenerateBlogPostRequest
import com.obsixiv.models.GenerateBlogPostResponse
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.generateBlogPostRoute() {
    val agent = AlphaXivAgent()
    
    post("/generate") {
        try {
            val request = call.receive<GenerateBlogPostRequest>()
            
            // Validate API key from headers
            val apiKey = call.request.headers["X-API-Key"]
            if (apiKey.isNullOrBlank()) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "API key required"))
                return@post
            }
            
            // Generate blog post using Koog agent
            val blogPost = agent.generateBlogPost(
                pdfContent = request.pdfContent,
                apiKey = apiKey,
                temperature = request.temperature,
                includeEmojis = request.includeEmojis,
                includeHumor = request.includeHumor
            )
            
            call.respond(HttpStatusCode.OK, GenerateBlogPostResponse(
                blogPost = blogPost,
                success = true
            ))
            
        } catch (e: Exception) {
            call.respond(HttpStatusCode.InternalServerError, mapOf(
                "error" to "Failed to generate blog post: ${e.message}"
            ))
        }
    }
}

fun Route.healthCheckRoute() {
    get("/health") {
        call.respond(HttpStatusCode.OK, mapOf(
            "status" to "ok",
            "service" to "obsixiv-koog-agent",
            "version" to "1.0.0"
        ))
    }
}

