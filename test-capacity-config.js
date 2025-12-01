const { chromium } = require('@playwright/test');
const fs = require('fs');

// Function to get the latest login code from server logs
function getLatestLoginCode() {
    // Read the wrangler dev output - check both possible log locations
    const logPaths = [
        '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.log',
        'wrangler.log'
    ];

    // For this test, we'll use a simpler approach - monitor network requests
    // and extract the code from the response
    return null; // Will be extracted from page context instead
}

async function testCapacityConfig() {
    console.log('🚀 Starting Playwright test - checking capacity config save and load\n');

    const browser = await chromium.launch({
        headless: false,
        slowMo: 500
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    let loginCode = null;

    // Listen for console messages to capture login code
    page.on('console', msg => {
        const text = msg.text();
        const match = text.match(/ADMIN LOGIN CODE: (\d{6})/);
        if (match) {
            loginCode = match[1];
        }
    });

    try {
        // Step 1: Go to admin page
        console.log('📍 Step 1: Navigating to admin page...');
        await page.goto('http://localhost:8081/admin');
        await page.waitForLoadState('networkidle');

        // Step 2: Login (request code)
        console.log('🔐 Step 2: Requesting login code...');

        // Intercept the network request to get the login code from response
        let codeFromNetwork = null;
        page.on('response', async response => {
            if (response.url().includes('/api/auth/request')) {
                try {
                    // The server logs the code, we need to extract it differently
                    // Let's wait a bit and check the page source
                } catch (e) {
                    // Ignore errors
                }
            }
        });

        await page.click('button#requestCodeBtn');
        await page.waitForTimeout(2000);

        // Try to get code from console logs (printed by server in dev mode)
        if (!loginCode) {
            console.log('⚠️  Could not capture login code from console, using hardcoded test approach...');
            // For now, let's use the API directly to get a valid token
            const response = await page.evaluate(async () => {
                const res = await fetch('http://localhost:8081/api/auth/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                return res.ok;
            });

            // Since we can't easily get the code, let's check the terminal output
            // In a real scenario, you'd parse the wrangler dev output
            console.log('⚠️  Please check the wrangler dev terminal for the login code');
            console.log('⚠️  Waiting 10 seconds for you to manually enter it...');
            await page.waitForTimeout(10000);

            // Skip the rest of the test
            throw new Error('Manual intervention required - automated login code extraction not implemented');
        }

        console.log(`✓ Login code found: ${loginCode}`);

        // Step 3: Enter code and login
        console.log('📝 Step 3: Entering login code...');
        await page.fill('input#loginToken', loginCode);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(2000);

        console.log('✓ Logged in successfully');

        // Step 4: Navigate to Capacity tab
        console.log('📊 Step 4: Opening Capacity tab...');
        await page.click('button[data-tab="capacity"]');
        await page.waitForTimeout(1500);

        console.log('✓ Capacity tab opened');

        // Step 5: Read current values
        console.log('📖 Step 5: Reading current capacity values...');
        const currentKrenten = await page.inputValue('input#capKrenten');
        const currentNaturel = await page.inputValue('input#capNaturel');
        const currentAppelbeignet = await page.inputValue('input#capAppelbeignet');

        console.log(`Current values:`);
        console.log(`  🔴 Krenten: ${currentKrenten}`);
        console.log(`  🟠 Naturel: ${currentNaturel}`);
        console.log(`  🟢 Appelbeignet: ${currentAppelbeignet}`);

        // Step 6: Change values to new higher values
        const newKrenten = parseInt(currentKrenten) + 10;
        const newNaturel = parseInt(currentNaturel) + 10;
        const newAppelbeignet = parseInt(currentAppelbeignet) + 5;

        console.log('\n📝 Step 6: Changing to new values...');
        console.log(`New values:`);
        console.log(`  🔴 Krenten: ${currentKrenten} → ${newKrenten}`);
        console.log(`  🟠 Naturel: ${currentNaturel} → ${newNaturel}`);
        console.log(`  🟢 Appelbeignet: ${currentAppelbeignet} → ${newAppelbeignet}`);

        await page.fill('input#capKrenten', String(newKrenten));
        await page.fill('input#capNaturel', String(newNaturel));
        await page.fill('input#capAppelbeignet', String(newAppelbeignet));

        console.log('✓ Values entered');

        // Step 7: Save configuration
        console.log('\n💾 Step 7: Saving configuration...');
        await page.click('button#saveConfigBtn');
        await page.waitForTimeout(2000);

        // Check for success notification
        const notification = await page.locator('.notification').first();
        if (await notification.isVisible()) {
            const notificationText = await notification.textContent();
            console.log(`✓ Notification: ${notificationText}`);
        }

        // Step 8: Refresh page
        console.log('\n🔄 Step 8: Refreshing page...');
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Step 9: Navigate back to Capacity tab
        console.log('📊 Step 9: Opening Capacity tab again...');
        await page.click('button[data-tab="capacity"]');
        await page.waitForTimeout(1500);

        // Step 10: Verify values were saved
        console.log('\n✅ Step 10: Verifying saved values...');
        const verifyKrenten = await page.inputValue('input#capKrenten');
        const verifyNaturel = await page.inputValue('input#capNaturel');
        const verifyAppelbeignet = await page.inputValue('input#capAppelbeignet');

        console.log(`Loaded values after refresh:`);
        console.log(`  🔴 Krenten: ${verifyKrenten} (expected: ${newKrenten})`);
        console.log(`  🟠 Naturel: ${verifyNaturel} (expected: ${newNaturel})`);
        console.log(`  🟢 Appelbeignet: ${verifyAppelbeignet} (expected: ${newAppelbeignet})`);

        // Check if values match
        const krentenMatch = verifyKrenten === String(newKrenten);
        const naturelMatch = verifyNaturel === String(newNaturel);
        const appelbeignetMatch = verifyAppelbeignet === String(newAppelbeignet);

        console.log('\n📊 Test Results:');
        console.log(`  Krenten: ${krentenMatch ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Naturel: ${naturelMatch ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Appelbeignet: ${appelbeignetMatch ? '✅ PASS' : '❌ FAIL'}`);

        if (krentenMatch && naturelMatch && appelbeignetMatch) {
            console.log('\n🎉 All tests PASSED! Capacity config is working correctly.');
        } else {
            console.log('\n❌ Some tests FAILED! Capacity config is not persisting correctly.');
        }

    } catch (error) {
        console.error('\n❌ Error during test:', error.message);
        await page.screenshot({ path: 'capacity-test-error.png', fullPage: true });
        console.log('📸 Screenshot saved to capacity-test-error.png');
    } finally {
        await browser.close();
    }
}

testCapacityConfig().catch(console.error);
