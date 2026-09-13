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

  /* --- Form plumbing ------------------------------------------------------ */

  var el = {};
  ['tax-year', 'year-note', 'age-band', 'salary', 'salary-label', 'bonus', 'other-income',
   'retirement', 'retirement-from-pay', 'donations', 'on-scheme', 'medical-fields',
   'medical-members', 'medical-contributions', 'out-of-pocket', 'disability', 'paye-paid',
   'provisional-paid', 'period-monthly', 'period-annual', 'reset-btn', 'sample-chip',
   'verdict', 'verdict-label', 'verdict-figure', 'verdict-note', 'tile-taxable',
   'tile-marginal', 'tile-effective', 'tile-net', 'ladder', 'drop-body', 'statement',
   'tax-form'].forEach(function (id) { el[id] = document.getElementById(id); });

  var EXAMPLE = {
    taxYear: '2026', ageBand: 'under65', period: 'monthly',
    salary: 46500, bonus: 0, otherIncome: 0,
    retirement: 33000, retirementFromPay: false, donations: 0,
    onMedicalScheme: true, medicalMembers: 2, medicalContributions: 36000,
    outOfPocket: 0, disability: false,
    payePaid: 111776, provisionalPaid: 0,
    isExample: true
  };

  function populateYears() {
    var keys = Object.keys(T.YEARS).sort().reverse();
    el['tax-year'].innerHTML = keys.map(function (k) {
      return '<option value="' + k + '">' + k + ' tax year &mdash; ' + T.YEARS[k].period + '</option>';
    }).join('');
  }

  function writeForm(s) {
    el['tax-year'].value = s.taxYear;
    el['age-band'].value = s.ageBand;
    el['period-monthly'].checked = s.period === 'monthly';
    el['period-annual'].checked = s.period !== 'monthly';
    el.salary.value = plainRand(s.period === 'monthly' ? s.salary : s.salary);
    el.bonus.value = plainRand(s.bonus);
    el['other-income'].value = plainRand(s.otherIncome);
    el.retirement.value = plainRand(s.retirement);
    el['retirement-from-pay'].checked = !!s.retirementFromPay;
    el.donations.value = plainRand(s.donations);
    el['on-scheme'].checked = !!s.onMedicalScheme;
    el['medical-members'].value = String(s.medicalMembers || 0);
    el['medical-contributions'].value = plainRand(s.medicalContributions);
    el['out-of-pocket'].value = plainRand(s.outOfPocket);
    el.disability.checked = !!s.disability;
    el['paye-paid'].value = plainRand(s.payePaid);
    el['provisional-paid'].value = plainRand(s.provisionalPaid);
  }

  function readForm() {
    var period = el['period-monthly'].checked ? 'monthly' : 'annual';
    return {
      taxYear: el['tax-year'].value,
      ageBand: el['age-band'].value,
      period: period,
      salary: parseRand(el.salary.value),
      bonus: parseRand(el.bonus.value),
      otherIncome: parseRand(el['other-income'].value),
      retirement: parseRand(el.retirement.value),
      retirementFromPay: el['retirement-from-pay'].checked,
      donations: parseRand(el.donations.value),
      onMedicalScheme: el['on-scheme'].checked,
      medicalMembers: Math.max(0, Math.round(parseRand(el['medical-members'].value))),
      medicalContributions: parseRand(el['medical-contributions'].value),
      outOfPocket: parseRand(el['out-of-pocket'].value),
      disability: el.disability.checked,
      payePaid: parseRand(el['paye-paid'].value),
      provisionalPaid: parseRand(el['provisional-paid'].value)
    };
  }

  /* The calculator works in annual rands; the form may be in monthly ones. */
  function toAnnual(s) {
    var out = {};
    for (var k in s) out[k] = s[k];
    out.salary = s.period === 'monthly' ? s.salary * 12 : s.salary;
    return out;
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
      return s;
    } catch (e) { return null; }
  }

  /* --- Drawing ------------------------------------------------------------ */

  function renderVerdict(r, isExample) {
    var refund = r.balance >= 0;
    el.verdict.className = 'verdict ' + (Math.abs(r.balance) < 1 ? '' : (refund ? 'is-refund' : 'is-owing'));
    el['sample-chip'].hidden = !isExample;

    if (r.alreadyPaid === 0) {
      el['verdict-label'].textContent = 'Tax for the year';
      el['verdict-figure'].textContent = rand(r.netTax);
      el['verdict-note'].textContent = r.netTax === 0
        ? 'Taxable income of ' + rand(r.taxableIncome) + ' is under the ' + rand(r.threshold) +
          ' threshold for your age, so no tax is due.'
        : 'Fill in the PAYE from your IRP5 to see whether you are owed a refund or have to pay in.';
    } else if (Math.abs(r.balance) < 1) {
      el['verdict-label'].textContent = 'Square with SARS';
      el['verdict-figure'].textContent = rand(0);
      el['verdict-note'].textContent = 'What you paid over matches the tax for the year almost exactly.';
    } else if (refund) {
      el['verdict-label'].textContent = 'Estimated refund due to you';
      el['verdict-figure'].textContent = rand(r.balance);
      el['verdict-note'].textContent = 'You paid ' + rand(r.alreadyPaid) + ' against a bill of ' +
        rand(r.netTax) + '. SARS normally pays a refund into your bank account within a few working days of the assessment.';
    } else {
      el['verdict-label'].textContent = 'Estimated amount you owe SARS';
      el['verdict-figure'].textContent = rand(-r.balance);
      el['verdict-note'].textContent = 'Your bill is ' + rand(r.netTax) + ' but only ' +
        rand(r.alreadyPaid) + ' has been paid over. The shortfall is payable on assessment.';
    }

    el['tile-taxable'].textContent = rand(r.taxableIncome);
    el['tile-marginal'].textContent = r.belowThreshold ? '0%' : pct(r.marginalRate, 0);
    el['tile-effective'].textContent = pct(r.effectiveRate);
    el['tile-net'].textContent = rand(r.netPayMonthly);
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

  function renderDrop(state, annual) {
    var d = ZATax.bracketDrop(annual);
    var r = d.current;
    var html = '';

    if (d.status === 'below-threshold') {
      html = '<div class="drop-card">' +
        '<p class="drop-verdict can">Nothing to drop &mdash; you are already under the tax threshold.</p>' +
        '<p class="drop-note">Taxable income of ' + rand(r.taxableIncome) + ' sits below the ' +
        rand(r.threshold) + ' threshold for your age band, so the rebates cancel your tax entirely. ' +
        'A retirement contribution would buy you no tax saving this year.</p></div>';
      el['drop-body'].innerHTML = html;
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

  function renderStatement(r) {
    var out = '';
    var hasOtherIncome = r.incomeBeforeDeductions > r.remuneration;
    out += row('Salary, bonus and allowances', rand(r.remuneration),
      hasOtherIncome ? '' : 'is-total');
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

    if (r.payePaid > 0) out += row('Less PAYE already deducted', '-' + rand(r.payePaid), '', 'Code 4102 on your IRP5');
    if (r.provisionalPaid > 0) out += row('Less provisional tax paid', '-' + rand(r.provisionalPaid));

    var refund = r.balance >= 0;
    out += row(refund ? 'Refund due to you' : 'Payable to SARS',
      rand(Math.abs(r.balance)), 'is-total is-final ' + (refund ? 'refund' : 'owing'));

    out += row('UIF off your payslip', rand(r.uifMonthly, 2) + ' a month', '',
      '1% of remuneration, on a ' + rand(T.UIF.monthlyCeiling) + ' a month ceiling. Not income tax, and not part of the assessment above.');

    el.statement.innerHTML = out;
  }

  /* --- Loop --------------------------------------------------------------- */

  var state = null;

  function update() {
    var form = readForm();
    form.isExample = state ? state.isExample : false;
    state = form;

    el['salary-label'].textContent = form.period === 'monthly' ? 'Monthly salary' : 'Annual salary';
    el['year-note'].textContent = T.YEARS[form.taxYear].note;
    el['medical-fields'].hidden = !form.onMedicalScheme;

    var annual = toAnnual(form);
    var r = ZATax.assess(annual, 0);

    renderVerdict(r, form.isExample);
    renderLadder(r);
    renderDrop(state, annual);
    renderStatement(r);
    save(state);
  }

  function init() {
    populateYears();
    var saved = load();
    state = saved || EXAMPLE;
    writeForm(state);
    update();

    el['tax-form'].addEventListener('input', function (e) {
      if (e.target && e.target.id !== 'tax-year' && e.target.id !== 'age-band') state.isExample = false;
      update();
    });
    el['tax-form'].addEventListener('change', function () { update(); });

    // Tidy the number up once the field loses focus, so R46500 reads R46 500.
    el['tax-form'].addEventListener('focusout', function (e) {
      var t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'text' && t.value.trim() !== '') {
        t.value = plainRand(parseRand(t.value));
      }
    }, true);

    el['reset-btn'].addEventListener('click', function () {
      try { localStorage.removeItem(STORE_KEY); } catch (err) { /* private mode */ }
      state = JSON.parse(JSON.stringify(EXAMPLE));
      writeForm(state);
      update();
    });
  }

  init();
})();
