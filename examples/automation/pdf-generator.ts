/**
 * PDF Generator Example
 *
 * Demonstrates using the Protocol API to generate PDFs from web content.
 * Useful for creating reports, invoices, or saving web pages as documents.
 *
 * Run with: bun run examples/automation/pdf-generator.ts
 */

import { Window } from "../../src";

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("=== PDF Generator Demo ===\n");

    const window = new Window({
        width: 800,
        height: 1000,
        title: "PDF Generator",
        debug: false
    });

    // Create a professional invoice template
    await window.setHtml(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Invoice #2026-001</title>
            <style>
                * { box-sizing: border-box; }
                body {
                    font-family: 'Helvetica Neue', Arial, sans-serif;
                    padding: 40px;
                    color: #333;
                    background: white;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 40px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #007bff;
                }
                .logo {
                    font-size: 28px;
                    font-weight: bold;
                    color: #007bff;
                }
                .invoice-title {
                    text-align: right;
                }
                .invoice-title h1 {
                    margin: 0;
                    color: #333;
                    font-size: 32px;
                }
                .invoice-title p {
                    margin: 5px 0 0;
                    color: #666;
                }
                .addresses {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 40px;
                }
                .address-block {
                    width: 45%;
                }
                .address-block h3 {
                    color: #007bff;
                    margin-bottom: 10px;
                    font-size: 14px;
                    text-transform: uppercase;
                }
                .address-block p {
                    margin: 5px 0;
                    line-height: 1.5;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 30px;
                }
                th {
                    background: #007bff;
                    color: white;
                    padding: 12px;
                    text-align: left;
                    font-weight: 500;
                }
                td {
                    padding: 12px;
                    border-bottom: 1px solid #eee;
                }
                .text-right { text-align: right; }
                .totals {
                    width: 300px;
                    margin-left: auto;
                }
                .totals tr td {
                    padding: 8px 12px;
                }
                .totals .total-row {
                    font-size: 18px;
                    font-weight: bold;
                    background: #f8f9fa;
                }
                .totals .total-row td {
                    border-top: 2px solid #007bff;
                }
                .notes {
                    margin-top: 40px;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .notes h4 {
                    margin: 0 0 10px;
                    color: #007bff;
                }
                .footer {
                    margin-top: 40px;
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">TechCorp Inc.</div>
                <div class="invoice-title">
                    <h1>INVOICE</h1>
                    <p>Invoice #2026-001</p>
                    <p>Date: January 17, 2026</p>
                </div>
            </div>

            <div class="addresses">
                <div class="address-block">
                    <h3>From</h3>
                    <p><strong>TechCorp Inc.</strong></p>
                    <p>123 Innovation Drive</p>
                    <p>San Francisco, CA 94105</p>
                    <p>contact@techcorp.example</p>
                </div>
                <div class="address-block">
                    <h3>Bill To</h3>
                    <p><strong>Acme Corporation</strong></p>
                    <p>456 Business Blvd</p>
                    <p>New York, NY 10001</p>
                    <p>billing@acme.example</p>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Quantity</th>
                        <th class="text-right">Unit Price</th>
                        <th class="text-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Software Development Services</td>
                        <td>40 hours</td>
                        <td class="text-right">$150.00</td>
                        <td class="text-right">$6,000.00</td>
                    </tr>
                    <tr>
                        <td>UI/UX Design Consultation</td>
                        <td>16 hours</td>
                        <td class="text-right">$125.00</td>
                        <td class="text-right">$2,000.00</td>
                    </tr>
                    <tr>
                        <td>Cloud Infrastructure Setup</td>
                        <td>1 project</td>
                        <td class="text-right">$1,500.00</td>
                        <td class="text-right">$1,500.00</td>
                    </tr>
                    <tr>
                        <td>Technical Documentation</td>
                        <td>8 hours</td>
                        <td class="text-right">$100.00</td>
                        <td class="text-right">$800.00</td>
                    </tr>
                </tbody>
            </table>

            <table class="totals">
                <tr>
                    <td>Subtotal</td>
                    <td class="text-right">$10,300.00</td>
                </tr>
                <tr>
                    <td>Tax (8.5%)</td>
                    <td class="text-right">$875.50</td>
                </tr>
                <tr class="total-row">
                    <td>Total Due</td>
                    <td class="text-right">$11,175.50</td>
                </tr>
            </table>

            <div class="notes">
                <h4>Payment Terms</h4>
                <p>Payment is due within 30 days of invoice date. Please make checks payable to TechCorp Inc. or use the wire transfer details below:</p>
                <p><strong>Bank:</strong> First National Bank | <strong>Account:</strong> 1234567890 | <strong>Routing:</strong> 987654321</p>
            </div>

            <div class="footer">
                <p>Thank you for your business!</p>
                <p>Questions? Contact us at contact@techcorp.example</p>
            </div>
        </body>
        </html>
    `);

    await sleep(500);
    console.log("Invoice page loaded\n");

    // Take a screenshot (always works)
    console.log("Taking screenshot...");
    try {
        const screenshot = await window.automation.screenshot();
        if (screenshot && screenshot.length > 0) {
            console.log(`Screenshot captured (${screenshot.length} chars base64)`);

            // Save screenshot to file
            const imgBuffer = Buffer.from(screenshot, 'base64');
            const imgPath = `${process.cwd()}/invoice.png`;
            await Bun.write(imgPath, imgBuffer);
            console.log(`Screenshot saved to: ${imgPath}`);
            console.log(`Screenshot size: ${(imgBuffer.length / 1024).toFixed(2)} KB\n`);
        } else {
            console.log("Screenshot returned empty\n");
        }
    } catch (e) {
        console.log(`Screenshot error: ${e}\n`);
    }

    // Try PDF generation (may not work on all platforms)
    console.log("Attempting PDF generation...");
    try {
        const pdfBase64 = await window.protocol.printToPDF({
            landscape: false,
            printBackground: true,
            paperWidth: 8.5,
            paperHeight: 11,
            marginTop: 0.5,
            marginBottom: 0.5,
            marginLeft: 0.5,
            marginRight: 0.5
        });

        if (pdfBase64 && pdfBase64.length > 0) {
            const pdfBuffer = Buffer.from(pdfBase64, 'base64');
            const pdfPath = `${process.cwd()}/invoice.pdf`;
            await Bun.write(pdfPath, pdfBuffer);
            console.log(`PDF saved to: ${pdfPath}`);
            console.log(`PDF size: ${(pdfBuffer.length / 1024).toFixed(2)} KB\n`);
        } else {
            console.log("PDF generation returned empty result");
            console.log("Note: PDF generation may have limited support on your platform\n");
        }
    } catch (e) {
        console.log(`PDF generation error: ${e}`);
        console.log("Note: PDF generation may have limited support on your platform\n");
    }

    // Get page title
    try {
        const title = await window.automation.getTitle();
        console.log(`Page title: ${title}`);
    } catch (e) {
        console.log(`Could not get title: ${e}`);
    }

    console.log("\nWindow will remain open for preview. Close to exit.");
}

main().catch(console.error);
