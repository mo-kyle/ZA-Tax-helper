/* Run with: node test/calc.test.js */
var ZATax = require('../calc.js');
var T = require('../tax-tables.js');

var pass = 0, fail = 0;
function check(name, actual, expected, tol) {
  var ok = Math.abs(actual - expected) <= (tol === undefined ? 0.01 : tol);
  if (ok) { pass++; }
  else { fail++; console.log('  FAIL ' + name + ': got ' + actual + ', expected ' + expected); }
}
function checkTrue(name, actual) {
  if (actual) { pass++; } else { fail++; console.log('  FAIL ' + name + ': expected truthy, got ' + actual); }
}
function section(s) { console.log('\n' + s); }

function baseInput(over) {
  var i = {
    taxYear: '2027', ageBand: 'under65',
    salary: 0, bonus: 0, otherIncome: 0,
    retirement: 0, retirementFromPay: true, donations: 0,
    onMedicalScheme: false, medicalMembers: 0, medicalContributions: 0,
    outOfPocket: 0, disability: false,
    payePaid: 0, provisionalPaid: 0
  };
  for (var k in (over || {})) i[k] = over[k];
  return i;
}

section('Table internals hold for every year');
Object.keys(T.YEARS).forEach(function (y) {
  var table = T.YEARS[y];
  // Each bracket's base must equal the cumulative tax at its floor.
  table.brackets.forEach(function (b, i) {
    if (i === 0) { check(y + ' bracket 1 base', b.base, 0); return; }
    var prev = table.brackets[i - 1];
    check(y + ' bracket ' + (i + 1) + ' base continuous',
      b.base, prev.base + prev.rate * (prev.max - prev.above));
  });
  // Threshold x 18% must exactly absorb the rebates that apply at that age.
  check(y + ' under-65 threshold matches rebate',
    table.thresholds.under65 * 0.18, table.rebates.primary, 1);
  check(y + ' 65-74 threshold matches rebates',
    table.thresholds.age65to74 * 0.18, table.rebates.primary + table.rebates.secondary, 1);
  check(y + ' 75+ threshold matches rebates',
    table.thresholds.age75plus * 0.18,
    table.rebates.primary + table.rebates.secondary + table.rebates.tertiary, 1);
});

section('Nobody pays tax at or below the threshold');
// SARS publishes the 65+ thresholds rounded to the rand, so 18% of the
// published figure can land a few cents over the rebates it is meant to
// cancel (R148 217 x 18% = R26 679.06 against R26 679 of rebates). That is in
// the published table, not in the arithmetic here, so assert to the rand.
Object.keys(T.YEARS).forEach(function (y) {
  ['under65', 'age65to74', 'age75plus'].forEach(function (age) {
    var threshold = T.YEARS[y].thresholds[age];
    check(y + '/' + age + ' at threshold',
      ZATax.assess(baseInput({ taxYear: y, ageBand: age, salary: threshold })).netTax, 0, 1);
    checkTrue(y + '/' + age + ' one rand over threshold pays tax',
      ZATax.assess(baseInput({ taxYear: y, ageBand: age, salary: threshold + 1000 })).netTax > 0);
  });
});

section('Worked example: R540 000 salary, 2027, under 65');
var r = ZATax.assess(baseInput({ salary: 540000 }));
// 125 599 + 36% x (540 000 - 530 200) = 129 127
check('gross tax per tables', r.grossTax, 129127);
check('net tax after primary rebate', r.netTax, 129127 - 17820);
check('marginal rate', r.marginalRate, 0.36);
check('bracket index', r.bracketIndex, 3);
check('section 11F limit is 27.5% of remuneration', r.retirementLimit, 148500);
checkTrue('rand cap does not bind at this income', r.retirementCapBinds === false);
check('effective rate', r.effectiveRate, (129127 - 17820) / 540000, 1e-9);
check('UIF monthly is capped', r.uifMonthly, 177.12);

section('Slices always add up to the table figure');
[50000, 245100, 400000, 540000, 900000, 2500000].forEach(function (ti) {
  var slices = ZATax.sliceBreakdown(T.YEARS['2027'], ti);
  var sum = slices.reduce(function (a, s) { return a + s.taxFromBracket; }, 0);
  check('slices sum at R' + ti, sum, ZATax.taxPerTables(T.YEARS['2027'].brackets, ti));
});

section('Medical credits');
check('2027 family of four', ZATax.medicalSchemeCredit(T.YEARS['2027'], 4), (376 + 376 + 254 + 254) * 12);
check('2026 single member', ZATax.medicalSchemeCredit(T.YEARS['2026'], 1), 364 * 12);
check('nobody on a scheme', ZATax.medicalSchemeCredit(T.YEARS['2027'], 0), 0);
var med = ZATax.assess(baseInput({ salary: 540000, onMedicalScheme: true, medicalMembers: 2 }));
check('credit comes off the tax', med.netTax, r.netTax - 376 * 2 * 12);

section('Credits reduce tax to zero but never below it');
var small = ZATax.assess(baseInput({
  salary: 110000, onMedicalScheme: true, medicalMembers: 6, medicalContributions: 90000
}));
check('no negative tax', small.netTax, 0);
checkTrue('no refund conjured from credits alone', small.balance === 0);

