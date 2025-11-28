#!/usr/bin/env node
/**
 * Generate customer links from CSV file
 * CSV format: naam,email,telefoon
 *
 * Usage: node scripts/csv-to-links.js customers.csv [output.txt]
 */

const fs = require('fs');
const path = require('path');
const { generateCustomerLink } = require('./generate-customer-link');

function parseCSV(csvContent) {
    const lines = csvContent.trim().split('\n');
    const customers = [];

    // Skip header if it exists
    const startIndex = lines[0].toLowerCase().includes('naam') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line (handle quoted fields)
        const fields = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
        const [naam, email, telefoon] = fields.map(f => f.replace(/^"|"$/g, '').trim());

        if (naam || email || telefoon) {
            customers.push({ naam, email, telefoon });
        }
    }

    return customers;
}

function generateLinks(customers) {
    return customers.map(customer => {
        const link = generateCustomerLink(customer.naam, customer.email, customer.telefoon);
        return {
            ...customer,
            link
        };
    });
}

function formatOutput(customersWithLinks) {
    let output = '';
    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    output += '  OLIEBOLLEN COSTA BLANCA - KLANT LINKS\n';
    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    customersWithLinks.forEach((customer, index) => {
        output += `${index + 1}. ${customer.naam || 'Onbekend'}\n`;
        output += `   Email: ${customer.email || '-'}\n`;
        output += `   Telefoon: ${customer.telefoon || '-'}\n`;
        output += `   Link: ${customer.link}\n\n`;
    });

    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    output += `Totaal: ${customersWithLinks.length} klanten\n`;
    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    return output;
}

function formatEmailTemplate(customersWithLinks) {
    let output = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    output += '  EMAIL TEMPLATE (WhatsApp/Email)\n';
    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    output += 'Hoi [NAAM],\n\n';
    output += 'Fijn dat je vorig jaar oliebollen bij ons hebt besteld! 🎉\n\n';
    output += 'Ook dit jaar maken we weer verse oliebollen voor 31 december 2025.\n';
    output += 'Bestel ze gemakkelijk via deze persoonlijke link:\n\n';
    output += '[LINK]\n\n';
    output += 'Je gegevens staan al ingevuld, dus je hoeft alleen maar je bestelling te kiezen!\n\n';
    output += 'Tot snel!\n';
    output += 'Oliebollen Costa Blanca\n\n';
    output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    return output;
}

// CLI usage
if (require.main === module) {
    const csvFile = process.argv[2];
    const outputFile = process.argv[3];

    if (!csvFile) {
        console.log('Usage: node scripts/csv-to-links.js <customers.csv> [output.txt]');
        console.log('\nCSV format (with or without header):');
        console.log('  naam,email,telefoon');
        console.log('  John Doe,john@example.com,+31612345678');
        console.log('  Jane Smith,jane@example.com,+31687654321');
        console.log('\nExample:');
        console.log('  node scripts/csv-to-links.js customers.csv links-output.txt');
        process.exit(1);
    }

    try {
        const csvPath = path.resolve(csvFile);
        const csvContent = fs.readFileSync(csvPath, 'utf-8');

        console.log(`\n📂 Reading CSV file: ${csvFile}`);

        const customers = parseCSV(csvContent);
        console.log(`✅ Found ${customers.length} customers\n`);

        const customersWithLinks = generateLinks(customers);
        const output = formatOutput(customersWithLinks);
        const emailTemplate = formatEmailTemplate(customersWithLinks);

        console.log(output);
        console.log(emailTemplate);

        if (outputFile) {
            const outputPath = path.resolve(outputFile);
            fs.writeFileSync(outputPath, output + '\n' + emailTemplate);
            console.log(`\n💾 Output saved to: ${outputFile}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}
