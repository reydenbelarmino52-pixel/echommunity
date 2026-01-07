
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Generate professional workshop descriptions using Gemini
export const generateWorkshopDescription = async (title: string, org: string): Promise<string> => {
  // Always use the named parameter object with process.env.API_KEY directly
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const prompt = `Write a professional, engaging, max 2 sentences description for a workshop: "${title}" by "${org}". Focus on student growth.`;
    // Directly call ai.models.generateContent and access .text property
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "No description generated.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Could not generate description.";
  }
};

// Generate AI chat responses for the Echo assistant
export const generateChatResponse = async (history: {role: string, parts: {text: string}[]}[], message: string): Promise<string> => {
  // Always initialize GoogleGenAI with { apiKey: process.env.API_KEY }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    // Filter out invalid empty turns from history
    const cleanHistory = history.filter(h => h.parts[0].text.trim() !== "");

    // Use ai.models.generateContent for chat interactions
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        ...cleanHistory,
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        systemInstruction: "You are Echo, the AI assistant for Echo-mmunity. You help students manage workshops and awards. Be helpful, concise, and professional.",
        temperature: 0.7,
      },
    });

    // Access the extracted string directly via the .text property
    return response.text || "I'm sorry, I'm having trouble processing that.";
  } catch (error) {
    console.error("Chat Error:", error);
    return "I'm offline right now. Try again later!";
  }
};
