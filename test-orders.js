const { chromium } = require('playwright');

async function placeOrder(page, orderNumber) {
    console.log(`\n🎯 Placing order ${orderNumber}/5...`);

    // Go to homepage
    await page.goto('http://localhost:8081');
    await page.waitForLoadState('networkidle');

    // Step 1: Select products
    console.log('  📦 Step 1: Selecting products...');

    // Add random quantities of each product (1-5 of each)
    const krenten = Math.floor(Math.random() * 5) + 1;
    const naturel = Math.floor(Math.random() * 5) + 1;
    const appel = Math.floor(Math.random() * 3) + 1;

    // Click + buttons to add products
    for (let i = 0; i < krenten; i++) {
        await page.click('button[data-product="oliebol_krenten"][data-action="increase"]');
    }
    for (let i = 0; i < naturel; i++) {
        await page.click('button[data-product="oliebol_naturel"][data-action="increase"]');
    }
    for (let i = 0; i < appel; i++) {
        await page.click('button[data-product="appelbeignet"][data-action="increase"]');
    }

    console.log(`  ✓ Added ${krenten} krenten, ${naturel} naturel, ${appel} appelbeignets`);

    // Click next to go to step 2
    await page.click('button:has-text("Vul gegevens in")');
    await page.waitForTimeout(1000); // Wait for timeslots to load

    // Step 2: Select timeslot
    console.log('  📅 Step 2: Selecting timeslot...');
    await page.waitForSelector('.timeslot:not(.unavailable)', { timeout: 10000 });

    // Click first available timeslot
    const firstSlot = await page.locator('.timeslot:not(.unavailable)').first();
    await firstSlot.click();
    console.log('  ✓ Selected timeslot');

    // Click next to go to step 3
    await page.click('button#nextToContact');

    // Step 3: Fill in customer details
    console.log('  📝 Step 3: Filling customer details...');
    await page.fill('input[name="name"]', `Test Klant ${orderNumber}`);
    await page.fill('input[name="email"]', `test${orderNumber}@example.com`);
    await page.fill('input[name="phone"]', `0612345${String(orderNumber).padStart(3, '0')}`);
    console.log('  ✓ Filled customer details');

    // Click next to go to step 4
    await page.click('button#nextToReview');

    // Step 4: Review and submit
    console.log('  ✅ Step 4: Submitting order...');
    await page.waitForTimeout(500);
    await page.click('button#submitOrder');

    // Wait for success page
    await page.waitForSelector('.success-container, h1:has-text("Gelukt")', { timeout: 10000 });

    // Get order number from success page
    const orderNumberText = await page.locator('.order-number, text=/OB-/').first().textContent();
    console.log(`  🎉 Order placed successfully: ${orderNumberText}`);

    return orderNumberText;
}

async function main() {
    console.log('🚀 Starting Playwright test - placing 5 orders...\n');

    const browser = await chromium.launch({
        headless: false, // Set to true if you want to run without UI
        slowMo: 100 // Slow down by 100ms to see what's happening
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    const orderNumbers = [];

    try {
        for (let i = 1; i <= 5; i++) {
            const orderNumber = await placeOrder(page, i);
            orderNumbers.push(orderNumber);

            // Small delay between orders
            await page.waitForTimeout(2000);
        }

        console.log('\n✨ All 5 orders placed successfully!');
        console.log('📋 Order numbers:', orderNumbers.join(', '));

    } catch (error) {
        console.error('\n❌ Error placing order:', error.message);
        // Take screenshot on error
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        console.log('📸 Screenshot saved to error-screenshot.png');
    } finally {
        await browser.close();
    }
}

main().catch(console.error);
