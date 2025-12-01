const { chromium } = require('@playwright/test');

async function placeOrder(page, orderNumber, isFirstOrder = false) {
    console.log(`\n🎯 Placing order ${orderNumber}/5...`);

    // Only go to homepage for first order
    if (isFirstOrder) {
        await page.goto('http://localhost:8081');
        await page.waitForLoadState('networkidle');
    }

    // Step 1: Select products
    console.log('  📦 Step 1: Selecting products...');

    // Add random quantities of each product (1-5 of each)
    const krenten = Math.floor(Math.random() * 5) + 1;
    const naturel = Math.floor(Math.random() * 5) + 1;
    const appel = Math.floor(Math.random() * 3) + 1;

    // Click + buttons to add products
    for (let i = 0; i < krenten; i++) {
        await page.click('button.qty-btn.plus[data-product="oliebol_krenten"]');
    }
    for (let i = 0; i < naturel; i++) {
        await page.click('button.qty-btn.plus[data-product="oliebol_naturel"]');
    }
    for (let i = 0; i < appel; i++) {
        await page.click('button.qty-btn.plus[data-product="appelbeignet"]');
    }

    console.log(`  ✓ Added ${krenten} krenten, ${naturel} naturel, ${appel} appelbeignets`);

    // Wait for button to be enabled and click to go to step 2
    await page.waitForSelector('button#toStep2:not([disabled])', { timeout: 5000 });
    await page.click('button#toStep2');
    await page.waitForTimeout(1000); // Wait for timeslots to load

    // Step 2: Select timeslot
    console.log('  📅 Step 2: Selecting timeslot...');
    await page.waitForSelector('.timeslot:not(.unavailable)', { timeout: 10000 });

    // Click first available timeslot
    const firstSlot = await page.locator('.timeslot:not(.unavailable)').first();
    await firstSlot.click();
    console.log('  ✓ Selected timeslot');

    // Click next to go to step 3
    await page.waitForSelector('button#toStep3:not([disabled])', { timeout: 5000 });
    await page.click('button#toStep3');

    // Step 3: Fill in customer details
    console.log('  📝 Step 3: Filling customer details...');
    await page.fill('input[name="naam"]', `Test Klant ${orderNumber}`);
    await page.fill('input[name="email"]', `test${orderNumber}@example.com`);
    await page.fill('input[name="telefoon"]', `0612345${String(orderNumber).padStart(3, '0')}`);
    console.log('  ✓ Filled customer details');

    // Click next to go to step 4
    await page.waitForSelector('button#toStep4:not([disabled])', { timeout: 5000 });
    await page.click('button#toStep4');

    // Step 4: Review and submit
    console.log('  ✅ Step 4: Submitting order...');
    await page.waitForTimeout(500);
    await page.click('button#submitOrder');

    // Wait for success page
    await page.waitForSelector('.confirmation-icon', { timeout: 10000 });

    // Get order number from success page - look for "Bestelnummer: OB-XXXXXX" pattern
    const orderNumberElement = await page.locator('text=/Bestelnummer:.*OB-/').first();
    const orderNumberText = (await orderNumberElement.textContent()).match(/OB-\w+/)[0];
    console.log(`  🎉 Order placed successfully: ${orderNumberText}`);

    return orderNumberText;
}

async function startNewOrder(page) {
    // Click "Nieuwe bestelling plaatsen" button
    await page.click('button:has-text("Nieuwe bestelling plaatsen")');
    await page.waitForLoadState('networkidle');
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
            const orderNumber = await placeOrder(page, i, i === 1);
            orderNumbers.push(orderNumber);

            // Start new order if not the last one
            if (i < 5) {
                await startNewOrder(page);
            }
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
