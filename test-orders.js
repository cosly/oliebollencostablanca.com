const { chromium } = require('@playwright/test');

// Realistische Nederlandse test personen
const TEST_CUSTOMERS = [
    { naam: 'Jan de Vries', email: 'jan.devries@gmail.com', telefoon: '+34 612 345 678' },
    { naam: 'Maria Jansen', email: 'maria.jansen@hotmail.com', telefoon: '+34 623 456 789' },
    { naam: 'Peter van Dam', email: 'p.vandam@outlook.com', telefoon: '+34 634 567 890' },
    { naam: 'Sophie Bakker', email: 'sophie.bakker@yahoo.com', telefoon: '+34 645 678 901' },
    { naam: 'Thomas Visser', email: 'thomas.visser@gmail.com', telefoon: '+34 656 789 012' },
    { naam: 'Emma Hendriks', email: 'emma.hendriks@hotmail.com', telefoon: '+34 667 890 123' },
    { naam: 'Luuk Vermeulen', email: 'luuk.vermeulen@outlook.com', telefoon: '+34 678 901 234' },
    { naam: 'Lisa Mulder', email: 'lisa.mulder@gmail.com', telefoon: '+34 689 012 345' },
    { naam: 'Daan Smit', email: 'daan.smit@yahoo.com', telefoon: '+34 690 123 456' },
    { naam: 'Anne de Boer', email: 'anne.deboer@hotmail.com', telefoon: '+34 601 234 567' }
];

async function placeOrder(page, orderNumber, isFirstOrder = false) {
    console.log(`\n🎯 Placing order ${orderNumber}/10...`);

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
    const customer = TEST_CUSTOMERS[orderNumber - 1];
    await page.fill('input[name="naam"]', customer.naam);
    await page.fill('input[name="email"]', customer.email);
    await page.fill('input[name="telefoon"]', customer.telefoon);
    console.log(`  ✓ Filled customer details (${customer.naam})`);

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
    console.log('🚀 Starting Playwright test - placing 10 orders...\n');

    const browser = await chromium.launch({
        headless: false, // Set to true if you want to run without UI
        slowMo: 100 // Slow down by 100ms to see what's happening
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    const orderNumbers = [];

    try {
        for (let i = 1; i <= 10; i++) {
            const orderNumber = await placeOrder(page, i, i === 1);
            orderNumbers.push(orderNumber);

            // Start new order if not the last one
            if (i < 10) {
                await startNewOrder(page);
            }
        }

        console.log('\n✨ All 10 orders placed successfully!');
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
