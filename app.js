/* Wires the form to the maths in calc.js and draws the results. */
(function () {
  'use strict';

  var T = window.ZATaxTables;
  var ZATax = window.ZATax;
  var STORE_KEY = 'za-tax-ladder/v1';
  var NBSP = ' ';

  /* --- Money in and out --------------------------------------------------- */

  function parseRand(value) {
    if (value === null || value === undefined) return 0;
    var cleaned = String(value).replace(/[^0-9.,-]/g, '').replace(/\s/g, '');
    // A comma used as the decimal mark, South African style.
    if (/,\d{1,2}$/.test(cleaned) && cleaned.indexOf('.') === -1) cleaned = cleaned.replace(',', '.');
    cleaned = cleaned.replace(/,/g, '');
    var n = parseFloat(cleaned);
    return isFinite(n) ? n : 0;
  }

  function groupDigits(whole) {
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  /* SARS writes amounts with a space between thousands: R1 234 567.89 */
  function rand(n, decimals) {
    var d = decimals || 0;
    var negative = n < 0;
    var fixed = Math.abs(n).toFixed(d);
    var parts = fixed.split('.');
    var out = 'R' + groupDigits(parts[0]) + (parts[1] ? '.' + parts[1] : '');
    return negative ? '-' + out : out;
  }

  function plainRand(n) { return groupDigits(String(Math.round(n))); }

  function pct(rate, decimals) {
    var d = decimals === undefined ? 1 : decimals;
    return (rate * 100).toFixed(d).replace(/\.0$/, '') + '%';
  }

  function sum(list, pick) {
    return list.reduce(function (a, x) { return a + (pick ? pick(x) : x); }, 0);
  }

  function month(taxYear, index, withYear) { return ZATax.monthLabel(taxYear, index, withYear); }

  /* --- Form plumbing ------------------------------------------------------ */

  var el = {};
  ['tax-year', 'year-note', 'age-band', 'salary', 'salary-label', 'salary-hint', 'bonus', 'other-income',
   'salary-varies', 'salary-changes', 'change-rows', 'add-change', 'schedule-note',
   'retirement', 'retirement-from-pay', 'donations', 'on-scheme', 'medical-fields',
   'medical-members', 'medical-contributions', 'medical-through-payroll', 'out-of-pocket', 'disability',
   'paye-label', 'paye-mode-irp5', 'paye-mode-estimate', 'paye-irp5-fields', 'paye-estimate-fields',
   'paye-paid', 'paye-so-far', 'paye-so-far-month', 'paye-method', 'bonus-month-field', 'bonus-month',
   'paye-estimate-note', 'provisional-paid', 'period-monthly', 'period-annual', 'reset-btn', 'sample-chip',
   'verdict', 'verdict-label', 'verdict-figure', 'verdict-note', 'tile-taxable',
   'tile-marginal', 'tile-effective', 'tile-net', 'tile-net-label', 'ladder', 'drop-body', 'statement',
   'months-block', 'months-intro', 'months-table', 'tax-form'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  var DEFAULTS = {
    taxYear: T.DEFAULT_YEAR, ageBand: 'under65', period: 'monthly',
    salary: 0, salaryVaries: false, salaryChanges: [],
    bonus: 0, bonusMonth: 9, otherIncome: 0,
    retirement: 0, retirementFromPay: true, donations: 0,
    onMedicalScheme: false, medicalMembers: 0, medicalContributions: 0, medicalThroughPayroll: true,
    outOfPocket: 0, disability: false,
    payeMode: 'irp5', payePaid: 0, payeSoFar: 0, payeSoFarMonth: -1, payeMethod: 'cumulative',
    provisionalPaid: 0,
    isExample: false
  };

  var EXAMPLE = withDefaults({
    taxYear: '2026', salary: 46500,
    retirement: 33000, retirementFromPay: false,
    onMedicalScheme: true, medicalMembers: 2, medicalContributions: 36000,
    payePaid: 111776,
    isExample: true
  });

  function withDefaults(s) {
    var out = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];
    for (var j in (s || {})) if (s[j] !== undefined) out[j] = s[j];
    out.salaryChanges = (out.salaryChanges || []).map(function (c) {
      return { month: Number(c.month) || 0, amount: Number(c.amount) || 0 };
    });
    return out;
  }

  function populateYears() {
    var keys = Object.keys(T.YEARS).sort().reverse();
    el['tax-year'].innerHTML = keys.map(function (k) {
      return '<option value="' + k + '">' + k + ' tax year &mdash; ' + T.YEARS[k].period + '</option>';
    }).join('');
  }

  function monthOptions(taxYear, noneLabel) {
    var out = noneLabel ? '<option value="-1">' + noneLabel + '</option>' : '';
    for (var i = 0; i < 12; i++) {
      out += '<option value="' + i + '">' + month(taxYear, i, true) + '</option>';
    }
    return out;
  }

  function fillMonthSelect(select, taxYear, value, noneLabel) {
    select.innerHTML = monthOptions(taxYear, noneLabel);
    select.value = String(value);
  }

  /* The change rows are rebuilt only when their number or the tax year
     changes, never while someone is typing in one. */
  function renderChangeRows(s) {
    el['change-rows'].innerHTML = s.salaryChanges.map(function (ch, i) {
      return '<div class="change-row">' +
        '<span class="from">From</span>' +
        '<select id="change-month-' + i + '" class="change-month" aria-label="Month the change takes effect">' +
          monthOptions(s.taxYear) + '</select>' +
        '<div class="money"><span class="rand" aria-hidden="true">R</span>' +
          '<input type="text" inputmode="decimal" id="change-amount-' + i + '" class="change-amount" ' +
          'aria-label="Salary from that month" value="' + plainRand(ch.amount) + '"></div>' +
        '<button type="button" class="icon-btn change-remove" data-index="' + i + '" aria-label="Remove this change">&times;</button>' +
      '</div>';
    }).join('');
    s.salaryChanges.forEach(function (ch, i) {
      document.getElementById('change-month-' + i).value = String(ch.month);
    });
  }

  var renderedYear = null;
  function syncMonthControls(s) {
    renderChangeRows(s);
    fillMonthSelect(el['paye-so-far-month'], s.taxYear, s.payeSoFarMonth, 'Nothing yet');
    fillMonthSelect(el['bonus-month'], s.taxYear, s.bonusMonth);
    renderedYear = s.taxYear;
  }

  function writeForm(s) {
    el['tax-year'].value = s.taxYear;
    el['age-band'].value = s.ageBand;
    el['period-monthly'].checked = s.period === 'monthly';
    el['period-annual'].checked = s.period !== 'monthly';
    el.salary.value = plainRand(s.salary);
    el['salary-varies'].checked = !!s.salaryVaries;
    el.bonus.value = plainRand(s.bonus);
    el['other-income'].value = plainRand(s.otherIncome);
    el.retirement.value = plainRand(s.retirement);
    el['retirement-from-pay'].checked = !!s.retirementFromPay;
    el.donations.value = plainRand(s.donations);
    el['on-scheme'].checked = !!s.onMedicalScheme;
    el['medical-members'].value = String(s.medicalMembers || 0);
    el['medical-contributions'].value = plainRand(s.medicalContributions);
    el['medical-through-payroll'].checked = !!s.medicalThroughPayroll;
    el['out-of-pocket'].value = plainRand(s.outOfPocket);
    el.disability.checked = !!s.disability;
    el['paye-mode-irp5'].checked = s.payeMode !== 'estimate';
    el['paye-mode-estimate'].checked = s.payeMode === 'estimate';
    el['paye-paid'].value = plainRand(s.payePaid);
    el['paye-so-far'].value = plainRand(s.payeSoFar);
    el['paye-method'].value = s.payeMethod;
    el['provisional-paid'].value = plainRand(s.provisionalPaid);
    syncMonthControls(s);
  }

  function readChanges() {
    var rows = el['change-rows'].querySelectorAll('.change-row');
    return Array.prototype.map.call(rows, function (row) {
      return {
        month: parseInt(row.querySelector('.change-month').value, 10) || 0,
        amount: parseRand(row.querySelector('.change-amount').value)
      };
    });
  }

  function readForm() {
    return {
      taxYear: el['tax-year'].value,
      ageBand: el['age-band'].value,
      period: el['period-monthly'].checked ? 'monthly' : 'annual',
      salary: parseRand(el.salary.value),
      salaryVaries: el['salary-varies'].checked,
      salaryChanges: readChanges(),
      bonus: parseRand(el.bonus.value),
      bonusMonth: parseInt(el['bonus-month'].value, 10),
      otherIncome: parseRand(el['other-income'].value),
      retirement: parseRand(el.retirement.value),
      retirementFromPay: el['retirement-from-pay'].checked,
      donations: parseRand(el.donations.value),
      onMedicalScheme: el['on-scheme'].checked,
      medicalMembers: Math.max(0, Math.round(parseRand(el['medical-members'].value))),
      medicalContributions: parseRand(el['medical-contributions'].value),
      medicalThroughPayroll: el['medical-through-payroll'].checked,
      outOfPocket: parseRand(el['out-of-pocket'].value),
      disability: el.disability.checked,
      payeMode: el['paye-mode-estimate'].checked ? 'estimate' : 'irp5',
      payePaid: parseRand(el['paye-paid'].value),
      payeSoFar: parseRand(el['paye-so-far'].value),
      payeSoFarMonth: parseInt(el['paye-so-far-month'].value, 10),
      payeMethod: el['paye-method'].value,
      provisionalPaid: parseRand(el['provisional-paid'].value)
    };
  }

  function save(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !T.YEARS[s.taxYear]) return null;
      return withDefaults(s);
    } catch (e) { return null; }
  }

  /* --- The year's salary, month by month ---------------------------------- */

  function buildSchedule(form) {
    var unit = form.period === 'monthly' ? 1 : 12;
    var changes = form.salaryVaries
      ? form.salaryChanges.map(function (c) { return { month: c.month, amount: c.amount / unit }; })
      : [];
    return { unit: unit, months: ZATax.salarySchedule(form.salary / unit, changes) };
  }

  function scheduleNote(schedule, taxYear) {
    var segs = [];
    schedule.months.forEach(function (rate, i) {
      var last = segs[segs.length - 1];
      if (last && last.rate === rate) last.to = i; else segs.push({ rate: rate, from: i, to: i });
    });
    var parts = segs.map(function (s) {
      var span;
      if (s.from === s.to) span = month(taxYear, s.from, true);
      else if (s.from <= 9 && s.to >= 10) span = month(taxYear, s.from, true) + '–' + month(taxYear, s.to, true);
      else span = month(taxYear, s.from, false) + '–' + month(taxYear, s.to, true);
      return span + ' at ' + rand(s.rate * schedule.unit);
    });
    return parts.join(', ') + ': ' + rand(sum(schedule.months)) + ' for the year.';
  }

  /* --- Drawing ------------------------------------------------------------ */

  function renderVerdict(r, form, estimate, otherEstimate, lastMonth) {
    var refund = r.balance >= 0;
    el.verdict.className = 'verdict ' + (Math.abs(r.balance) < 1 ? '' : (refund ? 'is-refund' : 'is-owing'));
    el['sample-chip'].hidden = !form.isExample;
    var estimated = form.payeMode === 'estimate';
    var note;

    if (r.alreadyPaid === 0) {
      el['verdict-label'].textContent = 'Tax for the year';
      el['verdict-figure'].textContent = rand(r.netTax);
      note = r.netTax === 0
        ? 'Taxable income of ' + rand(r.taxableIncome) + ' is under the ' + rand(r.threshold) +
          ' threshold for your age, so no tax is due.'
        : 'Fill in the PAYE from your IRP5, or let the page estimate it, to see whether you are owed a refund or have to pay in.';
    } else if (Math.abs(r.balance) < 1) {
      el['verdict-label'].textContent = 'Square with SARS';
      el['verdict-figure'].textContent = rand(0);
      note = 'What you paid over matches the tax for the year almost exactly.';
    } else if (refund) {
      el['verdict-label'].textContent = 'Estimated refund due to you';
      el['verdict-figure'].textContent = rand(r.balance);
      note = 'You paid ' + rand(r.alreadyPaid) + ' against a bill of ' + rand(r.netTax) +
        '. SARS normally pays a refund into your bank account within a few working days of the assessment.';
    } else {
      el['verdict-label'].textContent = 'Estimated amount you owe SARS';
      el['verdict-figure'].textContent = rand(-r.balance);
      note = 'Your bill is ' + rand(r.netTax) + ' but only ' + rand(r.alreadyPaid) +
        ' has been paid over. The shortfall is payable on assessment.';
    }

    if (estimated && r.alreadyPaid > 0) {
      var otherBalance = r.balance + (otherEstimate.total - estimate.total);
      if (Math.abs(otherBalance - r.balance) >= 1) {
        note += ' PAYE is estimated on the ' + estimate.method + ' method; if payroll uses the other one this becomes ' +
          (otherBalance >= 0 ? 'a refund of ' + rand(otherBalance) : rand(-otherBalance) + ' owing') + '.';
      } else {
        note += ' PAYE is estimated, and comes out the same under either payroll method.';
      }
    }
    el['verdict-note'].textContent = note;

    el['tile-taxable'].textContent = rand(r.taxableIncome);
    el['tile-marginal'].textContent = r.belowThreshold ? '0%' : pct(r.marginalRate, 0);
    el['tile-effective'].textContent = pct(r.effectiveRate);
    el['tile-net'].textContent = rand(Math.max(0, lastMonth.net));
    var changeMonths = form.salaryVaries ? form.salaryChanges.map(function (c) { return c.month; }) : [];
    el['tile-net-label'].textContent = changeMonths.length
      ? 'Net pay from ' + month(form.taxYear, Math.max.apply(null, changeMonths), false)
      : 'Net pay a month';
  }

  function renderLadder(r) {
    var slices = ZATax.sliceBreakdown(r.table, r.taxableIncome);
    el.ladder.innerHTML = slices.map(function (s) {
      var here = s.index === r.bracketIndex && !r.belowThreshold;
      var classes = ['rung'];
      if (s.amountInBracket > 0) classes.push('is-filled'); else classes.push('is-empty');
      if (here) classes.push('is-here');

      var range = s.to === Infinity
        ? 'Above ' + rand(s.from)
        : rand(s.from + (s.from === 0 ? 0 : 1)) + ' to ' + rand(s.to);

      var foot;
      if (s.amountInBracket <= 0) {
        foot = 'None of your income reaches this rung.';
      } else if (s.to === Infinity) {
        foot = rand(s.amountInBracket) + ' of your income is taxed at ' + pct(s.rate, 0) + '.';
      } else {
        foot = rand(s.amountInBracket) + ' of your income is taxed here &mdash; ' +
          pct(s.fill, 0) + ' of the rung' + (here ? ', with ' + rand(s.to - r.taxableIncome) + ' of room left before the next one' : '') + '.';
      }

      return '<li class="' + classes.join(' ') + '">' +
        '<span class="rung-rate">' + pct(s.rate, 0) + '</span>' +
        '<div class="rung-body">' +
          '<div class="rung-head">' +
            '<span class="rung-range">' + range + (here ? '<span class="here-chip">You are here</span>' : '') + '</span>' +
            '<span class="rung-tax">' + rand(s.taxFromBracket) + '</span>' +
          '</div>' +
          '<div class="rung-track"><span class="rung-fill" style="width:' + (s.fill * 100).toFixed(2) + '%"></span></div>' +
          '<p class="rung-foot">' + foot + '</p>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  function figuresList(rows) {
    return '<dl class="drop-figures">' + rows.map(function (row) {
      return '<div><dt>' + row[0] + '</dt><dd' + (row[2] ? ' class="' + row[2] + '"' : '') + '>' + row[1] + '</dd></div>';
    }).join('') + '</dl>';
  }

  var MARGINAL_NOTE = 'Worth being clear about what a bracket is: dropping one does not re-rate everything ' +
    'you earn, it only changes the rate on the slice above the old bracket&rsquo;s floor. That is why the ' +
    'saving below is far smaller than the contribution. The contribution is not lost &mdash; it is in your ' +
    'retirement fund &mdash; but you cannot touch it before 55, apart from the one withdrawal a year the ' +
    'two-pot rules allow, which is taxed at your marginal rate.';

  function limitReason(r) {
    return r.retirementCapBinds
      ? 'the ' + rand(r.table.retirementCap) + ' a year cap'
      : '27.5% of your ' + rand(Math.max(r.remuneration, r.incomeBeforeDeductions)) + ' of remuneration';
  }

  function renderDrop(annual) {
    var d = ZATax.bracketDrop(annual);
    var r = d.current;
    var html = '';

    if (d.status === 'below-threshold') {
      el['drop-body'].innerHTML = '<div class="drop-card">' +
        '<p class="drop-verdict can">Nothing to drop &mdash; you are already under the tax threshold.</p>' +
        '<p class="drop-note">Taxable income of ' + rand(r.taxableIncome) + ' sits below the ' +
        rand(r.threshold) + ' threshold for your age band, so the rebates cancel your tax entirely. ' +
        'A retirement contribution would buy you no tax saving this year.</p></div>';
      return;
    }

    var wantsThreshold = d.status === 'clears-threshold' || d.status === 'threshold-out-of-reach';
    var targetName = wantsThreshold
      ? 'under the ' + rand(d.targetCeiling) + ' tax threshold'
      : 'into the ' + pct(d.targetRate, 0) + ' bracket';

    if (d.feasible) {
      html = '<div class="drop-card">' +
        '<p class="drop-verdict can">Yes. Another <span class="amount">' + rand(d.needed) +
        '</span> into a retirement fund this year takes you ' + targetName + '.</p>' +
        figuresList([
          ['Contribution needed', rand(d.needed)],
          ['Per month, if spread', rand(d.needed / 12)],
          ['Tax it saves', rand(d.saving), 'good'],
          ['Real cost to you', rand(d.netCost)],
          ['Marginal rate after', pct(d.resulting.marginalRate, 0)],
          ['Deductible room left', rand(d.headroom)]
        ]) +
        '<button type="button" class="act-btn" id="apply-drop" data-amount="' + d.needed + '">' +
          'Add ' + rand(d.needed) + ' to my contributions</button>' +
        '<p class="drop-note">' + MARGINAL_NOTE + '</p>' +
      '</div>';
    } else {
      html = '<div class="drop-card">' +
        '<p class="drop-verdict cannot">Not on this salary. You would need <span class="amount">' +
        rand(d.needed) + '</span> of taxable income to disappear to get ' + targetName +
        ', and only <span class="amount">' + rand(d.headroom) + '</span> of deductible room is left.</p>' +
        figuresList([
          ['Would have to shift', rand(d.needed)],
          ['Most you may deduct', rand(d.headroom)],
          ['Still short by', rand(d.shortfall)],
          ['Saving if you used it all', rand(d.maxSaving), 'good'],
          ['Marginal rate', pct(r.marginalRate, 0)]
        ]) +
        (d.headroom > 1
          ? '<button type="button" class="act-btn" id="apply-drop" data-amount="' + Math.floor(d.headroom) + '">' +
            'Use the remaining ' + rand(d.headroom) + '</button>'
          : '') +
        '<p class="drop-note">Section 11F caps the deduction at 27.5% of the greater of your remuneration or ' +
        'taxable income, and at ' + rand(r.table.retirementCap) + ' a year &mdash; here the binding limit is ' +
        limitReason(r) + '. ' + MARGINAL_NOTE + '</p>' +
      '</div>';
    }

    el['drop-body'].innerHTML = html;
    var btn = document.getElementById('apply-drop');
    if (btn) {
      btn.addEventListener('click', function () {
        var add = parseFloat(btn.getAttribute('data-amount')) || 0;
        el.retirement.value = plainRand(parseRand(el.retirement.value) + add);
        state.isExample = false;
        update();
        el.retirement.focus();
      });
    }
  }

  function row(label, value, cls, sub) {
    return '<div class="stmt-row' + (cls ? ' ' + cls : '') + '">' +
      '<dt>' + label + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</dt>' +
      '<dd>' + value + '</dd></div>';
  }

  function renderStatement(r, form, estimate, lastMonth) {
    var out = '';
    var hasOtherIncome = r.incomeBeforeDeductions > r.remuneration;
    out += row('Salary, bonus and allowances', rand(r.remuneration), hasOtherIncome ? '' : 'is-total');
    if (hasOtherIncome) {
      out += row('Other taxable income', rand(r.incomeBeforeDeductions - r.remuneration));
      out += row('Income', rand(r.incomeBeforeDeductions), 'is-total');
    }

    if (r.retirementPaid > 0) {
      out += row('Less retirement fund contributions', '-' + rand(r.retirementDeduction), '',
        r.retirementDisallowed > 0
          ? rand(r.retirementDisallowed) + ' of the ' + rand(r.retirementPaid) +
            ' you paid exceeds the section 11F limit and is not deductible this year'
          : 'Section 11F limit for you: ' + rand(r.retirementLimit));
    }
    if (r.donationsPaid > 0) {
      out += row('Less section 18A donations', '-' + rand(r.donationDeduction), '',
        r.donationsPaid > r.donationDeduction
          ? 'Capped at 10% of taxable income, so ' + rand(r.donationsPaid - r.donationDeduction) + ' falls away'
          : '');
    }
    out += row('Taxable income', rand(r.taxableIncome), 'is-total');

    out += row('Tax per the ' + r.table.label + ' table', rand(r.grossTax));
    out += row('Less rebates', '-' + rand(r.rebates), '', r.table.label + ' rebates for your age band');
    if (r.schemeCredit > 0) {
      out += row('Less medical scheme fees credit', '-' + rand(r.schemeCredit), '',
        'Section 6A, a flat ' + rand(r.schemeCredit / 12) + ' a month for the people on your scheme');
    }
    if (r.extraCredit > 0) {
      out += row('Less additional medical expenses credit', '-' + rand(r.extraCredit), '', 'Section 6B');
    }
    if (r.creditsUsed < r.schemeCredit + r.extraCredit) {
      out += row('Credits that go unused', rand(r.schemeCredit + r.extraCredit - r.creditsUsed), '',
        'Medical credits can wipe out your tax but are never paid out as a refund');
    }
    out += row('Tax for the year', rand(r.netTax), 'is-total');

    if (r.payePaid > 0) {
      if (form.payeMode === 'estimate') {
        var soFar = estimate.paidThroughMonth >= 0;
        out += row('Less PAYE, estimated', '-' + rand(r.payePaid), '',
          (soFar
            ? rand(estimate.paidSoFar) + ' deducted to ' + month(form.taxYear, estimate.paidThroughMonth, true) +
              ', plus ' + rand(estimate.estimatedRemaining) + ' estimated for the rest of the year'
            : 'Estimated for the whole year') + ' on the ' + estimate.method + ' method');
      } else {
        out += row('Less PAYE already deducted', '-' + rand(r.payePaid), '', 'Code 4102 on your IRP5');
      }
    }
    if (r.provisionalPaid > 0) out += row('Less provisional tax paid', '-' + rand(r.provisionalPaid));

    var refund = r.balance >= 0;
    out += row(refund ? 'Refund due to you' : 'Payable to SARS',
      rand(Math.abs(r.balance)), 'is-total is-final ' + (refund ? 'refund' : 'owing'));

    out += row('UIF off your payslip', rand(lastMonth.uif, 2) + ' a month', '',
      '1% of remuneration, on a ' + rand(T.UIF.monthlyCeiling) + ' a month ceiling. Not income tax, and not part of the assessment above.');

    el.statement.innerHTML = out;
  }

  function renderMonths(form, estimate, schedule) {
    var show = form.salaryVaries || form.payeMode === 'estimate';
    el['months-block'].hidden = !show;
    if (!show) return;

    var estimating = form.payeMode === 'estimate';
    var soFarUsed = estimating && estimate.paidThroughMonth >= 0;
    var deductions = form.retirementFromPay && form.retirement > 0 ? 'PAYE, UIF and your retirement contribution' : 'PAYE and UIF';

    var intro = 'What each payslip should look like, worked the way payroll does on the ' + estimate.method +
      ' method: ' + deductions + ' off, leaving net pay.';
    if (soFarUsed) {
      intro += ' Greyed months are behind you — the model’s figure is shown so you can check it against ' +
        'your payslips, but the total uses the ' + rand(estimate.paidSoFar) + ' you actually had deducted.';
    }
    if (!estimating) {
      intro += ' The assessment above uses the PAYE figure you typed in; this is the month-by-month picture behind it.';
    }
    el['months-intro'].textContent = intro;

    var body = estimate.months.map(function (m) {
      var classes = [];
      if (soFarUsed && m.paid) classes.push('is-paid');
      if (m.changed) classes.push('is-change');
      var salaryCell = rand(m.salary) + (m.bonus > 0 ? '<span class="note">plus ' + rand(m.bonus) + ' bonus</span>' : '');
      return '<tr class="' + classes.join(' ') + '">' +
        '<td>' + month(form.taxYear, m.index, true) + (soFarUsed && m.paid ? ' <span class="paid-mark">paid</span>' : '') + '</td>' +
        '<td>' + salaryCell + '</td>' +
        '<td>' + rand(m.paye) + '</td>' +
        '<td>' + rand(m.net) + '</td>' +
      '</tr>';
    }).join('');

    var payeTotal = estimating ? estimate.total : estimate.modelledTotal;
    var payeNote = soFarUsed
      ? '<span class="note">' + rand(estimate.paidSoFar) + ' paid + ' + rand(estimate.estimatedRemaining) + ' estimated</span>'
      : '';
    var salaryTotal = sum(schedule.months) + form.bonus;

    el['months-table'].innerHTML =
      '<thead><tr><th>Month</th><th>Salary</th><th>PAYE</th><th>Net pay</th></tr></thead>' +
      '<tbody>' + body + '</tbody>' +
      '<tfoot><tr><td>Year</td><td>' + rand(salaryTotal) + '</td><td>' + rand(payeTotal) + payeNote + '</td>' +
      '<td>' + rand(sum(estimate.months, function (m) { return m.net; })) + '</td></tr></tfoot>';
  }

  /* --- Loop --------------------------------------------------------------- */

  var state = null;

  function update() {
    var form = readForm();
    form.isExample = state ? state.isExample : false;
    state = form;

    if (form.taxYear !== renderedYear) syncMonthControls(form);

    // Show and hide what the current answers make relevant.
    el['salary-label'].textContent = (form.period === 'monthly' ? 'Monthly salary' : 'Annual salary') +
      (form.salaryVaries ? ' from 1 March' : '');
    el['year-note'].textContent = T.YEARS[form.taxYear].note;
    el['salary-changes'].hidden = !form.salaryVaries;
    el['medical-fields'].hidden = !form.onMedicalScheme;
    var estimating = form.payeMode === 'estimate';
    el['paye-irp5-fields'].hidden = estimating;
    el['paye-estimate-fields'].hidden = !estimating;
    el['bonus-month-field'].hidden = !(estimating && form.bonus > 0);
    el['paye-label'].innerHTML = estimating
      ? 'PAYE for the year <span class="tag">estimated</span>'
      : 'PAYE deducted <span class="tag">IRP5 code 4102</span>';
    el['paye-label'].setAttribute('for', estimating ? 'paye-so-far' : 'paye-paid');

    // The year's salary and what payroll will take from it.
    var schedule = buildSchedule(form);
    el['schedule-note'].textContent = form.salaryVaries ? scheduleNote(schedule, form.taxYear) : '';

    var payrollInput = {
      taxYear: form.taxYear,
      ageBand: form.ageBand,
      monthlySalary: schedule.months,
      bonus: form.bonus,
      bonusMonth: form.bonusMonth,
      retirementMonthly: form.retirementFromPay ? form.retirement / 12 : 0,
      medicalMembers: (form.onMedicalScheme && form.medicalThroughPayroll) ? form.medicalMembers : 0,
      method: form.payeMethod,
      paidSoFar: estimating ? form.payeSoFar : 0,
      paidThroughMonth: estimating ? form.payeSoFarMonth : -1
    };
    var estimate = ZATax.estimatePaye(payrollInput);
    var otherInput = {};
    for (var k in payrollInput) otherInput[k] = payrollInput[k];
    otherInput.method = form.payeMethod === 'annualised' ? 'cumulative' : 'annualised';
    var otherEstimate = ZATax.estimatePaye(otherInput);

    if (estimating) {
      var diff = otherEstimate.total - estimate.total;
      var soFar = estimate.paidThroughMonth >= 0;
      el['paye-estimate-note'].textContent =
        (soFar
          ? rand(estimate.paidSoFar) + ' deducted to ' + month(form.taxYear, estimate.paidThroughMonth, true) +
            ' plus ' + rand(estimate.estimatedRemaining) + ' estimated for ' +
            (estimate.paidThroughMonth < 11 ? month(form.taxYear, estimate.paidThroughMonth + 1, false) + '–Feb' : 'nothing further') +
            ': ' + rand(estimate.total) + ' for the year.'
          : 'Estimated PAYE for the year: ' + rand(estimate.total) + '.') +
        (Math.abs(diff) < 1
          ? ' The same under either method.'
          : ' ' + rand(Math.abs(diff)) + (diff > 0 ? ' more' : ' less') + ' if payroll uses the ' + otherEstimate.method + ' method instead.');
    }

    // The assessment itself works in annual rands.
    var annual = {};
    for (var j in form) annual[j] = form[j];
    annual.salary = sum(schedule.months);
    annual.payePaid = estimating ? estimate.total : form.payePaid;
    var r = ZATax.assess(annual, 0);
    var lastMonth = estimate.months[11];

    renderVerdict(r, form, estimate, otherEstimate, lastMonth);
    renderLadder(r);
    renderDrop(annual);
    renderStatement(r, form, estimate, lastMonth);
    renderMonths(form, estimate, schedule);
    save(state);
  }

  function addChange() {
    var last = state.salaryChanges[state.salaryChanges.length - 1];
    var lastRate = last ? last.amount : state.salary;
    state.salaryChanges.push({ month: last ? Math.min(last.month + 1, 11) : 4, amount: lastRate });
    renderChangeRows(state);
    state.isExample = false;
    update();
    var added = document.getElementById('change-amount-' + (state.salaryChanges.length - 1));
    if (added) { added.focus(); added.select(); }
  }

  function init() {
    populateYears();
    state = load() || withDefaults(EXAMPLE);
    writeForm(state);
    update();

    // Enter in a field must never reload the page.
    el['tax-form'].addEventListener('submit', function (e) { e.preventDefault(); });

    el['tax-form'].addEventListener('input', function (e) {
      if (e.target && e.target.id !== 'tax-year' && e.target.id !== 'age-band') state.isExample = false;
      update();
    });
    el['tax-form'].addEventListener('change', function (e) {
      if (e.target && e.target.id === 'salary-varies' && e.target.checked && readChanges().length === 0) {
        state = readForm();
        addChange();
        return;
      }
      update();
    });

    el['add-change'].addEventListener('click', function () {
      state = readForm();
      addChange();
    });
    el['change-rows'].addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.change-remove') : null;
      if (!btn) return;
      state = readForm();
      state.salaryChanges.splice(parseInt(btn.getAttribute('data-index'), 10), 1);
      renderChangeRows(state);
      state.isExample = false;
      update();
    });

    // Tidy the number up once the field loses focus, so R46500 reads R46 500.
    el['tax-form'].addEventListener('focusout', function (e) {
      var t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'text' && t.value.trim() !== '') {
        t.value = plainRand(parseRand(t.value));
      }
    }, true);

    el['reset-btn'].addEventListener('click', function () {
      try { localStorage.removeItem(STORE_KEY); } catch (err) { /* private mode */ }
      state = withDefaults(EXAMPLE);
      writeForm(state);
      update();
    });
  }

  init();
})();
