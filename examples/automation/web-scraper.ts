/**
 * Web Scraper Example
 *
 * Demonstrates using the Automation API for web scraping.
 * This is a common use case for AI agents that need to extract data from websites.
 *
 * Run with: bun run examples/automation/web-scraper.ts
 */

import { Window } from "../../src";

interface ScrapedArticle {
    title: string;
    url: string;
    description: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("=== Web Scraper Demo ===\n");

    const window = new Window({
        width: 1200,
        height: 800,
        title: "Web Scraper",
        debug: false
    });

    // Set up a mock news page for demonstration
    await window.setHtml(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Tech News</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    max-width: 900px;
                    margin: 0 auto;
                    padding: 20px;
                    background: #f0f0f0;
                }
                header {
                    background: #1a1a2e;
                    color: white;
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .article {
                    background: white;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 15px 0;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .article h2 {
                    margin: 0 0 10px 0;
                    color: #1a1a2e;
                }
                .article h2 a {
                    color: #1a1a2e;
                    text-decoration: none;
                }
                .article h2 a:hover { color: #4a4a8a; }
                .article .meta {
                    color: #666;
                    font-size: 0.9em;
                    margin-bottom: 10px;
                }
                .article .description {
                    color: #333;
                    line-height: 1.6;
                }
                .pagination {
                    display: flex;
                    justify-content: center;
                    gap: 10px;
                    margin-top: 20px;
                }
                .pagination button {
                    padding: 10px 20px;
                    border: none;
                    background: #1a1a2e;
                    color: white;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .pagination button:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                .pagination button:hover:not(:disabled) {
                    background: #4a4a8a;
                }
            </style>
        </head>
        <body>
            <header>
                <h1>Tech News Daily</h1>
                <p>Your source for the latest technology news</p>
            </header>

            <div id="articles">
                <article class="article" data-id="1">
                    <h2><a href="/article/1">New AI Model Breaks Records in Language Understanding</a></h2>
                    <div class="meta">Published: January 15, 2026 | Category: AI</div>
                    <p class="description">Researchers have announced a breakthrough in natural language processing with a new model that achieves unprecedented accuracy on benchmark tests.</p>
                </article>

                <article class="article" data-id="2">
                    <h2><a href="/article/2">Quantum Computing Reaches New Milestone</a></h2>
                    <div class="meta">Published: January 14, 2026 | Category: Quantum</div>
                    <p class="description">Scientists demonstrate quantum supremacy with a 1000-qubit processor, opening doors for practical quantum applications.</p>
                </article>

                <article class="article" data-id="3">
                    <h2><a href="/article/3">Electric Vehicle Sales Surge Globally</a></h2>
                    <div class="meta">Published: January 13, 2026 | Category: Automotive</div>
                    <p class="description">Global EV sales have increased by 45% year-over-year, with new battery technology extending range to over 500 miles.</p>
                </article>

                <article class="article" data-id="4">
                    <h2><a href="/article/4">Revolutionary Solar Panel Design Doubles Efficiency</a></h2>
                    <div class="meta">Published: January 12, 2026 | Category: Energy</div>
                    <p class="description">A startup has developed perovskite solar cells that achieve 40% efficiency, potentially transforming renewable energy.</p>
                </article>

                <article class="article" data-id="5">
                    <h2><a href="/article/5">Space Tourism Company Announces Mars Mission</a></h2>
                    <div class="meta">Published: January 11, 2026 | Category: Space</div>
                    <p class="description">Private space company reveals plans for crewed Mars mission by 2030, with tickets starting at $2 million.</p>
                </article>
            </div>

            <div class="pagination">
                <button id="prevBtn" disabled>Previous</button>
                <span id="pageInfo">Page 1 of 1</span>
                <button id="nextBtn" disabled>Next</button>
            </div>
        </body>
        </html>
    `);

    await sleep(500);
    console.log("News page loaded\n");

    // Scrape articles using JavaScript execution
    console.log("Scraping articles...\n");

    const result = await window.executeScript(`
        (function() {
            const articles = [];
            document.querySelectorAll('.article').forEach(article => {
                const titleEl = article.querySelector('h2 a');
                const descEl = article.querySelector('.description');
                articles.push({
                    title: titleEl ? titleEl.textContent : '',
                    url: titleEl ? titleEl.getAttribute('href') : '',
                    description: descEl ? descEl.textContent : ''
                });
            });
            return articles;
        })()
    `);

    const articles = (result as ScrapedArticle[]) || [];

    console.log("=== Scraped Articles ===\n");
    articles.forEach((article, i) => {
        console.log(`${i + 1}. ${article.title}`);
        console.log(`   URL: ${article.url}`);
        console.log(`   ${article.description.substring(0, 80)}...`);
        console.log();
    });

    console.log(`Total articles scraped: ${articles.length}`);

    // Also demonstrate using the automation API for element queries
    console.log("\n=== Using Automation API ===\n");

    try {
        const articleElements = await window.automation.querySelectorAll(".article");
        console.log(`Found ${articleElements.length} article elements via querySelectorAll`);

        const firstArticle = await window.automation.querySelector(".article h2");
        if (firstArticle) {
            console.log(`First article title: "${firstArticle.textContent}"`);
        }
    } catch (e) {
        console.log(`Error using automation API: ${e}`);
    }

    console.log("\nScraper window will remain open. Close it to exit.");
}

main().catch(console.error);
