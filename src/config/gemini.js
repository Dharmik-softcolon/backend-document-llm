import OpenAI from "openai";
import { config } from "./credential.js";

export const openai = new OpenAI({
    apiKey: config.key.gemini_key,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/"
});
