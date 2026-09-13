/*
 * The tax maths. Pure functions, no DOM - so the same code runs the page and
 * the tests in test/calc.test.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./tax-tables.js'));
  } else {
    root.ZATax = factory(root.ZATaxTables);
  }
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  function clampPositive(n) { return n > 0 ? n : 0; }

  function bracketIndexFor(brackets, taxableIncome) {
    for (var i = 0; i < brackets.length; i++) {
      if (taxableIncome <= brackets[i].max) return i;
    }
    return brackets.length - 1;
  }

  /* Tax straight off the table, before any rebate or credit. */
  function taxPerTables(brackets, taxableIncome) {
    var ti = clampPositive(taxableIncome);
    var b = brackets[bracketIndexFor(brackets, ti)];
    return b.base + b.rate * (ti - b.above);
  }

  function rebatesFor(table, ageBand) {
    var r = table.rebates.primary;
    if (ageBand === 'age65to74' || ageBand === 'age75plus') r += table.rebates.secondary;
    if (ageBand === 'age75plus') r += table.rebates.tertiary;
    return r;
  }

  function thresholdFor(table, ageBand) {
    return table.thresholds[ageBand] || table.thresholds.under65;
  }

  /* Section 6A: a flat credit per person on the scheme, not a deduction. */
  function medicalSchemeCredit(table, members) {
    var m = clampPositive(Math.floor(members));
    if (m === 0) return 0;
    var monthly = Math.min(m, 2) * table.medicalCredit.firstTwo
      + clampPositive(m - 2) * table.medicalCredit.additional;
    return monthly * 12;
  }

  /*
   * Section 6B: the credit for contributions and out-of-pocket costs that the
   * flat section 6A credit did not cover. Under 65 there is a floor of 7.5% of
   * taxable income to clear first, which is why most people get nothing here.
   */
  function additionalMedicalCredit(opts) {
    var a = T.AMTC;
    var contributions = clampPositive(opts.contributions);
    var outOfPocket = clampPositive(opts.outOfPocket);
    var schemeCredit = opts.schemeCredit;

    if (opts.ageBand === 'age65to74' || opts.ageBand === 'age75plus' || opts.disability) {
      var excess = clampPositive(contributions - a.age65PlusCreditMultiple * schemeCredit);
      return a.age65PlusRate * (excess + outOfPocket);
    }
    var excessUnder65 = clampPositive(contributions - a.under65CreditMultiple * schemeCredit);
    var qualifying = excessUnder65 + outOfPocket - a.under65Floor * clampPositive(opts.taxableIncome);
    return a.under65Rate * clampPositive(qualifying);
  }

  /*
   * Section 11F: 27.5% of the greater of remuneration or taxable income,
   * capped in rands. Taxable income here is measured before this deduction,
   * so putting more into a fund never shrinks your own allowance.
   */
  function retirementLimit(table, remuneration, incomeBeforeDeductions) {
    var base = Math.max(clampPositive(remuneration), clampPositive(incomeBeforeDeductions));
    return Math.min(T.RETIREMENT_RATE * base, table.retirementCap);
  }

  /*
   * The whole assessment, in the order SARS works it out.
   * `extraRetirement` lets the caller ask "what if I put in more?" without
   * touching the stored inputs.
   */
  function assess(input, extraRetirement) {
    var table = T.YEARS[input.taxYear] || T.YEARS[T.DEFAULT_YEAR];
    var extra = clampPositive(extraRetirement || 0);

    var salary = clampPositive(input.salary);
    var bonus = clampPositive(input.bonus);
    var otherIncome = clampPositive(input.otherIncome);

    // Remuneration is the salary side only; other income is not remuneration.
    var remuneration = salary + bonus;
    var incomeBeforeDeductions = remuneration + otherIncome;

    // --- Retirement fund contributions -----------------------------------
    var retirementLimitRands = retirementLimit(table, remuneration, incomeBeforeDeductions);
    var retirementPaid = clampPositive(input.retirement) + extra;
    var retirementDeduction = Math.min(retirementPaid, retirementLimitRands);
    var retirementDisallowed = retirementPaid - retirementDeduction;
    var retirementHeadroom = clampPositive(retirementLimitRands - clampPositive(input.retirement));

    var afterRetirement = clampPositive(incomeBeforeDeductions - retirementDeduction);

    // --- Section 18A donations -------------------------------------------
    var donationLimit = T.DONATION_RATE * afterRetirement;
    var donationsPaid = clampPositive(input.donations);
    var donationDeduction = Math.min(donationsPaid, donationLimit);

    var taxableIncome = clampPositive(afterRetirement - donationDeduction);

    // --- Tax, rebates and credits ----------------------------------------
    var grossTax = taxPerTables(table.brackets, taxableIncome);
    var rebates = rebatesFor(table, input.ageBand);
    var afterRebates = clampPositive(grossTax - rebates);

    var members = input.onMedicalScheme ? clampPositive(input.medicalMembers) : 0;
    var schemeCredit = medicalSchemeCredit(table, members);
    var extraCredit = input.onMedicalScheme
      ? additionalMedicalCredit({
          ageBand: input.ageBand,
          disability: !!input.disability,
          contributions: input.medicalContributions,
          outOfPocket: input.outOfPocket,
          schemeCredit: schemeCredit,
          taxableIncome: taxableIncome
        })
      : additionalMedicalCredit({
          ageBand: input.ageBand,
          disability: !!input.disability,
          contributions: 0,
          outOfPocket: input.outOfPocket,
          schemeCredit: 0,
          taxableIncome: taxableIncome
        });

    // Credits can wipe out your tax but never pay you money on their own.
    var creditsUsed = Math.min(schemeCredit + extraCredit, afterRebates);
    var netTax = clampPositive(afterRebates - creditsUsed);

    // --- What you have already handed over --------------------------------
    var alreadyPaid = clampPositive(input.payePaid) + clampPositive(input.provisionalPaid);
    var balance = alreadyPaid - netTax; // positive = refund, negative = owing

    // --- Rates and monthly view ------------------------------------------
    var idx = bracketIndexFor(table.brackets, taxableIncome);
    var bracket = table.brackets[idx];
    var threshold = thresholdFor(table, input.ageBand);
    var belowThreshold = taxableIncome <= threshold;

    var uifMonthly = Math.min(remuneration / 12, T.UIF.monthlyCeiling) * T.UIF.rate;

    return {
      table: table,
      remuneration: remuneration,
      incomeBeforeDeductions: incomeBeforeDeductions,
      retirementPaid: retirementPaid,
      retirementLimit: retirementLimitRands,
      retirementDeduction: retirementDeduction,
      retirementDisallowed: retirementDisallowed,
      retirementHeadroom: retirementHeadroom,
      retirementCapBinds: T.RETIREMENT_RATE * Math.max(remuneration, incomeBeforeDeductions) > table.retirementCap,
      donationsPaid: donationsPaid,
      donationLimit: donationLimit,
      donationDeduction: donationDeduction,
      taxableIncome: taxableIncome,
      grossTax: grossTax,
      rebates: rebates,
      schemeCredit: schemeCredit,
      extraCredit: extraCredit,
      creditsUsed: creditsUsed,
      netTax: netTax,
      payePaid: clampPositive(input.payePaid),
      provisionalPaid: clampPositive(input.provisionalPaid),
      alreadyPaid: alreadyPaid,
      balance: balance,
      bracketIndex: idx,
      bracket: bracket,
      marginalRate: belowThreshold ? 0 : bracket.rate,
      statutoryRate: bracket.rate,
      threshold: threshold,
      belowThreshold: belowThreshold,
      effectiveRate: incomeBeforeDeductions > 0 ? netTax / incomeBeforeDeductions : 0,
      uifMonthly: uifMonthly
    };
  }

  /*
   * How much tax comes out of each bracket's slice of your income - the part
   * people get wrong. Moving up a bracket only ever re-rates the slice above
   * that bracket's floor, never everything you earn.
   */
  function sliceBreakdown(table, taxableIncome) {
    var ti = clampPositive(taxableIncome);
    return table.brackets.map(function (b, i) {
      var span = b.max === Infinity ? Infinity : b.max - b.above;
      var used = clampPositive(Math.min(ti, b.max) - b.above);
      return {
        index: i,
        rate: b.rate,
        from: b.above,
        to: b.max,
        span: span,
        amountInBracket: used,
        taxFromBracket: used * b.rate,
        fill: span === Infinity ? (used > 0 ? 1 : 0) : (span > 0 ? used / span : 0),
        active: used > 0 && (ti <= b.max)
      };
    });
  }

  /*
   * What would it take to drop a bracket?
   *
   * Retirement contributions are the lever: they come off taxable income
   * before the table is applied. We bisect on the contribution because a
   * larger deduction also shrinks the 10% donations cap, so the relationship
   * is not quite one-for-one and solving it directly would drift.
   */
  function bracketDrop(input) {
    var current = assess(input, 0);
    var brackets = current.table.brackets;
    var idx = current.bracketIndex;
    var headroom = current.retirementHeadroom;

    var result = {
      current: current,
      currentRate: current.bracket.rate,
      headroom: headroom,
      capBinds: current.retirementCapBinds
    };

    if (current.belowThreshold) {
      result.status = 'below-threshold';
      result.targetRate = 0;
      return result;
    }

    // In the lowest bracket there is nothing below to drop into, so the
    // equivalent move is getting under the threshold, where the rebate
    // cancels the tax outright.
    var lowestBracket = idx === 0;
    var targetCeiling = lowestBracket ? current.threshold : brackets[idx - 1].max;
    var targetRate = lowestBracket ? 0 : brackets[idx - 1].rate;
    result.targetRate = targetRate;
    result.targetCeiling = targetCeiling;

    // The taxable income that has to disappear.
    result.gap = Math.ceil(current.taxableIncome - targetCeiling);

    // Best you could do by using every rand of allowance still open to you.
    var best = assess(input, headroom);
    result.maxContribution = headroom;
    result.maxSaving = current.netTax - best.netTax;
    result.maxResulting = best;

    if (best.taxableIncome > targetCeiling) {
      // Out of reach. Section 11F puts a hard ceiling on the deduction, so no
      // contribution - however large - gets there.
      result.status = lowestBracket ? 'threshold-out-of-reach' : 'out-of-reach';
      result.feasible = false;
      result.needed = result.gap;
      result.shortfall = Math.ceil(best.taxableIncome - targetCeiling);
      result.contribution = headroom;
      result.resulting = best;
      result.saving = result.maxSaving;
      result.netCost = headroom - result.maxSaving;
      return result;
    }

    // Reachable. Bisect for the smallest contribution that lands on or under
    // the ceiling - a larger deduction also shrinks the 10% donations cap, so
    // the relationship is not quite one-for-one.
    var lo = 0, hi = headroom;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (assess(input, mid).taxableIncome <= targetCeiling) hi = mid; else lo = mid;
    }
    var needed = Math.min(Math.ceil(hi), headroom);
    for (var guard = 0; guard < 4 && assess(input, needed).taxableIncome > targetCeiling; guard++) {
      needed = Math.min(needed + 1, headroom);
    }

    var after = assess(input, needed);
    result.status = lowestBracket ? 'clears-threshold' : 'possible';
    result.feasible = true;
    result.needed = needed;
    result.contribution = needed;
    result.shortfall = 0;
    result.resulting = after;
    result.saving = current.netTax - after.netTax;
    result.netCost = needed - result.saving;
    return result;
  }

  /* The year of assessment runs March to February. */
  var MONTHS = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];

  function monthLabel(taxYear, index, withYear) {
    var y = Number(taxYear);
    var calendar = index >= 10 ? y : y - 1;
    return MONTHS[index] + (withYear ? ' ' + calendar : '');
  }

  /*
   * Twelve monthly salary figures from the rate on 1 March and any changes
   * during the year. A change applies from its month until the next one.
   * Starting at zero models a job that began part-way through the year.
   */
  function salarySchedule(startMonthly, changes) {
    var sorted = (changes || [])
      .filter(function (ch) { return ch && ch.month >= 0 && ch.month < 12; })
      .slice()
      .sort(function (a, b) { return a.month - b.month; });
    var months = [];
    var rate = clampPositive(startMonthly);
    var next = 0;
    for (var m = 0; m < 12; m++) {
      while (next < sorted.length && sorted[next].month <= m) {
        rate = clampPositive(sorted[next].amount);
        next++;
      }
      months.push(rate);
    }
    return months;
  }

  /* Tax as payroll sees it: the table, the rebates and the flat medical credit. */
  function payrollAnnualTax(table, ageBand, annualIncome, medicalMembers) {
    return clampPositive(
      taxPerTables(table.brackets, clampPositive(annualIncome))
      - rebatesFor(table, ageBand)
      - medicalSchemeCredit(table, medicalMembers)
    );
  }

  /*
   * What payroll will deduct, month by month.
   *
   * Employers may use either of two SARS-sanctioned methods, and they give
   * different answers when pay changes during the year:
   *
   *   cumulative  - averages the year to date and projects it forward, so the
   *                 total deducted lands on the year's tax by February. A raise
   *                 produces no refund on its own.
   *   annualised  - treats each month as if it were repeated all year. Because
   *                 the tables are progressive, months before a raise are taxed
   *                 as if the lower salary lasted all year and months after as
   *                 if the higher one did - which over-deducts a little, and is
   *                 where the "I got a raise, I got a refund" experience comes from.
   *
   * Months up to and including `paidThroughMonth` are treated as already
   * deducted, with `paidSoFar` standing in for their total.
   */
  function estimatePaye(opts) {
    var table = T.YEARS[opts.taxYear] || T.YEARS[T.DEFAULT_YEAR];
    var salaries = opts.monthlySalary || [];
    var bonus = clampPositive(opts.bonus);
    var bonusMonth = (opts.bonusMonth >= 0 && opts.bonusMonth < 12) ? opts.bonusMonth : 9;
    var raMonthly = clampPositive(opts.retirementMonthly);
    var members = clampPositive(opts.medicalMembers);
    var cumulative = opts.method !== 'annualised';
    var paidThrough = (typeof opts.paidThroughMonth === 'number' && opts.paidThroughMonth >= 0)
      ? Math.min(opts.paidThroughMonth, 11) : -1;
    var paidSoFar = clampPositive(opts.paidSoFar);
    var age = opts.ageBand;

    var months = [];
    var cumRemuneration = 0, cumBonus = 0, cumPaye = 0;

    for (var m = 0; m < 12; m++) {
      var salary = clampPositive(salaries[m] || 0);
      var bon = m === bonusMonth ? bonus : 0;
      // Payroll allows the retirement deduction against the month's pay,
      // within the same 27.5% test and one twelfth of the rand cap.
      var raDeductible = Math.min(raMonthly, T.RETIREMENT_RATE * (salary + bon), table.retirementCap / 12);
      var remuneration = clampPositive(salary - raDeductible);
      var paye;

      if (cumulative) {
        cumRemuneration += remuneration;
        cumBonus += bon;
        var projected = cumRemuneration * 12 / (m + 1);
        var onRegular = payrollAnnualTax(table, age, projected, members) * (m + 1) / 12;
        var onBonus = payrollAnnualTax(table, age, projected + cumBonus, members)
          - payrollAnnualTax(table, age, projected, members);
        var cumTax = onRegular + onBonus;
        paye = cumTax - cumPaye;
        cumPaye = cumTax;
      } else {
        var annualised = remuneration * 12;
        paye = payrollAnnualTax(table, age, annualised, members) / 12
          + payrollAnnualTax(table, age, annualised + bon, members)
          - payrollAnnualTax(table, age, annualised, members);
      }

      var uif = Math.min(salary + bon, T.UIF.monthlyCeiling) * T.UIF.rate;
      months.push({
        index: m,
        salary: salary,
        bonus: bon,
        retirement: raMonthly,
        paye: paye,
        uif: uif,
        net: salary + bon - paye - uif - raMonthly,
        paid: m <= paidThrough,
        changed: m > 0 && salary !== clampPositive(salaries[m - 1] || 0)
      });
    }

    var estimatedRemaining = 0, modelledPaid = 0;
    months.forEach(function (x) { if (x.paid) modelledPaid += x.paye; else estimatedRemaining += x.paye; });

    return {
      months: months,
      method: cumulative ? 'cumulative' : 'annualised',
      paidSoFar: paidSoFar,
      paidThroughMonth: paidThrough,
      estimatedRemaining: estimatedRemaining,
      modelledPaid: modelledPaid,
      total: paidSoFar + estimatedRemaining,
      modelledTotal: modelledPaid + estimatedRemaining
    };
  }

  return {
    tables: T,
    MONTHS: MONTHS,
    monthLabel: monthLabel,
    salarySchedule: salarySchedule,
    payrollAnnualTax: payrollAnnualTax,
    estimatePaye: estimatePaye,
    assess: assess,
    bracketDrop: bracketDrop,
    sliceBreakdown: sliceBreakdown,
    taxPerTables: taxPerTables,
    medicalSchemeCredit: medicalSchemeCredit,
    retirementLimit: retirementLimit,
    rebatesFor: rebatesFor,
    thresholdFor: thresholdFor,
    bracketIndexFor: bracketIndexFor
  };
});
