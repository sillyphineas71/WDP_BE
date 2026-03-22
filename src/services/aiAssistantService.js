import { GoogleGenerativeAI } from "@google/generative-ai";
import { Material, ClassStreamPost } from "../models/index.js";
import { AppError } from "../errors/AppError.js";
import mammoth from "mammoth";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generate AI study assistant response for a class chat
 * @param {Object} params
 * @param {string} params.classId - UUID of the class
 * @param {string} params.message - Current user message
 * @param {Array} params.history - Previous chat history [{ role: 'user'|'model', text: '...' }]
 * @returns {Promise<string>} AI response text
 */
export const getClassChatResponse = async ({ classId, message, history = [] }) => {
    try {
        // 1. Fetch Class Context
        const materials = await Material.findAll({
            where: { class_id: classId, is_visible: true },
            attributes: ["title", "description", "type", "original_filename", "file_url"],
            raw: true
        });

        const streamPosts = await ClassStreamPost.findAll({
            where: { class_id: classId },
            limit: 10,
            order: [['created_at', 'DESC']],
            attributes: ["content"],
            raw: true
        });

        // 2. Format Context for Prompt
        let contextText = "--- BỐI CẢNH LỚP HỌC ---\n";
        let chatHistoryParts = []; // To store inlineData nodes for images
        
        let materialsText = "";
        let contentCap = 10000; // Character cap for all extracted content to avoid huge prompts

        if (materials.length > 0) {
            materialsText += "\n[Tài liệu học tập tải lên bởi Giáo viên]:\n";
            
            for (const [index, m] of materials.entries()) {
                materialsText += `${index + 1}. Tên: "${m.title}" | Loại: ${m.type} | Mô tả: ${m.description || "Không có mô tả"}\n`;
                
                if (m.type === "link") {
                    materialsText += `   -> Liên kết hỗ trợ: ${m.file_url}\n`;
                    continue;
                }

                if (materialsText.length > contentCap) continue; 

                // Fetch and parse file contents
                if (m.file_url && m.file_url.startsWith("http")) {
                    try {
                        const response = await fetch(m.file_url);
                        const arrayBuffer = await response.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        const fileName = (m.original_filename || m.file_url || "").toLowerCase();

                        if (m.type === "doc" || fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
                            const result = await mammoth.extractRawText({ buffer: buffer });
                            if (result.value) {
                                materialsText += `   -> Nội dung văn bản chi tiết:\n"""\n${result.value.substring(0, 3000)}\n"""\n`;
                            }
                        } else if (m.type === "pdf" || fileName.endsWith('.pdf')) {
                            const data = await pdf(buffer);
                            if (data.text) {
                                materialsText += `   -> Nội dung văn bản chi tiết:\n"""\n${data.text.substring(0, 3000)}\n"""\n`;
                            }
                        } else if (m.type === "image" || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
                            let mimeType = fileName.endsWith('.png') ? "image/png" : "image/jpeg";
                            chatHistoryParts.push({
                                inlineData: { data: buffer.toString("base64"), mimeType: mimeType }
                            });
                            materialsText += `   -> (Đã nạp Hình ảnh số ${index + 1} vào tệp bối cảnh trực quan để phân tích)\n`;
                        }
                    } catch (fileError) {
                        console.error(`Error parsing file ${m.original_filename}:`, fileError);
                        materialsText += `   -> (Không thể đọc tự động nội dung tệp này)\n`;
                    }
                }
            }
        } else {
            materialsText += "\n(Giáo viên chưa tải lên tài liệu nào)\n";
        }

        contextText += materialsText;

        if (streamPosts.length > 0) {
            contextText += "\n[Thông báo/Bài giảng trên Bảng tin lớp]:\n";
            streamPosts.forEach((p, index) => {
                const cleanContent = p.content.replace(/<[^>]*>?/gm, '').substring(0, 300); // Strip HTML
                contextText += `${index + 1}. Nội dung: "${cleanContent}..."\n`;
            });
        }

        // 3. Build System Prompt
        const systemPrompt = `Bạn là Trợ lý ảo AI Hỗ trợ Học tập thông minh thuộc hệ thống SmartEdu.
Bạn đang hỗ trợ một học sinh trong một không gian lớp học CỤ THỂ.

NHIỆM VỤ CỦA BẠN:
1. Trả lời câu hỏi học tập một cách dễ hiểu, tôn trọng, mang tính giáo dục.
2. **BR_AI_01 (Ưu tiên kiến thức lớp học)**: Ưu tiên trả lời dựa trên nội dung "Tài liệu lớp học" và "Bảng tin" được cung cấp ở trên để trả lời.
3. **Mở rộng kiến thức**: Nếu nội dung trong tài liệu chưa phản hồi đầy đủ khía cạnh sâu, bạn ĐƯỢC PHÉP sử dụng thêm kiến thức giáo dục chuẩn bên ngoài để bổ sung, giải đáp phong phú cho học sinh.
4. **CHỈ TRẢ LỜI KIẾN THỨC HỌC TẬP**: Nghiêm cấm trả lời những câu hỏi tán gẫu, chơi game, giải trí, hoặc không liên quan đến bài giảng, tài liệu môn học, học tập. Nếu gặp câu hỏi dạng này, hãy TỪ CHỐI trả lời một cách lịch sự nhưng nghiêm túc, và hướng học sinh tập trung vào bài học.
5. **BR_AI_02 (Minh bạch nguồn gốc)**: 
   - Trích dẫn rõ "Theo tài liệu [Tên tài liệu]..." khi dùng nội dung trích xuất từ file.
   - Nếu có đường dẫn liên kết hỗ trợ (link), hãy gợi ý học sinh "Bạn có thể tham khảo thêm tại liên kết đính kèm...".

Dưới đây là Bối cảnh lớp học hiện tại:
${contextText}`;

        // 4. Initialize Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        // Add the system prompt as the FIRST part of the prompt assembly
        chatHistoryParts.unshift({ text: systemPrompt });

        // Format history for startChat: [{ role: 'user'|'model', parts: [{ text: '...' }] }]
        const chatHistory = [
            { role: "user", parts: chatHistoryParts },
            { role: "model", parts: [{ text: "Tôi đã hiểu nhiệm vụ. Tôi sẽ bám sát tài liệu môn học và các tệp đính kèm được tải lên để hỗ trợ học sinh." }] },
            ...history.map(h => ({
                role: h.role === "model" ? "model" : "user", 
                parts: [{ text: h.text }]
            }))
        ];

        const chat = model.startChat({
            history: chatHistory,
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1500,
            }
        });

        const result = await chat.sendMessage(message);
        const response = result.response.text();
        return response;

    } catch (error) {
        console.error("Gemini AI Error - Full Details:", error);
        if (error.response) console.error("Gemini Response Data:", error.response.data);
        throw new AppError(error.message || "Lỗi khi giao tiếp với AI", 500);
    }
};
