const { chromium } = require('@playwright/test');

// Realistische Nederlandse test personen
const FIRST_NAMES = [
    'Jan', 'Maria', 'Peter', 'Sophie', 'Thomas', 'Emma', 'Luuk', 'Lisa', 'Daan', 'Anne',
    'Lars', 'Eva', 'Bram', 'Fleur', 'Sem', 'Julia', 'Max', 'Saar', 'Tim', 'Lotte',
    'Finn', 'Noa', 'Milan', 'Isa', 'Thijs', 'Lynn', 'Jesse', 'Mila', 'Lucas', 'Tess',
    'Ruben', 'Evi', 'Stijn', 'Sara', 'Lars', 'Lieke', 'Jasper', 'Nina', 'Tom', 'Roos'
];

const LAST_NAMES = [
    'de Vries', 'Jansen', 'van Dam', 'Bakker', 'Visser', 'Hendriks', 'Vermeulen', 'Mulder', 'Smit', 'de Boer',
    'Dekker', 'van Dijk', 'de Groot', 'Peters', 'van Leeuwen', 'de Jong', 'Willems', 'van den Berg', 'Jacobs', 'van der Meer',
    'Meijer', 'van den Heuvel', 'Koning', 'Vos', 'Brouwer', 'Schouten', 'van Houten', 'Koster', 'Prins', 'Blom',
    'van der Linden', 'Huisman', 'Ruiter', 'Kuipers', 'van Es', 'Scholten', 'Bosch', 'van der Heijden', 'Sanders', 'Dijkstra'
];

const EMAIL_PROVIDERS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'ziggo.nl'];

// Generate 150 unique customers
const TEST_CUSTOMERS = [];
for (let i = 0; i < 150; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
    const fullName = `${firstName} ${lastName}`;
    const emailName = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/ /g, '')}${i > 39 ? i : ''}`;
    const provider = EMAIL_PROVIDERS[i % EMAIL_PROVIDERS.length];
    const phoneNumber = `+34 ${600 + Math.floor(i / 10)} ${String(i).padStart(3, '0')} ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

    TEST_CUSTOMERS.push({
        naam: fullName,
        email: `${emailName}@${provider}`,
        telefoon: phoneNumber
    });
}

async function placeOrder(page, orderNumber, isFirstOrder = false) {
    console.log(`\n🎯 Placing order ${orderNumber}/150...`);

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
    console.log('🚀 Starting Playwright test - placing 150 orders...\n');
    console.log('⚠️  This will take approximately 15-20 minutes to complete.\n');

    const browser = await chromium.launch({
        headless: true, // Run headless for speed
        slowMo: 50 // Speed up to 50ms
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    const orderNumbers = [];
    const startTime = Date.now();

    try {
        for (let i = 1; i <= 150; i++) {
            const orderNumber = await placeOrder(page, i, i === 1);
            orderNumbers.push(orderNumber);

            // Show progress every 10 orders
            if (i % 10 === 0) {
                const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
                const avgTime = (Date.now() - startTime) / i / 1000;
                const remaining = ((150 - i) * avgTime / 60).toFixed(1);
                console.log(`\n📊 Progress: ${i}/150 orders (${(i/150*100).toFixed(0)}%) - ${elapsed}min elapsed, ~${remaining}min remaining\n`);
            }

            // Start new order if not the last one
            if (i < 150) {
                await startNewOrder(page);
            }
        }

        const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        console.log(`\n✨ All 150 orders placed successfully in ${totalTime} minutes!`);
        console.log(`📋 First 10 order numbers: ${orderNumbers.slice(0, 10).join(', ')}...`);
        console.log(`📋 Last 10 order numbers: ${orderNumbers.slice(-10).join(', ')}`);

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
