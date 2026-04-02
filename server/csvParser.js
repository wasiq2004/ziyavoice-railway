"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCSV = parseCSV;

function parseCSV(csvString, delimiter) {
    if (delimiter === void 0) { delimiter = ','; }
    // Split into lines
    var lines = csvString.trim().split(/\r?\n/);
    if (lines.length === 0) {
        return [];
    }

    // Parse header
    var headerRaw = lines[0].split(delimiter);
    var header = headerRaw.map(function (field) {
        return field.trim().toLowerCase().replace(/['"]/g, '');
    });

    // Helper to find column index by aliases
    var findColIndex = function (aliases) {
        return header.findIndex(function (col) {
            var normCol = col.replace(/[^a-z]/g, '');
            return aliases.some(function (alias) { return normCol === alias; });
        });
    };

    // Define aliases
    var phoneAliases = ['phone', 'phonenumber', 'mobile', 'cell', 'cellphone', 'tel', 'telephone', 'contact', 'contactnumber'];
    var nameAliases = ['name', 'fullname', 'firstname', 'customer', 'customername', 'businessname', 'company'];
    var emailAliases = ['email', 'emailaddress', 'mail', 'e-mail', 'mailaddress'];

    // Find indices
    var phoneIdx = findColIndex(phoneAliases);
    // If no phone column, try to find a column that looks like phone numbers (heuristic check could be added, but for now strict column name)

    // Optional columns
    var nameIdx = findColIndex(nameAliases);
    var emailIdx = findColIndex(emailAliases);

    if (phoneIdx === -1) {
        // Fallback: Check if there's only one column, treat it as phone
        if (header.length === 1) {
            phoneIdx = 0;
        } else {
            throw new Error('CSV must contain a "Phone" or "Mobile" column');
        }
    }

    // Parse data rows
    var records = [];
    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line) {
            // Handle quoted CSV fields partially (basic split)
            // For robust handling, a library like csv-parse is better, but this suffices for simple cases
            var values = line.split(delimiter).map(function (value) {
                return value.trim().replace(/^"|"$/g, '');
            });

            var phone = values[phoneIdx];
            // Remove non-digit characters for validation
            if (phone) {
                var cleanPhone = phone.replace(/\D/g, '');
                if (cleanPhone.length >= 7) { // Support international numbers generally
                    records.push({
                        phone_number: phone, // Keep original format or clean it? User likely wants original but cleaned is safer for dialing. Let's keep strict original for now but maybe clean in service.
                        name: nameIdx !== -1 ? values[nameIdx] : null,
                        email: emailIdx !== -1 ? values[emailIdx] : null,
                        metadata: {} // For future extensibility
                    });
                }
            }
        }
    }
    return records;
}

exports.default = { parseCSV: parseCSV };
