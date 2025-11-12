package com.obsixiv.routes

import com.obsixiv.agent.AlphaXivAgent
import com.obsixiv.models.GenerateBlogPostRequest
import com.obsixiv.models.GenerateBlogPostResponse
import com.obsixiv.models.ChatRequest
import com.obsixiv.models.ChatResponse
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.generateBlogPostRoute() {
    val agent = AlphaXivAgent()
    
    post("/generate") {
        try {
            println("📥 Received generate request")
            val request = call.receive<GenerateBlogPostRequest>()
            println("✅ Request parsed. PDF content length: ${request.pdfContent.length}")
            
            // Validate API key from headers
            val apiKey = call.request.headers["X-API-Key"]
            if (apiKey.isNullOrBlank()) {
                println("❌ No API key provided")
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "API key required"))
                return@post
            }
            
            println("🔑 API key: ${apiKey.take(10)}...")
            println("🤖 Calling agent...")
            
            // Generate blog post using Koog agent
            val blogPost = agent.generateBlogPost(
                pdfContent = request.pdfContent,
                apiKey = apiKey,
                temperature = request.temperature,
                includeEmojis = request.includeEmojis,
                includeHumor = request.includeHumor,
                customPrompt = request.customPrompt,
                writingStyle = request.writingStyle
            )
            
            println("✅ Blog post generated! Length: ${blogPost.length}")
            
            call.respond(HttpStatusCode.OK, GenerateBlogPostResponse(
                blogPost = blogPost,
                success = true
            ))
            
        } catch (e: Exception) {
            println("❌ ERROR: ${e.javaClass.simpleName}: ${e.message}")
            e.printStackTrace()
            call.respond(HttpStatusCode.InternalServerError, mapOf(
                "error" to "Failed to generate blog post: ${e.message}"
            ))
        }
    }
}

fun Route.chatRoute() {
    val agent = AlphaXivAgent()
    
    post("/chat") {
        try {
            println("💬 Received chat request")
            val request = call.receive<ChatRequest>()
            println("✅ Question: ${request.question.take(100)}...")
            
            val apiKey = call.request.headers["X-API-Key"]
            if (apiKey.isNullOrBlank()) {
                println("❌ No API key provided")
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "API key required"))
                return@post
            }
            
            println("🤖 Generating answer...")
            val answer = agent.answerQuestion(
                pdfContent = request.pdfContent,
                question = request.question,
                apiKey = apiKey,
                temperature = request.temperature
            )
            
            println("✅ Answer generated! Length: ${answer.length}")
            call.respond(HttpStatusCode.OK, ChatResponse(
                answer = answer,
                success = true
            ))
            
        } catch (e: Exception) {
            println("❌ ERROR: ${e.javaClass.simpleName}: ${e.message}")
            e.printStackTrace()
            call.respond(HttpStatusCode.InternalServerError, mapOf(
                "error" to "Failed to answer question: ${e.message}"
            ))
        }
    }
}

fun Route.healthCheckRoute() {
    get("/health") {
        call.respond(HttpStatusCode.OK, mapOf(
            "status" to "ok",
            "service" to "obsixiv-agent",
            "version" to "1.0.0"
        ))
    }
}

