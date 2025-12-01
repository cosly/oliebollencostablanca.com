const { chromium } = require('@playwright/test');

async function testCapacityConfig() {
    console.log('🚀 Starting capacity config test\n');
    console.log('📝 Instructions:');
    console.log('   1. The test will open the browser');
    console.log('   2. Look at the wrangler terminal for the login code');
    console.log('   3. The test will pause for 15 seconds - manually enter the code');
    console.log('   4. The test will then verify capacity settings\n');

    const browser = await chromium.launch({
        headless: false,
        slowMo: 800
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Step 1: Navigate to admin
        console.log('📍 Step 1: Opening admin page...');
        await page.goto('http://localhost:8081/admin');
        await page.waitForLoadState('networkidle');
        console.log('✓ Page loaded');

        // Step 2: Request login code
        console.log('\n🔐 Step 2: Requesting login code...');
        await page.click('button#requestCodeBtn');
        await page.waitForTimeout(1000);

        console.log('\n⏸️  PAUSED - Please:');
        console.log('   1. Check the wrangler terminal for the 6-digit code');
        console.log('   2. Enter it in the browser');
        console.log('   3. Click "Inloggen"');
        console.log('\n   Waiting 15 seconds...\n');

        await page.waitForTimeout(15000);

        // Step 3: Should be logged in now, go to capacity tab
        console.log('📊 Step 3: Opening Capacity tab...');
        await page.click('button[data-tab="capacity"]');
        await page.waitForTimeout(2000);
        console.log('✓ Capacity tab opened');

        // Step 4: Read current values from database (we know they should be 100, 100, 60)
        console.log('\n📖 Step 4: Reading current capacity values from UI...');
        const krentenValue = await page.inputValue('input#capKrenten');
        const naturelValue = await page.inputValue('input#capNaturel');
        const appelbeignetValue = await page.inputValue('input#capAppelbeignet');

        console.log(`Current values in UI:`);
        console.log(`  🔴 Krenten: ${krentenValue}`);
        console.log(`  🟠 Naturel: ${naturelValue}`);
        console.log(`  🟢 Appelbeignet: ${appelbeignetValue}`);

        // Expected values (we set these manually in database)
        const expectedKrenten = '100';
        const expectedNaturel = '100';
        const expectedAppelbeignet = '60';

        console.log(`\nExpected values (from database):`);
        console.log(`  🔴 Krenten: ${expectedKrenten}`);
        console.log(`  🟠 Naturel: ${expectedNaturel}`);
        console.log(`  🟢 Appelbeignet: ${expectedAppelbeignet}`);

        // Verify
        const krentenMatch = krentenValue === expectedKrenten;
        const naturelMatch = naturelValue === expectedNaturel;
        const appelbeignetMatch = appelbeignetValue === expectedAppelbeignet;

        console.log('\n📊 Load Test Results:');
        console.log(`  Krenten: ${krentenMatch ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Naturel: ${naturelMatch ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Appelbeignet: ${appelbeignetMatch ? '✅ PASS' : '❌ FAIL'}`);

        if (!krentenMatch || !naturelMatch || !appelbeignetMatch) {
            console.log('\n❌ Config loading FAILED!');
            return;
        }

        // Step 5: Change values
        const newKrenten = '110';
        const newNaturel = '110';
        const newAppelbeignet = '70';

        console.log('\n📝 Step 5: Changing to new values...');
        console.log(`  🔴 Krenten: ${krentenValue} → ${newKrenten}`);
        console.log(`  🟠 Naturel: ${naturelValue} → ${newNaturel}`);
        console.log(`  🟢 Appelbeignet: ${appelbeignetValue} → ${newAppelbeignet}`);

        await page.fill('input#capKrenten', newKrenten);
        await page.fill('input#capNaturel', newNaturel);
        await page.fill('input#capAppelbeignet', newAppelbeignet);
        console.log('✓ New values entered');

        // Step 6: Save
        console.log('\n💾 Step 6: Saving configuration...');
        await page.click('button#saveConfigBtn');
        await page.waitForTimeout(2000);

        // Check for notification
        const notificationVisible = await page.isVisible('.notification');
        if (notificationVisible) {
            const notificationText = await page.textContent('.notification');
            console.log(`✓ Notification: ${notificationText.trim()}`);
        }

        // Step 7: Refresh page
        console.log('\n🔄 Step 7: Refreshing page to test persistence...');
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Step 8: Go back to capacity tab
        console.log('📊 Step 8: Opening Capacity tab after refresh...');
        await page.click('button[data-tab="capacity"]');
        await page.waitForTimeout(2000);

        // Step 9: Verify saved values
        console.log('\n✅ Step 9: Verifying saved values...');
        const verifyKrenten = await page.inputValue('input#capKrenten');
        const verifyNaturel = await page.inputValue('input#capNaturel');
        const verifyAppelbeignet = await page.inputValue('input#capAppelbeignet');

        console.log(`Loaded values after refresh:`);
        console.log(`  🔴 Krenten: ${verifyKrenten} (expected: ${newKrenten})`);
        console.log(`  🟠 Naturel: ${verifyNaturel} (expected: ${newNaturel})`);
        console.log(`  🟢 Appelbeignet: ${verifyAppelbeignet} (expected: ${newAppelbeignet})`);

        const saveKrentenMatch = verifyKrenten === newKrenten;
        const saveNaturelMatch = verifyNaturel === newNaturel;
        const saveAppelbeignetMatch = verifyAppelbeignet === newAppelbeignet;

        console.log('\n📊 Save & Persist Test Results:');
        console.log(`  Krenten: ${saveKrentenMatch ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Naturel: ${saveNaturelMatch ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Appelbeignet: ${saveAppelbeignetMatch ? '✅ PASS' : '❌ FAIL'}`);

        if (saveKrentenMatch && saveNaturelMatch && saveAppelbeignetMatch) {
            console.log('\n🎉 ALL TESTS PASSED! Capacity config is working correctly.');
        } else {
            console.log('\n❌ SAVE TEST FAILED! Config not persisting correctly.');
        }

        console.log('\n⏸️  Keeping browser open for 5 seconds...');
        await page.waitForTimeout(5000);

    } catch (error) {
        console.error('\n❌ Error during test:', error.message);
        await page.screenshot({ path: 'capacity-test-error.png', fullPage: true });
        console.log('📸 Screenshot saved to capacity-test-error.png');
    } finally {
        await browser.close();
    }
}

testCapacityConfig().catch(console.error);
