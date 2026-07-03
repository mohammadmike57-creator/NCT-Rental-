export class DateUtils {
  static getRowValue(row: any, keys: string[]): any {
    if (!row) return undefined;
    
    // Try exact matches first
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return row[key];
      }
    }

    // Try case-insensitive and trimmed matches
    const rowKeys = Object.keys(row);
    const normalizedKeys = keys.map(k => k.toLowerCase().replace(/[\s\-_.]/g, ''));
    
    for (const rowKey of rowKeys) {
      const normalizedRowKey = rowKey.toLowerCase().replace(/[\s\-_.]/g, '');
      if (normalizedKeys.includes(normalizedRowKey)) {
        if (row[rowKey] !== undefined && row[rowKey] !== null && row[rowKey] !== '') {
          return row[rowKey];
        }
      }
    }
    return undefined;
  }

  static parseExcelDate(value: any, row: any = {}, prefix: string = ''): string {
    // 1. Try to combine from separate columns if value is missing or if we specifically look for it
    const possiblePrefixes = prefix === 'End' ? ['End', 'Return'] : [prefix];
    
    for (const p of possiblePrefixes) {
      const pStr = p ? p + ' ' : '';
      const m = this.getRowValue(row, [`${pStr}Month`, `${pStr}month`, p === '' ? 'Month' : '', p === '' ? 'month' : ''].filter(Boolean));
      const d = this.getRowValue(row, [`${pStr}Day`, `${pStr}day`, p === '' ? 'Day' : '', p === '' ? 'day' : ''].filter(Boolean));
      const y = this.getRowValue(row, [`${pStr}Year`, `${pStr}year`, p === '' ? 'Year' : '', p === '' ? 'year' : ''].filter(Boolean));

      if (m && d && y && (!value || String(value).trim() === '')) {
        let year = String(y);
        if (year.length === 2) year = '20' + year;
        return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00`;
      }
    }

    if (!value) return '';

    // 2. Handle JS Date objects
    if (value instanceof Date) {
      try {
        return value.toISOString().split('.')[0].substring(0, 16);
      } catch (e) {
        return '';
      }
    }

    // 3. Handle numeric (Excel serial dates) just in case
    if (typeof value === 'number' && value > 30000 && value < 60000) {
      try {
        const date = new Date((value - 25569) * 86400 * 1000);
        return date.toISOString().split('.')[0].substring(0, 16);
      } catch (e) {}
    }

    const s = String(value).trim();
    if (!s) return '';

    // 4. Handle MM/DD/YYYY or M/D/YY
    const slashParts = s.split('/');
    if (slashParts.length === 3) {
      let month = slashParts[0].padStart(2, '0');
      let day = slashParts[1].padStart(2, '0');
      let year = slashParts[2];
      if (year.length === 2) year = '20' + year;
      return `${year}-${month}-${day}T12:00`;
    }

    // 5. Handle YYYY-MM-DD (already close to what we want)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.length === 10 ? s + 'T12:00' : s;
    }

    // 6. Generic date parse (supports "June 15 2024", etc.)
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      try {
        return parsed.toISOString().split('.')[0].substring(0, 16);
      } catch (e) {}
    }

    return s;
  }

  static parseNumeric(value: any): number {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    
    const s = String(value).trim();
    if (!s) return 0;
    
    // Remove currency symbols, commas, and other non-numeric characters except decimal point and minus sign
    // But keep the first decimal point
    const cleaned = s.replace(/[^\d.-]/g, '');
    const parsed = parseFloat(cleaned);
    
    return isNaN(parsed) ? 0 : parsed;
  }
}
