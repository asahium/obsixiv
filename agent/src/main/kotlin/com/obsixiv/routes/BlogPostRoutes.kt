package com.obsixiv.routes

import com.obsixiv.agent.AlphaXivAgent
import com.obsixiv.models.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.text.PDFTextStripper
import java.io.ByteArrayInputStream
import java.util.Base64

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
                writingStyle = request.writingStyle,
                extractedImages = request.extractedImages
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

fun Route.extractPdfRoute() {
    post("/extract-pdf") {
        try {
            println("📄 Received PDF extraction request")
            val request = call.receive<ExtractPdfRequest>()
            println("✅ Request parsed. Filename: ${request.filename}")
            
            // Decode base64 PDF
            val pdfBytes = Base64.getDecoder().decode(request.pdfBase64)
            println("📥 Decoded PDF. Size: ${pdfBytes.size} bytes")
            
            // Extract text using PDFBox
            val text = ByteArrayInputStream(pdfBytes).use { inputStream ->
                PDDocument.load(inputStream).use { document ->
                    val stripper = PDFTextStripper()
                    val extractedText = stripper.getText(document)
                    println("✅ Extracted ${extractedText.length} characters from ${document.numberOfPages} pages")
                    extractedText
                }
            }
            
            call.respond(HttpStatusCode.OK, ExtractPdfResponse(
                text = text,
                success = true
            ))
            
        } catch (e: Exception) {
            println("❌ ERROR: ${e.javaClass.simpleName}: ${e.message}")
            e.printStackTrace()
            call.respond(HttpStatusCode.InternalServerError, ExtractPdfResponse(
                text = "",
                success = false,
                error = "Failed to extract PDF text: ${e.message}"
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

