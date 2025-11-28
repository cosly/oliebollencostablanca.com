#!/usr/bin/env node
/**
 * Generate customer link with pre-filled data
 * Usage: node scripts/generate-customer-link.js "John Doe" "john@example.com" "+31612345678"
 */

const BASE_URL = process.env.BASE_URL || 'https://oliebollencostablanca.com';

function generateCustomerLink(naam, email, telefoon) {
    const params = new URLSearchParams();

    if (naam) params.append('naam', naam);
    if (email) params.append('email', email);
    if (telefoon) params.append('telefoon', telefoon);

    return `${BASE_URL}/?${params.toString()}`;
}

// CLI usage
if (require.main === module) {
    const [naam, email, telefoon] = process.argv.slice(2);

    if (!naam && !email && !telefoon) {
        console.log('Usage: node scripts/generate-customer-link.js "Naam" "email@example.com" "+31612345678"');
        console.log('\nExample:');
        console.log('  node scripts/generate-customer-link.js "John Doe" "john@example.com" "+31612345678"');
        process.exit(1);
    }

    const link = generateCustomerLink(naam, email, telefoon);
    console.log('\n✅ Customer link generated:');
    console.log(link);
    console.log('\n📋 Copy this link and send it to the customer!');
}

module.exports = { generateCustomerLink };
