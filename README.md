# ZA Tax Ladder

A single-page South African income tax calculator. Open `index.html` in a
browser — there is no build step, no server and no dependencies.

It answers three questions:

1. **What will my return come to?** Your tax for the year against the PAYE
   already deducted, so you see the refund or the shortfall.
2. **Which bracket am I in?** A ladder of all seven brackets showing how much
   of your income sits on each rung and the rand of tax that comes from it.
3. **What would it take to drop a bracket?** The exact retirement contribution
   that lands your taxable income under the bracket floor, whether your salary
   and the section 11F limit actually allow it, and what it saves you.

Everything you enter stays in your own browser (`localStorage`). Nothing is
sent anywhere.

## What it covers

Salary, bonus and other taxable income; retirement fund contributions under
section 11F; section 18A donations; the section 6A medical scheme fees credit
and the section 6B additional medical expenses credit; age rebates; PAYE and
provisional tax already paid; and employee UIF.

## What it does not cover

Travel allowances and company cars, share incentives, retirement fund lump
sums, capital gains, foreign income and the section 10(1)(o)(ii) exemption,
and the interest and dividend exemptions — enter other income already net of
those. Contributions above the section 11F limit are shown as disallowed, but
SARS's carry-forward to a later year is not modelled.

It is an estimate, not an assessment. Check anything that matters with SARS or
a tax practitioner.

## Tax years

The 2025, 2026 and 2027 years of assessment are built in. 2026 (1 March 2025 –
28 February 2026) is the default, being the year most people are filing for.

## Updating after a Budget

Rates live in `tax-tables.js`, one entry per year of assessment, with the
update steps in a comment at the top of the file. Add the new year, then run
the tests — they check that every bracket's base is continuous with the one
below it and that each tax threshold times 18% equals the rebates it is meant
to cancel, which catches most transcription slips.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup |
| `styles.css` | Styles, including both light and dark themes |
| `tax-tables.js` | SARS rates, rebates, thresholds and credits per year |
| `calc.js` | The tax maths — pure functions, no DOM |
| `app.js` | Form handling and rendering |
| `test/calc.test.js` | Tests for `calc.js` |

## Tests

```
node test/calc.test.js
```

108 assertions covering the published tables, the threshold and bracket
boundaries, medical credits, the section 11F cap, donation limits, and the
bracket-drop solver — including the case where the annual cap makes a drop
impossible no matter what you contribute.