section('Dropping a bracket: R540 000, 2027');
var drop = ZATax.bracketDrop(baseInput({ salary: 540000 }));
check('status', drop.status === 'possible' ? 1 : 0, 1);
// Needs to land on R530 200, the top of the 31% bracket.
check('contribution needed', drop.needed, 540000 - 530200);
check('lands exactly on the ceiling', drop.resulting.taxableIncome, 530200);
check('new marginal rate', drop.resulting.marginalRate, 0.31);
check('tax saved is the slice at 36%', drop.saving, 9800 * 0.36);
check('net cost after the saving', drop.netCost, 9800 - 9800 * 0.36);

section('Dropping a bracket: out of reach because of the rand cap');
// R2m salary, already R400 000 into a fund. Taxable income is R1.6m, so the
// bracket below starts at R887 000 - but only R30 000 of allowance is left,
// and the R430 000 cap means no contribution could ever close a R713 000 gap.
var far = ZATax.bracketDrop(baseInput({ salary: 2000000, retirement: 400000 }));
check('taxable income', far.current.taxableIncome, 1600000);
check('gap to the 39% bracket', far.gap, 1600000 - 887000);
checkTrue('reported as out of reach', far.status === 'out-of-reach');
checkTrue('not feasible', far.feasible === false);
check('headroom is the rand cap less what is already in', far.headroom, 430000 - 400000);
check('still short after using all of it', far.shortfall, 1570000 - 887000);
check('the rand cap is what binds', far.capBinds === true ? 1 : 0, 1);
checkTrue('using the rest still saves something', far.maxSaving > 0);

section('Section 11F: rand cap versus the 27.5% test');
check('cap binds above R1 563 636', ZATax.retirementLimit(T.YEARS['2027'], 2000000, 2000000), 430000);
check('27.5% binds below it', ZATax.retirementLimit(T.YEARS['2027'], 800000, 800000), 220000);
check('2026 cap was lower', ZATax.retirementLimit(T.YEARS['2026'], 2000000, 2000000), 350000);
var over = ZATax.assess(baseInput({ salary: 400000, retirement: 200000 }));
check('excess over the limit is not deducted', over.retirementDeduction, 110000);
check('excess is reported for carry-forward', over.retirementDisallowed, 90000);

section('Already in the lowest bracket - the threshold is the target instead');
var low = ZATax.bracketDrop(baseInput({ salary: 120000 }));
checkTrue('offers the threshold', low.status === 'clears-threshold');
check('needed to fall under the threshold', low.needed, 120000 - 99000);
check('resulting tax is nil', low.resulting.netTax, 0);
check('saves the whole bill', low.saving, low.current.netTax);

var lowFar = ZATax.bracketDrop(baseInput({ salary: 200000 }));
checkTrue('on R200 000 the threshold is out of reach', lowFar.status === 'threshold-out-of-reach');
// 27.5% of R200 000 is R55 000, which only gets taxable income to R145 000.
check('shortfall after the full 27.5%', lowFar.shortfall, 145000 - 99000);

section('Refund and amount owing');
var refund = ZATax.assess(baseInput({ salary: 540000, payePaid: 120000 }));
check('refund due', refund.balance, 120000 - (129127 - 17820));
var owing = ZATax.assess(baseInput({ salary: 540000, payePaid: 90000 }));
checkTrue('owing is negative', owing.balance < 0);
check('amount owing', owing.balance, 90000 - (129127 - 17820));

section('Donations are capped at 10% of taxable income');
var giver = ZATax.assess(baseInput({ salary: 500000, donations: 200000 }));
check('deduction capped', giver.donationDeduction, 50000);
check('taxable income after cap', giver.taxableIncome, 450000);

section('Donations shrink the bracket-drop target as retirement grows');
// R600 000 salary with R60 000 donated. A naive "taxable income minus the
// ceiling" gives R9 800, but every rand into a fund shrinks the 10% donations
// cap too, so the real requirement is higher.
var withDonations = ZATax.bracketDrop(baseInput({ salary: 600000, donations: 60000 }));
check('starts at the same taxable income as the simple case', withDonations.current.taxableIncome, 540000);
check('naive gap', withDonations.gap, 9800);
check('actual contribution needed', withDonations.needed, 10889);
checkTrue('lands on or under the ceiling', withDonations.resulting.taxableIncome <= 530200);
checkTrue('one rand less would miss', ZATax.assess(baseInput({ salary: 600000, donations: 60000 }), 10888).taxableIncome > 530200);

section('Additional medical credit, under 65, past the 7.5% floor');
var amtc = ZATax.assess(baseInput({
  salary: 300000, onMedicalScheme: true, medicalMembers: 1,
  medicalContributions: 60000, outOfPocket: 40000
}));
// Scheme credit 376 x 12 = 4 512. Excess = 60 000 - 4 x 4 512 = 41 952.
// Qualifying = 41 952 + 40 000 - 7.5% x 300 000 = 59 452. Credit = 25% = 14 863.
check('section 6B credit', amtc.extraCredit, 14863);

section('Bonus counts as remuneration, other income does not');
var bonusCase = ZATax.assess(baseInput({ salary: 500000, bonus: 100000 }));
check('remuneration includes bonus', bonusCase.remuneration, 600000);
check('11F limit follows remuneration', bonusCase.retirementLimit, 165000);
var sideCase = ZATax.assess(baseInput({ salary: 500000, otherIncome: 100000 }));
check('remuneration excludes other income', sideCase.remuneration, 500000);
check('11F limit uses the greater of the two', sideCase.retirementLimit, 165000);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
