#!/usr/bin/env node
/**
 * Generate personalized order links for returning customers
 *
 * Usage:
 *   node scripts/generate-links.js customers.csv > links.csv
 *
 * Input CSV format (with header):
 *   naam,email,telefoon
 *   Jan de Vries,jan@example.com,0612345678
 *   ...
 *
 * Output CSV:
 *   naam,email,link
 *   Jan de Vries,jan@example.com,https://oliebollencostablanca.com/?naam=Jan%20de%20Vries&email=jan%40example.com&telefoon=0612345678
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://oliebollencostablanca.com/';

function parseCSV(content) {
    const lines = content.trim().split('\n');
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());

    return lines.slice(1).map(line => {
        // Handle quoted values with commas
        const values = [];
        let current = '';
        let inQuotes = false;

        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        const obj = {};
        header.forEach((h, i) => {
            obj[h] = values[i] || '';
        });
        return obj;
    });
}

function generateLink(customer) {
    const params = new URLSearchParams();

    if (customer.naam) params.set('naam', customer.naam);
    if (customer.email) params.set('email', customer.email);
    if (customer.telefoon) params.set('telefoon', customer.telefoon);

    return `${BASE_URL}?${params.toString()}`;
}

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
Personalized Link Generator for Oliebollen Costa Blanca

Usage:
  node scripts/generate-links.js <input.csv> [--output links.csv]

Input CSV format:
  naam,email,telefoon
  Jan de Vries,jan@example.com,0612345678
  Marie Jansen,marie@example.com,0687654321

Example:
  node scripts/generate-links.js customers.csv > output.csv
  node scripts/generate-links.js customers.csv --output links.csv

The output can be used in email campaigns (Mailchimp, Resend, etc.)
`);
        process.exit(0);
    }

    const inputFile = args[0];

    if (!fs.existsSync(inputFile)) {
        console.error(`Error: File not found: ${inputFile}`);
        process.exit(1);
    }

    const content = fs.readFileSync(inputFile, 'utf-8');
    const customers = parseCSV(content);

    // Output header
    console.log('naam,email,telefoon,link');

    // Generate links for each customer
    for (const customer of customers) {
        const link = generateLink(customer);
        // Escape values for CSV
        const naam = customer.naam.includes(',') ? `"${customer.naam}"` : customer.naam;
        const email = customer.email;
        const telefoon = customer.telefoon || '';

        console.log(`${naam},${email},${telefoon},${link}`);
    }
}

main();
