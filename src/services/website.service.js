import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Scrape text content from a website URL
 * @param {string} url - Website URL to scrape
 * @returns {Promise<Object>} - Object containing title, url, and text content
 */
export const scrapeWebsite = async (url) => {
    try {
        // Validate URL
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch (urlError) {
            throw new Error("Invalid URL format. Please provide a valid URL starting with http:// or https://");
        }

        console.log(`Fetching content from: ${url}`);
        
        // Fetch the webpage
        const response = await axios.get(url, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            maxRedirects: 5
        });

        if (!response.data) {
            throw new Error("No content received from the website");
        }

        // Parse HTML content
        const $ = cheerio.load(response.data);

        // Remove script, style, and other non-content elements
        $('script').remove();
        $('style').remove();
        $('nav').remove();
        $('footer').remove();
        $('header').remove();
        $('.advertisement').remove();
        $('.ad').remove();
        $('[class*="cookie"]').remove();
        $('[class*="popup"]').remove();
        $('[class*="banner"]').remove();

        // Extract title
        const title = $('title').text().trim() || 
                     $('h1').first().text().trim() || 
                     parsedUrl.hostname;

        // Extract main content
        // Try to find main content areas first
        let text = '';
        const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content', '.post', '.article'];
        
        for (const selector of mainSelectors) {
            const mainContent = $(selector).first();
            if (mainContent.length > 0) {
                text = mainContent.text();
                break;
            }
        }

        // If no main content found, extract all text from body
        if (!text || text.trim().length === 0) {
            text = $('body').text();
        }

        // Clean up the text
        text = text
            .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
            .replace(/\n+/g, '\n') // Replace multiple newlines with single newline
            .trim();

        if (!text || text.length === 0) {
            throw new Error("No text content found on the webpage");
        }

        console.log(`Scraped ${text.length} characters from ${url}`);
        console.log(`Page title: ${title}`);

        return {
            title,
            url: url,
            text,
            scrapedAt: new Date().toISOString()
        };
    } catch (error) {
        if (error.code === 'ENOTFOUND') {
            throw new Error("Website not found. Please check the URL and try again.");
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            throw new Error("Connection timeout. The website took too long to respond.");
        } else if (error.response) {
            throw new Error(`Website returned error ${error.response.status}: ${error.response.statusText}`);
        } else {
            console.error("Error scraping website:", error);
            throw new Error(error.message || "Failed to scrape website content");
        }
    }
};

