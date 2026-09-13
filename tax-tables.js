/*
 * SARS personal income tax tables.
 *
 * Each year of assessment runs 1 March to the end of February.
 * Bracket rows are read as: tax = base + rate x (taxable income - above)
 *
 * TO UPDATE AFTER A BUDGET SPEECH (late February):
 *   1. Add a new entry at the top of YEARS, keyed by the year of assessment.
 *   2. Copy the seven bracket rows, the three rebates, the three thresholds,
 *      the medical scheme fees credits and the section 11F cap from
 *      sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 *   3. Set DEFAULT_YEAR to the year people are most likely filing for.
 *
 * Sanity check for any year you add: threshold x 18% must equal the sum of the
 * rebates that apply at that age, and each bracket's `base` must equal the
 * previous row's base plus its rate x its span. Both hold for every table below.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZATaxTables = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var YEARS = {
    2027: {
      label: '2027',
      period: '1 March 2026 - 28 February 2027',
      note: 'Current year of assessment. Brackets, rebates and medical credits were adjusted in the February 2026 Budget, which also lifted the retirement fund cap to R430 000.',
      brackets: [
        { above: 0,       max: 245100,   rate: 0.18, base: 0      },
        { above: 245100,  max: 383100,   rate: 0.26, base: 44118  },
        { above: 383100,  max: 530200,   rate: 0.31, base: 79998  },
        { above: 530200,  max: 695800,   rate: 0.36, base: 125599 },
        { above: 695800,  max: 887000,   rate: 0.39, base: 185215 },
        { above: 887000,  max: 1878600,  rate: 0.41, base: 259783 },
        { above: 1878600, max: Infinity, rate: 0.45, base: 666339 }
      ],
      rebates:    { primary: 17820, secondary: 9765, tertiary: 3249 },
      thresholds: { under65: 99000, age65to74: 153250, age75plus: 171300 },
      medicalCredit: { firstTwo: 376, additional: 254 },
      retirementCap: 430000
    },
    2026: {
      label: '2026',
      period: '1 March 2025 - 28 February 2026',
      note: 'The year most people are filing a return for now. The February 2025 Budget left the brackets, rebates and medical credits unchanged from 2025.',
      brackets: [
        { above: 0,       max: 237100,   rate: 0.18, base: 0      },
        { above: 237100,  max: 370500,   rate: 0.26, base: 42678  },
        { above: 370500,  max: 512800,   rate: 0.31, base: 77362  },
        { above: 512800,  max: 673000,   rate: 0.36, base: 121475 },
        { above: 673000,  max: 857900,   rate: 0.39, base: 179147 },
        { above: 857900,  max: 1817000,  rate: 0.41, base: 251258 },
        { above: 1817000, max: Infinity, rate: 0.45, base: 644489 }
      ],
      rebates:    { primary: 17235, secondary: 9444, tertiary: 3145 },
      thresholds: { under65: 95750, age65to74: 148217, age75plus: 165689 },
      medicalCredit: { firstTwo: 364, additional: 246 },
      retirementCap: 350000
    },
    2025: {
      label: '2025',
      period: '1 March 2024 - 28 February 2025',
      note: 'Identical tables to 2026 - the February 2025 Budget made no adjustment, so two years of inflation pushed people up brackets without any rate changing.',
      brackets: [
        { above: 0,       max: 237100,   rate: 0.18, base: 0      },
        { above: 237100,  max: 370500,   rate: 0.26, base: 42678  },
        { above: 370500,  max: 512800,   rate: 0.31, base: 77362  },
        { above: 512800,  max: 673000,   rate: 0.36, base: 121475 },
        { above: 673000,  max: 857900,   rate: 0.39, base: 179147 },
        { above: 857900,  max: 1817000,  rate: 0.41, base: 251258 },
        { above: 1817000, max: Infinity, rate: 0.45, base: 644489 }
      ],
      rebates:    { primary: 17235, secondary: 9444, tertiary: 3145 },
      thresholds: { under65: 95750, age65to74: 148217, age75plus: 165689 },
      medicalCredit: { firstTwo: 364, additional: 246 },
      retirementCap: 350000
    }
  };

  return {
    YEARS: YEARS,
    DEFAULT_YEAR: '2026',
    // Retirement fund contributions are deductible up to this share of the
    // greater of remuneration or taxable income (section 11F), capped in rands
    // per year by the `retirementCap` on each table above.
    RETIREMENT_RATE: 0.275,
    // Donations to a section 18A approved public benefit organisation are
    // deductible up to this share of taxable income.
    DONATION_RATE: 0.10,
    // Additional medical expenses credit (section 6B).
    AMTC: {
      under65Rate: 0.25,       // 25% of qualifying spend above the 7.5% floor
      under65Floor: 0.075,     // floor is 7.5% of taxable income
      under65CreditMultiple: 4,
      age65PlusRate: 1 / 3,    // 33.3%, with no income floor
      age65PlusCreditMultiple: 3
    },
    // Employee UIF: 1% of remuneration, on a monthly earnings ceiling.
    UIF: { rate: 0.01, monthlyCeiling: 17712 }
  };
});
