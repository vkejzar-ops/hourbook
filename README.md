# Hourbook

An offline hours-and-pay tracker for a UK lorry driver. One self-contained HTML
file plus a service worker, hosted on GitHub Pages and added to the iPhone home
screen. No accounts, no server, no network calls except one optional bank-holiday
lookup. Everything lives in `localStorage` on the phone.

This file exists so a future conversation can pick the project up cold.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app — markup, CSS and JS in one file, ~2,080 lines |
| `sw.js` | Service worker, cache-first |
| `icon-180.png`, `icon-192.png`, `icon-512.png`, `icon.svg` | Home-screen icons |
| `preview-*.html` | Throwaway design mockups. **Not part of the app. Never upload these.** |
| `hourbook-backup-*.json` | Exported data. **Never put these on GitHub — the repo is public and these are his hours.** |
| `hourbook-ytd-*.json` | A hand-built import file — year-to-date figures off a slip, plus a day. Same rule: **never on GitHub.** |

---

## Version discipline

`const BUILD="v23"` in `index.html` and `const CACHE = "hourbook-v23"` in `sw.js`
**must be bumped together on every change.** The test `build.js` fails if they
drift. The build number is shown in More → Everything else.

Current version: **v23**.

---

## Hosting and upload

Live at **vkejzar-ops.github.io/hourbook** (GitHub user `vkejzar-ops`, repo
`hourbook`, public).

To upload a new build: repo main page → the **plus button next to "Go to file"**
→ "Upload files" → drag in `index.html` and `sw.js` → "Commit changes" at the
bottom. Direct link: `github.com/vkejzar-ops/hourbook/upload/main`.

Then close the app from the iPhone **app switcher** (not just the home screen)
and reopen it.

**Checking what version is actually live.** The service worker is cache-first
with `ignoreSearch:true`, so a `?v=` query string does *not* bypass it. Open the
site in a **Safari Private tab** instead — Private mode doesn't register service
workers, so it fetches fresh. Check More → Everything else. Saved data isn't
visible in Private mode and isn't touched by looking. Back in the normal tab,
reload twice: the first load installs the new worker and wipes the old cache,
the second serves the new file.

---

## The pay rules

These came from his own reference doc and were then verified against five real
payslips. They are the point of the app; get them wrong and it is worthless.

**The week** runs Monday to Sunday. It is paid on the Friday eleven days after
the Monday, stepping back to Thursday if that Friday is a bank holiday
(`paydayOf`).

**Hours** are clock-in to clock-out. No unpaid breaks are deducted.

Monday–Friday hours, bank-holiday hours and booked holiday hours all form one
pool. The first **50 hours** pay at **£14.00**; anything above pays **£18.38**.
Overtime rounds to the quarter hour.

| Day | Rate | Notes |
|---|---|---|
| Saturday | £20.96 | Always overtime, sits **outside** the 50h threshold, 5h minimum |
| Sunday | £20.96 | Rate is **still a guess** — correct it in Setup when a Sunday first gets paid. Outside the threshold, 5h minimum |
| Bank holiday not worked | basic | 10 hours paid, counts **towards** the 50 |
| Bank holiday worked | Sunday rate | 5h minimum, **outside** the threshold |
| Booked holiday | basic | 10h a day, counts towards the 50, preserves attendance |

Holiday fills the basic pool **first** and never becomes overtime. It is ignored
on a day that has hours logged, and a bank holiday takes precedence over it.

**Extras.** A night out is one tick and pays £25 plus a £5 meal allowance.
Attendance allowance is £50 a week. There is an SSP field.

**Attendance allowance** settles on the last weekday he was actually required —
normally Friday, Thursday if Friday is a bank holiday, and correctly earned if
Friday is booked holiday. This falls out of the code naturally because bank
holidays and holiday are already excluded from the missed/pending lists; there
is no special-case Friday check and none is needed.

---

## Deductions — solved exactly

All five payslips reproduce to the penny for pension and NI (test `pay2.js`).

**Pension** is 5% of qualifying earnings, banded: nothing on the first £120 a
week, nothing above £967. The maximum is therefore £42.35 — a ceiling, not a
fixed amount.

Pensionable: basic, all overtime, holiday, holiday uplift, SSP.
Not pensionable: night out, meal, expenses, Medicash, and — proven by the 21
August slip, £700 basic + £50 attendance giving £29.00, which is 5% of £580 —
**the attendance allowance**.

**NI** is 8% between £242 and £967, then 2% above £967.

**Tax** — see the v23 section below; it is now cumulative and matches all five
slips within 14p. Niable pay is payments minus meal, night out and expenses.
Taxable is niable plus the Medicash BIK. Pension shows as a negative line inside
Payments.

**Gross is after the pension.** Proved by arithmetic on all five slips, not by
how the page looks: the pay lines total £1,159.49 on the 4 September slip, the
sacrifice line takes off £42.35, and the printed Payments total is £1,117.14
exactly. Payments minus Deductions equals the printed NET every time. Salary
sacrifice means the money is never legally pay, which is why it is off before
the total and why tax relief follows. `c.cash` is the figure to display as gross
and it already does this — do not "fix" it to show the pre-sacrifice number.

**The Medicash BIK sits in the Payments column but is excluded from the
Payments total.** It is notional; it exists to be taxed, never paid in cash.

---

## Drivers' hours (EU / assimilated GB)

Daily driving 9h, extendable to 10h twice a week. Weekly 56h, fortnightly 90h.
Daily rest 11h, reducible to 9h three times between weekly rests; split 3+9.
Weekly rest 45h, reducible to 24h once in two weeks, with the shortfall repaid
en bloc by the end of the third week following. Break of 45 minutes after 4.5h.
Working time directive: 60h in a single week, 48h averaged over 17 weeks.

**The important trap.** WTD working time is driving plus other work. Periods of
availability and breaks are excluded. Clock-in-to-clock-out is *duty* time and
is the wrong basis — so the app asks for the two tacho figures separately and
counts a day towards the average only if both are entered.

### How daily rest is judged (v19 — rewritten)

Up to v18 the app simply measured the gap between one finish and the next
start. That was wrong, and it missed the obvious case: a fifteen-hour shift
followed by an eleven-hour break reported a full rest and used nothing up.

Article 8(2) of Regulation 561/2006 does not measure the gap. It says that
within each 24 hours after the end of the previous rest a new daily rest must
be taken, and it is *the portion of that rest falling inside those 24 hours*
that decides whether it is full or reduced. So the window for the rest that
follows a shift runs from **that shift's start** to 24 hours later — the end of
the previous rest being the moment work began.

A long shift therefore eats its own rest. Fifteen on and eleven off leaves only
nine hours inside the window, so it is a reduced rest, and sleeping longer
afterwards cannot put it back.

Implementation, all in `index.html`:

- `restInfo(ds)` returns `{gap, inWin, capped}`. `gap` is the real break;
  `inWin` is the part that lands inside the 24 hours; `capped` is true when the
  window cut it short.
- `restBefore(ds)` still returns the plain gap and is what the weekly-rest
  maths and the CSV hours column use.
- `restKind()` takes either a `restInfo` object or a plain number of minutes.
  A gap of 24h or more is a **weekly** rest and is decided on the full gap, not
  the windowed portion — otherwise a short shift followed by a long break would
  be misread as an ordinary daily rest. Below that, `inWin` decides:
  11h+ regular, 9–11h reduced, under 9h short.
- `restTextKey()` picks the wording, so a reduction caused by shift length is
  explained differently from one caused by a short break.

Both tests now live in one calculation rather than two, so a rest that is short
*and* window-capped counts once, not twice. The eleven-on-nine-off case still
reports reduced exactly as before.

The **"earliest you can start again"** block now looks forward at how much rest
can still fall inside the window, and says one of three things: the normal pair
of options; that the rest is already reduced whatever he does now; or that the
shift ran so long no legal daily rest is left in the window at all.

The **"latest you can finish"** block needed no change — 13 hours to keep a full
rest and 15 to use a reduced one fall straight out of the same arithmetic.

CSV gains a **Rest in 24h window (h)** column next to the existing rest hours.

### Counting at clock-out (v20)

v19 still waited for the next start time before moving the reduced-rest tally,
on the grounds that a long enough break would be a weekly rest instead and
should not burn one of the three. Vit pointed out that this is only true while
a full rest is still possible. Once under 11 hours of the window remain, no
full daily rest can fit in it, so the reduction is settled at clock-out and
waiting decides nothing.

So the rule is now two-sided:

- **Under 11h left in the window at clock-out** — settled. Counts straight away.
- **11h or more left** — still open. The clock-in decides, as before.

`openRestInfo(ds)` returns `{avail, kind}` for a shift that has finished with
nothing started after it, where `kind` is `open`, `reduced`, or `short`. It
returns `null` as soon as anything is logged after that shift, which is what
stops the same rest being counted twice — once as open and again as measured.

`reducedSinceWeekly()` checks the most recent finished shift for a settled open
rest, then runs the existing backward walk. `calc()` feeds `openRestInfo` into
`redRest` and `shortRest` the same way.

A shift over about 16 hours leaves under 9 hours in the window. That is not a
legal daily rest at all, so it is counted as **short**, not as one of the three
reduced ones — the same treatment a measured sub-9-hour gap gets.

Covered by `window.js` (63 checks).

---

## How it is built

Five tabs: `TABS=["day","week","hours","pay","history","more"]` — Day, Hours,
Payslip, History, More.

Storage is `localStorage` under the key `hourbook.v1`, shaped
`{days:{}, weeks:{}, settings:{}}`.

A day record is `{start, end, night, drive, other, hol}`. **Only keys that exist
are written**, so "not ticked" and "not recorded" look identical in an export.

A week record can hold `payslip` (the figures off the real slip — note the key is
`payslip`, not `slip`), `wo` (written-off shortfalls), `chk` (the nights
confirmation tick), `att2` (attendance paid twice this week) and `ssp`.

`load()` caches the store in a module-level `mem`. To force a reload in a test:
`mem=null; load()`.

Theme is light: `--ground:#F6F3ED`, `--panel:#FFFFFF`, `--panel-2:#EDE8DE`,
`--rule:#DCD5C7`, `--text:#211E19`, `--dim:#777066`, `--amber:#A75F07`,
`--green:#2C7A50`, `--red:#B0362A`. Red means a discrepancy, amber means money.

Day tab order, top to bottom: bank-holiday/holiday note, rest before this shift,
clock boxes, tacho duration boxes, working time total, the night-out and holiday
paired row, cards, last/next, to-week. Rest sits above the clock boxes so the day
reads chronologically; `att.js` asserts the ordering.

Bank holidays come from `BH_SEED`, 24 dates copied verbatim from gov.uk for
England and Wales, 2026–2028. There is deliberately no Easter algorithm.
`checkBankHolidays()` fetches `https://www.gov.uk/bank-holidays.json` when asked,
and `bhAutoCheck()` runs on the first launch of a new year.

---

## The payslip tab

Each line shows what was logged, takes what the real slip says, and shows the
gap. Anything left blank is taken as agreeing. A line with a figure entered gets
an amber left edge and an `ENTERED` tag.

**Unpaid weeks are locked.** `plLocked(k)` is true until the payday has passed.
The forward arrow reaches one week past the last paid week so he can see the week
in progress, but the figures are read-only and the panel is styled provisional —
tinted, dashed border, greyed. It unlocks itself on the payday; there is nothing
to switch.

### Carry-over (v18)

A payslip line can come up short, and the money usually turns up on a *later*
slip rather than on a corrected one. So a shortfall is remembered against its own
line and added to what the next slip should pay.

- Carried in the line's **own unit** — hours for hourly lines, whole nights for
  night out, **pounds** for attendance. A rate change between the two weeks
  therefore cannot corrupt it.
- A shortfall only ever clears against **its own line**. Saturday OT never
  settles against basic hours.
- It **does not expire**. It rides along until a slip covers it or he writes it
  off. Part payment just does the arithmetic and carries the remainder, keeping
  the original date.
- **Overpayments are the deliberate mirror, not a symmetry**: noted with a
  neutral grey strip, no button, and they live exactly one week. If the next
  slip comes up short by the same amount on the same line, that is them taking
  it back and it is absorbed silently. Otherwise it lapses.
- **Threshold**: shortfalls under 1 hour are ignored outright, since overtime
  rounds to the quarter hour and a stray 0.25 is arithmetic, not a shortfall.
  Editable in Setup as `owedThresh`. It applies to **hourly lines only** — a
  missing night out is a whole £30 and can never be rounding, so nights and
  attendance carry any gap at all.

**The nights confirmation tick** exists because the slider defaults to the
expected number. Without the tick, an untouched slider would count as "paid" and
quietly wipe a debt he never checked. Untapped means he has not looked yet, so
the debt stays. Dragging the slider ticks it automatically, since dragging is
itself an act of checking. The slider runs to **12**, because a week they miss
entirely is up to six and two weeks' worth has to fit.

**Attendance** is one a week, so a missed one can never come back through its own
line. It only clears by being paid twice on a later slip (the "paid twice this
week" button, which makes the line expect £100) or by being written off.

The ledger walks forward from the earliest week that has any payslip data — see
`plCarryIn`, `plStep`, `plCarryStart`. Locked weeks pass shortfalls through
untouched and let credits lapse.

**Known and intended**: the totals row still compares the slip against the hours
actually logged, so a week that pays back a debt shows as *over* on the totals.
That is correct — he really was paid more hours than he worked that week — and
the strips explain where it came from.

---

## Backups

`doBackup()` is `JSON.stringify(load())` — the whole store verbatim. There is no
field list to forget, so nothing can be missed. Proven by `bkp2.js`, and
re-proven for the v23 settings by `bkp3.js` (43 checks), which drives a full
round trip through the real file input rather than asserting from the source.

`bkp3.js` confirms the file carries the tax code, student loan plan, Medicash
tick and amount, all three year-to-date fields, every rate and threshold, hours,
night-out flags, tacho `drive`/`other`, expenses to the penny with parking
flags, sick days, holidays, payslip figures, write-offs and checked flags.

**`lastBackup` is legitimately absent from the file.** It is stamped a moment
*after* the download is written, so a restored backup never claims to have
backed itself up. Not a bug — do not "fix" it.

**Restore semantics matter.** Import merges at the top level, so empty `weeks` or
`settings` in a file leave the phone's untouched. But days are restored with
`Object.assign(mem.days, incDays)`, which replaces **whole day objects**. So
restoring a file that lacks `drive`/`other` on a date that already has them will
**wipe those fields**. Import warns on clashes and says the backup wins.

### Hand-built import files

A backup file does not have to be a whole export. Because settings merge key by
key and only the named days are replaced, a file containing just a few settings
and one day is a safe, surgical way to push a change onto the phone — nothing
it does not mention can be touched.

`hourbook-ytd-2026-09-08.json` is the worked example: three year-to-date
settings off the 04/09 slip, plus one day carrying a start time. `imp2.js`
proves it against a seeded copy of a real week — the figures land, and the
other days, the tacho hours, the rates and the tax code are all still there
afterwards.

Two things to keep in mind when building one:

- **The app must already understand the settings.** Push a file with v23
  settings onto a v21 build and they sit in storage doing nothing. Upload
  `index.html` and `sw.js` first, import second.
- **The named day is replaced whole.** A file giving only `start` will drop an
  `end`, a night-out tick or tacho figures already on that date. Fine for a day
  in progress, dangerous for a finished one.

---

## iOS notes

Safari deletes script-writable storage after seven days idle (ITP), but
home-screen web apps are exempt — hence the `navigator.storage.persist()` call.
Every browser on iPhone is WebKit underneath, so there is no way around any of
this. A web page cannot list, delete or choose folders in Downloads. Downloads
need transient activation, which is why the backup prompt rides on the
finish-time handler; the gov.uk fetch does not.

---

## Tests

47 suites in `/home/claude/t/`, 1176 checks, all green as of v27. Run with
`node <file>.js`. (`dom.js` is the bootstrap and prints no count of its own.)

`test.js` · `hol.js` · `new2.js` · `holui.js` · `dom.js` · `hdr.js` · `imp.js` ·
`wipe.js` · `holpay.js` · `holui2.js` · `backup.js` · `bhseed.js` · `bhapi.js` ·
`dur.js` · `mig.js` · `pay2.js` · `ui3.js` · `ui4.js` · `gap.js` · `build.js` ·
`att.js` · `attday.js` · `lock.js` · `bkp2.js` · `carry.js` · `carryui.js` ·
`sick.js` · `window.js` · `exp.js` · `exp2.js` · `fold.js` · `tax.js` ·
`ytd.js` · `slips.js` · `ui5.js` · `bkp3.js` · `imp2.js` · `roll.js` · `intro.js` · `hero.js` · `ahead.js` · `tick.js` · `split.js` · `pback.js` · `item.js` · `pick.js`

Other `.js` files in that directory are scratch and can be ignored.

**Fixture faults that keep recurring — read before writing a new test:**

- `let` and `const` at classic-script top level do not attach to `window`. Reach
  them with `w.eval("name")`.
- Payslip figures live under `payslip`, not `slip`.
- Payslip inputs are `.pin`, the slider is `.pr`, the yes/no button is `.ynb`,
  the nights tick is `.ckb`, the carry-over strip is `.strip`, write-off buttons
  are `.wo`.
- `load()` caches in `mem`. Use `mem=null; load()` to force a reload.
- The jsdom bootstrap pattern is in `dom.js`:
  `new JSDOM(html,{runScripts:"dangerously",...})`. `jsdom-global` is **not**
  installed, and jsdom resolves only from `/home/claude/t`, never from
  `/mnt/user-data/outputs`.
- `renderDay()` takes the week's `calc()` result as an argument. Call it as
  `renderDay(calc(mondayOf(curDay)))`, not bare, or it throws on `c.workedMins`.
- `hm()` renders `"10h"`, not `"10h 00"`.
- Money renders as `£140<small>.00</small>`, so regexes must allow the tag.
- `DAYNAME` is full names, `SHORTDAY` is the abbreviated set. A regex for
  `/Mon · x/` fails against `DAYNAME`.
- The source uses literal `–` and `·` characters, not `\u` escapes, so Python
  patches must use the real characters.
- The week after `lastPaidWeek()` is still locked, so two-week carry tests must
  use `lastPaidWeek()-7` and `lastPaidWeek()`.
- Multi-line `node -e` from bash fails. Write a `.js` file instead.
- Config field selectors: tax code `.tc`, student loan `.sl`, Medicash tick
  `.mcb` and amount `.mci`, year-to-date button `.ytb`. Expense amount `.eamt`,
  description `.edsc`, parking `.epk`, add `.eadd`. Sick chip `.sk`, input
  `.si`, basis `.sb`.
- **`renderSetup()` rebuilds the rows every time.** Re-query the element after
  any click that calls `render()`, or you hold a detached node.

**A patching lesson from v23, worth not repeating.** Two `str.index()` bounds
were used to replace a block, and the second range silently swallowed
`plLocked`, `lastPaidWeek` and `paydayLabel`, which sat between the two markers.
The tests caught it. After any large structural patch, run:

```
python3 -c "
import re
a=open('v21-backup.html').read(); b=open('work.html').read()
na=set(re.findall(r'function (\w+)\s*\(',a)); nb=set(re.findall(r'function (\w+)\s*\(',b))
print('LOST:', sorted(na-nb) or 'none')"
```

Also check for duplicate function names — an accidental double-insert defines a
function twice and the later one silently wins.

---

## Still open

1. **Sunday rate is a guess** (£20.96). He never works Sundays, so it can stay.
   Correct it in Setup if one ever gets paid.
2. **Weekly rest payback** is a dated reminder, not a running balance. Offered to
   make it tick off; no answer yet.
3. **Student loan thresholds are hardcoded 2026/27 figures** and change annually.
   Same for the tax bands in `TAX_BANDS`. Neither is in config. Revisit each
   April, or move them to Setup if a colleague trips over it.
4. **The personal allowance taper above £100,000 is not modelled.** Irrelevant
   here, but it would make a high earner's estimate wrong.
5. **One shift per calendar day.** `d.days[curDay]` is a single record. A double
   shift cannot be logged. Not built.
6. **No delete button on an expense row** — clear the amount to £0.00 and tap
   away. A deliberate trade; revisit if it annoys him.
7. Possible later: wiring an Anthropic API key so the app could read payslip and
   clock-in photographs directly.
8. Vit to chase payroll about the unpaid sick absence — check the date against
   6 April 2026, when the three waiting days were abolished.
9. If colleagues start finding their own payslip errors, that becomes a bigger
   conversation with payroll than just his. Flagged, no response yet.

---

## Working style

He reviews a build himself and comes back with a batch of changes. He will say
"don't build yet, let's just talk about it" — take that literally. Design
discussion goes better in typed chat than voice. He wants the spec read back
before building, and a preview before a visual change lands. He values
destructive actions being hard to trigger by accident, settings exposed rather
than hardcoded, authoritative data over clever computation, and honest
disclaimers about what the app cannot do. Break iPhone navigation into one action
at a time.

One environment note: `bash_tool` calls succeed when his message arrives as
typed or dictated text and fail during live voice. Images are also invisible
during live voice. Say so plainly and defer the work to the next typed message.


## Sick days (v18)

A day can be marked **sick** on the Day tab. The row that held night out and
holiday now holds three chips across.

- A sick day takes no hours and is out of the hours pool entirely.
- It does **not** save the £50 attendance allowance. His firm does not pay
  attendance through sickness, so a sick weekday still counts as a day missed.
  This falls out of `calc()` naturally: the attendance test excludes bank
  holidays and booked holiday, and deliberately does not exclude sick.
- Hours on the day override the marker — the same way they override holiday
  and turn a bank holiday into a worked one. There is no separate override.
- A bank holiday still beats a sick tick.
- Holiday and sick grey each other out; night out is greyed while sick.
- Weekends have no sick chip, matching holiday.

**The rate.** `settings.sickRate` is stored as a figure **per day** and is
blank out of the box, so nothing is predicted until he sets one. The Setup row
takes either basis: a chip toggles between "a day" and "a week", and
`settings.sickWeekly` records which he is looking at. A weekly figure is
divided by five on the way in. The stored number is always daily, so nothing
downstream needs to know which he typed. The hint carries the statutory
figures (£123.25 a week, £24.65 a day for 2026/27) as a reference only — the
app never sets them.

**SSP.** The line is renamed **SSP (sick pay)** everywhere. `calc()` predicts
`sickDays × sickRate`, but a figure typed into the week tab's SSP box always
wins, because that one comes off the slip. `c.sspPred` keeps the prediction
available alongside `c.ssp`. SSP remains pensionable.

**The week list** now labels every day that has no hours, so a sick day no
longer reads the same as a day he forgot to fill in: "Bank holiday", "Holiday",
"Sick · £24.65 paid" (or "Sick · no rate set"), and a worked bank holiday now
says "· bank holiday" alongside the times.

**CSV** gains a per-day `Sick` column and a `Week sick days` column.

Tests: `sick.js`, 75 checks.

### Note on the three-day rule

The three unpaid waiting days were **abolished on 6 April 2026** by the
Employment Rights Act 2025, along with the Lower Earnings Limit test. SSP is
payable from the first qualifying day. Do not reintroduce a waiting-day
assumption.


## Folding the dead payslip lines (v21)

There are nine payslip lines and in a normal week only three are alive: basic
hours, night out, attendance allowance. Holiday, standard OT, Saturday, Sunday,
bank holiday worked and SSP all sit there empty. So they fold away behind one
row at the bottom of the list — "6 other lines" with an arrow.

A line earns its place in the main list if **any** of these hold:

- it is night out or attendance — those are checked every week regardless
- something is expected on it this week (hours logged, or cash for SSP)
- something is owed or credited on it, either carried in or going out
- a figure has already been typed into it

That last one matters: a line he has touched must never vanish under him. It
also means the fold cannot hide a discrepancy he has recorded.

The consequence is that lines announce themselves. Standard OT expects nothing
until the week passes fifty hours, so it appears on its own the week it starts
to matter. Saturday appears the week he works one. Nothing had to be
special-cased for either.

The folded rows are ordinary rows — same markup, same inputs, same carry-over
strips. Nothing is stripped down; they are simply inside a container with
`display:none` until tapped.

The fold does **not** remember being open. Every render starts folded, by
design: if a figure is typed into a folded line, that line moves up into the
main list on the next render, so the thing worth seeing is out in the open
rather than depending on the fold having been left open.

### Why there is no auto-reveal on a mismatch

An earlier proposal was to force a hidden line back into view when the slip's
gross failed to reconcile. It cannot be done: the app never captures a gross
figure from the slip. Every gross in the app is computed from logged hours, so
there is nothing independent to reconcile against.

Covered by `fold.js` (34 checks).

## Fixture note: att.js and the clock

`att.js` used to seed only Monday and assert that nothing had been missed yet.
That only held when the suite was run on a Monday — from Tuesday onward the
elapsed weekday with no hours is a genuinely missed day and the allowance is
correctly reported as lost. It now seeds every weekday from Monday up to
today. Worth checking for the same assumption in any new fixture built on
`cur()`.


## Expenses (v21)

Parking, showers, anything he pays for and claims back.

Stored on the day as `r.exp`, an array of `{a, d, p}` — `a` is **whole pence**
(an integer, so nothing rounds), `d` is the free-text description, `p` is the
parking flag. Ticking parking greys the description box out and shows
"parking"; unticking gives back whatever he had typed, because `d` is kept
either way.

### Typing the amount

Digits fill from the right, the way a card machine takes an amount. `1250`
reads as £12.50 while you type, and the box always shows the real amount, so
there is no decimal point to hunt for on a numeric keypad and no guessing at
the end whether two digits meant pounds or pence. `penceFrom()` reads the
digits, `penceText()` formats them. The cost is that round amounts take four
taps: ten pounds is `1000`.

An earlier design decided on confirm — one or two digits meant whole pounds,
three or more meant pence. That was dropped because it cannot coexist with
live formatting: you would watch the box say £0.12 and then see it jump.

A row whose amount is £0.00 with no description is dropped when he taps away.
A row he has *just* added survives, since it is empty by definition — that is
what the `keepBlank` argument to `setExp()` is for.

### Where it shows

- **Day tab** — a full-width block under the night out / holiday / sick chips.
  Amount, parking chip, description on one line, `+ add another` underneath.
- **Week list** — an amber money pill on the day-name line. Night out became a
  grey pill at the same time, replacing the old "· night out" text, so the
  times line stays the times line however much is on the day.
- **Payslip check** — an `exp` line, unit `£`. It folds away when nothing is
  claimed (the existing `expects` rule handles this for free) and opens to the
  itemised list, so a short payment can be traced to the missing receipt.

### The money

Expenses are **money back, not earnings**. They go into gross and into
take-home **in full** — he really does bank them — but they are not taxed, not
NI-able and not pensionable, so they come straight back out of `taxable`
alongside the night out and the meal. The visible pair of figures therefore
stays honest to his bank account; only the narrower gross-for-tax figure
underneath drives tax and NI, and that is never displayed.

`exp` is in `PL_CARRY`, so an unpaid expense carries forward in pounds like
attendance does.

## The dispute export (v21)

The day CSV is unchanged apart from gaining an `Expenses` column — it stays the
raw record. Alongside it there is now **"Download what is still owed"**, which
is the sheet to send to payroll: only what is outstanding *right now*, one row
per line, with how much, what it is worth, and the week it should have been
paid. Built from `outstanding()`, which reads `plCarryIn()` for the week after
the last paid one — the same ledger the payslip tab uses — so written-off lines
are already absent. With nothing outstanding it says so rather than downloading
an empty file.

## Bug fixed in v21 — write-offs on the current slip

`plStep()` applied a write-off only to what was carried **in** to that week. A
shortfall that arose on the slip he was looking at could therefore be written
off, the flag stored, and nothing would happen: the strip stayed on screen and
the debt still rolled into the next week. It only ever worked on a debt
inherited from an earlier week.

The write-off is now applied on the way out as well. This mattered beyond the
UI annoyance — without it the payroll sheet would have listed amounts he had
already dismissed. Covered by `exp2.js`.

---

## What v23 changed

Three fixes and one addition, all with suites pinning them.

### The year-to-date figure now expires with its tax year

`ytdStale(k)` compares the tax year of the handover **paydate** against the tax
year of week `k`'s **payday** — paydate on both sides, because that is how HMRC
assigns a slip to a year. When they differ, `cumBasis` ignores the typed figure
and falls back to counting logged weeks.

Before this, last year's total stayed in the base forever. It did not produce
runaway tax, because the cumulative method subtracts what earlier weeks already
carried; what it did was shove every week up a band. On a test week in June
2027: v22 charged £117.01, v23 charges £131.01 — v22 was applying a 40% marginal
rate to a base that should have been under the threshold.

Ignored, never deleted. The config row keeps showing the figure, flagged, so it
can be replaced off the first slip of the new year. `roll.js`, 23 checks.

### A prompt each April

`taxYearCheck()` fires on the first launch on or after 6 April and lists three
things: the tax code, the year-to-date figure, and the fact that `TAX_BANDS` and
`SL_PLANS` are hardcoded for one tax year and are stale until the file itself is
replaced. On a first run it records where the year stands and says nothing, so
upgrading mid-year does not trigger it.

There is no way to avoid this. Every API on HMRC's developer hub is a personal
record behind OAuth; the rates themselves are published on GOV.UK as prose, not
data. Scraping would break on the next redesign. Once a year, a human checks.

### A first-run notice

`introCheck()` shows a panel on a fresh install saying every figure is an
estimate and nothing is connected to payroll, then the four things that make it
closer, in order of value: the year-to-date box, the tax code, the rates, and
the payslip tab.

Gated on `INTRO_REV`, **not** on `BUILD`. Bumping it on every version would nag
people who have already read it. Raise it by hand and only when the wording
changes. `intro.js`, 16 checks.

### The hero caption alignment

`.hero .fig.one + .sub` was an adjacent sibling selector. When the estimate
marker was added between the figure and its caption the rule silently stopped
matching, so on the week, hours and history tabs the figure and marker were
centred while the caption sat hard left. A hidden element still counts as a
sibling, which is why history was affected too even with the marker switched
off.

Now `~` instead of `+`. Also `.estb` centres itself with auto margins, which put
it out of line in the strip's edge-aligned columns; those are pinned to their
column's edge now.

`hero.js` (26 checks) asserts the computed `text-align` on every hero rather
than the CSS text, and explicitly checks that the adjacent selector would
**not** have matched — so this cannot regress quietly. `ui3.js` was asserting
the broken selector and has been corrected.

### Nothing is priced before it happens

The day and week tabs used to run forward without limit, and because bank
holidays are seeded years ahead, any future week holding one already showed ten
hours paid. Two changes:

`navLimit()` stops the day and week arrows at the end of next week. The payslip
tab keeps its own, tighter limit at the last real payday.

`calc()` now counts a bank holiday or a booked holiday only once the day itself
has arrived — midnight on the day, not before. Future ones are counted into
`bhPending` and `holPending` instead, and the week ledger says "not counted yet"
with the hours greyed rather than going silent. `ahead.js`, 34 checks.

A regression this caught, worth remembering: `sick.js` searched **forward** for a
real bank holiday to build its fixture, so it started landing on a pending one.
Fixtures that need a bank holiday must search backwards.

### Ticking off a payslip line that matches

Every row that takes a figure has a marker in front of the box. Faint and dashed
while it is only an offer; tap it and the expected figure is stored, exactly as
if it had been typed. Tap the green one to clear the row. Type something that
disagrees and it becomes a red cross and stops being a button — the gap column
already says by how much, so there is nothing left for a tap to do.

It stores the figure rather than a flag. That matters: if a day is corrected
later, the row shows the new gap instead of still claiming to match.

Nights keeps its tick under the slider, because the slider needs the width, but
follows the same rule — green on the expected number, red cross and "does not
match" once it is moved off. Attendance keeps its yes/no button and gains the
marker in front.

`#plAll` fills every row still empty in one tap and skips any figure typed by
hand, so it can never overwrite something entered deliberately. It is dead on a
week that has not been paid.

There are no tax or NI rows on this tab — both are display-only — so the
question of offering a tick on an estimated figure does not arise.
`tick.js`, 45 checks.

## What v27 changed

### The payslip week opens the day before payday

The slip goes up on the portal the day before the money lands, so the week now
unlocks for checking then rather than on the Friday itself.

The pay date has not moved. It is still the Friday eleven days after the week
begins, stepping back off a bank holiday, and it is still what the tax week is
worked out from and what the slip is dated. Only the moment the app lets you
type into it has changed.

### A night out is worth £30, not £25.04

The "today's take home" figure on the day took the day's gross and scaled it
by the whole week's net-to-gross ratio. That is right for wages, but night
out, meal and expenses are never taxed, so scaling them quietly shaved money
off: a £30 night out on an otherwise empty day read £25.04.

The day's untaxed money now passes through at face value and only the taxable
part is scaled. The week's take home was always right and is unchanged.

### Unpaid time inside a shift

A new fold on the day, closed until it is used: **Unpaid time**. Put in a
figure — 0400 for four hours — and those hours come off the pay.

They come off the pay *only*. The shift still ran clock-in to clock-out, so
daily rest, the 24-hour window, the reduced-rest count and the tacho figures
are all left exactly as they were. This is for a long stop mid-shift that
payroll will not pay for but that never stopped being part of the shift.

Where the week is already over the fifty-hour cap the hours come off the
overtime, because they come off the top of the pool. The deduction can never
be larger than the shift itself. The day shows a "paid" card beside "on the
clock" whenever the two differ.

Note the week list still shows the full clock hours for the day, not the paid
ones.

## What v26 changed

### The slip column no longer fills itself in

The itemised block under the payslip used to show what the app *expected*
in the slip column on every line, whether or not you had checked that line.
It looked as though the slip agreed with figures nobody had looked at.

Now the slip column is blank on any line you have not checked. A line counts
as checked when a figure has been typed on it, when the tick has stored one,
or — for the nights row, which is a slider — when its own tick has been
tapped. The totals below (before tax, pension, tax, NI, take home) stay blank
on the slip side until every line above has been checked, with a note saying
so; the "paid hours" line waits for every hourly line.

### Every line now shows hours and pounds

Each line carries its units on top and the money they come to underneath, in
the same cell, on the logged side, the slip side and the difference. Night
out and meal show the count with its total beneath. Lines that are money only
— attendance, SSP, expenses — stay single height.

The difference column shows both too: hours on top, pounds underneath.

### A stale rate is not a payroll dispute

If the hours on a line agree but the money does not, that is not something to
query with payroll — the money is only the hours multiplied by the rate stored
in your own settings. Such a line gets a red note underneath instead of a
pounds figure, and tapping it takes you straight to the rate fields.

Worth knowing: as the app stands this warning cannot actually appear. Both
columns multiply by the same stored rate, so if the hours match the pounds
must match. It only becomes live if the pounds from the slip are ever entered
by hand.

### More is settings, not figures

The hero figure and the row of stats beneath it are hidden on the More tab.

## What v25 changed

### The unpaid receipt is pinned to the receipt, not to a number

Before, a short expenses line left a debt of "£12.50 owed from 24 Aug". Now the
debt remembers *which receipt* it was, so the week it finally comes through the
strip says "that was Mon Parking £12.50 from 24 Aug — finally paid" instead of
announcing that he is twelve pounds fifty up.

Each receipt gets a key of `<date>#<position in that day>`, stable across
renders, stored on `expItems`. `expRefOf(week, items, shortPence)` decides which
one the debt belongs to: a pick he made by hand wins, and failing that an
unambiguous single-receipt match stands in — so the ordinary case needs no tap
at all and nothing is written to storage for it. The reference rides on the
carry ledger as `ref` beside `owed`, `from` and `credit`, is set only when a
*fresh* debt appears (`prevOwed===0`), and is cleared by a write-off. A later
week also being short does not re-point an existing debt at one of that week's
receipts.

The picker is the existing receipt list, which now opens by itself whenever the
line is short and stays folded when it matches. When it is short the rows become
buttons; tapping one marks it with an amber dot and the words "unpaid, carried
over", and tapping it again clears the pick. Amber, not green — green reads as
"paid" to everyone. The pick is stored as `weeks[k].expRef`.

When no combination of receipts fits the gap at all, it used to go silent. Now
it says so and lists them: "Nothing in your receipts comes to the £12.00 short.
They are all listed below — worth checking them off against the slip."

The 16-receipt cap on `expMissing` stays. Above that the subset search gets
expensive, and with that many receipts some subset fits any gap by coincidence,
so the answer stops meaning anything. One or two a week is the real case.

`pick.js`, 44 checks (also covers the label below).

### "to be paid" before payday, "paid" after

The middle block of the three under the hero said "paid" on a week that had not
been paid yet. It now reads "to be paid" until that week's payday has passed.
Payday is the trigger, not him checking the slip off — otherwise a week he never
got round to checking would say "to be paid" for ever, and this way it flips on
its own. It uses `plLocked(cur())`, the same test that locks the payslip tab and
switches predicted/expected.

## What v24 changed

### Split daily rest

A tick sits between the clock-in and clock-out boxes, labelled "split rest".
Set it and that day's following rest stops counting as one of the three
reductions.

The reason it is needed: the app holds one shift per calendar day, so a day
that is really two shifts with three hours of rest between them is flattened
into one long block. The nine hours that follows then reads as a reduction when
it is actually the second part of a regular 3+9 split. The tick tells the app
what the flattened record cannot.

The proper fix is two shifts on one day, which would also correct the hours
totals. That was considered and dropped as too large; for pay the day is one
day's money either way.

`restInfo()` now reports `prev` and `split`; `restKind()` returns a new `split`
kind. A split will NOT rescue a rest genuinely under nine hours — that is still
`short`. `split.js`, 28 checks.

### Getting back to today

The date between the arrows always was a button that jumps back; nobody could
tell. It now has a border like every other control, and goes green when you are
on today (day tab), this week (week tab) or the last paid week (payslip). Tap it
when it is not green to return; tapping a green one does nothing.

### Take-home everywhere

"After tax" is gone. Both day-tab heroes are take-home figures now — today's and
a running week total. Today's is its gross scaled by the week's own net-to-gross
ratio; going at it as `c.net - cx.net` would dump the whole £50 attendance
allowance onto whichever day happened to finish the week.

The payslip tab drops to a single hero, expected take home, with the
predicted/expected wording moved into the caption.

### The payslip reckoning

`#plTot` is now a full itemised block: every line, then Before tax, Pension,
Tax, National Insurance, Student loan (when there is one) and Take home, in
three columns — logged, slip, difference.

`plMoney(k, byKey, cum)` runs the same chain `calc()` does but fed from a set of
per-line amounts, so it can run twice. That is what makes the difference column
meaningful on deduction rows: underpay a line and the tax falls with it, so the
take-home gap is smaller than the gross gap. Tax and NI carry the estimate
marker.

### Which receipt is missing

`expMissing(items, shortPence)` tries every subset of the week's expenses
against the shortfall. One answer names the receipt; several say "could be any
of them" and list them; none says nothing. Pence integers, so the comparison is
exact. Capped at 16 items and 8 matching sets.

### Two grace bands, overtime only

`owedRound` (0.25h) and `owedThresh` (1h), both exposed in config. Under the
first it is rounding and is dropped silently. Between them it is not carried but
IS said out loud on the row, because dropping it silently means he never learns
it happened. Above, it carries.

Both apply to **standard overtime only** — that is the only line that gets
quarter-rounded. Saturdays, bank holidays, holiday and basic carry from the
first penny, because those are whole shifts at a fixed rate and short means
something is actually wrong.

### The weekly rest payback clears itself

`weeklyPayback(k)` looks for the compensating rest in the three weeks following
rather than asking for a tick.

**A judgement call worth knowing about.** The regulation says the compensation
attaches to a rest of at least nine hours. Read literally, `owed + 9h` clears
it — but then any ordinary weekend clears any debt, which is worse than useless:
it would say he was covered when he was not. So the test here is the strict one,
a single break of a full 45 hours plus what is owed. That can say he still owes
when he does not, which is the safe way round for something he may have to stand
behind at a roadside check. `pback.js`, 15 checks, including the boundary to the
minute.

### A fixture hazard fixed across the board

Thirty-six suites were reading `/mnt/user-data/outputs/index.html` — the shipped
file — rather than `/home/claude/work.html`. They passed all session while
silently testing the previous build, and only failed once the new file was
copied over. Every suite now reads `process.env.HB || '/home/claude/work.html'`.
Copy to outputs only after green.

## Tax codes, student loans and the estimate marker (v22 design, still current)

### The tax code

`settings.taxCode`, default `1257L`. It replaces the old `taxFree` and `taxRate`
settings, both of which are **gone from config** — the code supplies free pay and
the bands are built in. `parseTaxCode()` handles:

| Code | Meaning |
| --- | --- |
| `1257L` `1382M` `1131N` `1000T` | allowance = digits × 10, ÷ 52 for the week |
| `K475` | **negative** allowance — added to taxable pay, not subtracted |
| `0T` | no allowance, bands still apply |
| `BR` / `D0` / `D1` | every pound at 20 / 40 / 45%, no allowance |
| `NT` | no tax at all |

A `W1`, `M1` or `X` suffix is parsed and ignored — the model is an approximation
anyway, so rejecting them would help nobody. Anything else returns `null` and the
input refuses the change with an explanation rather than inventing a number.

### The bands are per-week and scale with the count

`TAX_BANDS` holds weekly widths: £725.00 at 20% (37,700 ÷ 52), then
£1,439.23 at 40%, then 45%. **Only the slice inside each band is charged at that
band's rate.** Crossing into higher rate does not retax what sits below it.

`bandTax(x, weeks)` takes a week count because the same function is used
cumulatively. **This caused a real bug during the build**: feeding a two-week
cumulative total through one-week bands made an ordinary second week look like it
had crossed into 40%. If `bandTax` is ever called without `weeks`, it defaults to
1 — correct for a single week, wrong for anything cumulative.

### Cumulative, and why the week count has two sources

`taxFor(k, taxable)` works out the tax due on everything earned so far this tax
year, then subtracts what the earlier weeks already carried. This is what real
payroll does, and it is why a big overtime week settles itself the following week
instead of staying wrong.

`cumBasis(k)` returns `{cum, weeks}` and has two modes:

- **With a year-to-date figure**, `weeks` is the real tax period, counted from
  6 April by payday (see the traps below). Accurate.
- **Without one**, `weeks` counts from the first week logged in the app. This is
  deliberate. Counting from 6 April would hand out allowance for weeks the app
  has no earnings for, and a colleague starting in June would see **zero tax for
  months** — a confident, badly wrong number. Counting from the first logged week
  is less accurate but does not invent relief.

`ytdBusy` guards the recursion: `cumBasis` calls `calc()` for each week, and
`calc()` calls `taxFor()`. While the sum is running, `taxFor` falls back to the
simple weekly model. The inner weeks only need their `taxable`, which does not
depend on tax at all.

`calc(monKey, skip)` with `skip` set (the day view asking for "the week without
today") uses `taxWeekly` too — a partial week is a working figure, and going
cumulative on it would be both wrong and expensive.

**Empty weeks contribute nothing.** `cumBasis` skips weeks where `hasData` is
false. Without that check, an empty week still contributed the £1.15 Medicash
benefit and an idle year quietly accrued taxable pay.

### Accuracy against the real slips (`slips.js`)

Using each slip's own year-to-date boxes:

| Paydate | Tax week | Model | Slip | Out by |
| --- | --- | --- | --- | --- |
| 31/07/2026 | 17 | 181.14 | 181.00 | 0.14 |
| 07/08/2026 | 18 | 66.70 | 66.60 | 0.10 |
| 21/08/2026 | 20 | 96.08 | 96.00 | 0.08 |
| 28/08/2026 | 21 | 161.42 | 161.40 | 0.02 |
| 04/09/2026 | 22 | 151.31 | 151.20 | 0.11 |

The old flat weekly model was out by **£36.29** on 31 July and £16.44 on
28 August. The remaining pennies are HMRC's own rounding.

### Pay so far this tax year

Three settings: `ytdFrom` (a paydate), `ytdTaxable`, `ytdTax`. Off a P45 if the
person changed jobs, or the year-to-date box on any payslip.

**`ytdFrom` is a handover, not a start date.** Everything up to and including
that slip comes from the typed figures; weeks paid *after* it come from what has
been logged here.

**Two date traps here, both found by checking against a real slip. Do not
"simplify" either one back.**

1. `cumBasis` starts its loop at `weekPaidOn(ytdFrom) + 7`, **not**
   `mondayOf(ytdFrom) + 7`. A slip dated 04/09 pays the week beginning 24/08,
   not the week the paydate falls in. Using the paydate's own week skipped a
   whole week of earnings out of the total. `weekPaidOn()` is the searched
   inverse of `paydayOf()`, so bank-holiday shifts are handled.
2. `weeks` is `taxWeekOf(paydayOf(k))`, **not** `taxWeekOf(k)`. HMRC counts tax
   periods by payment date. The week beginning 24/08 is period 22 because it was
   paid on 04/09 — the slip says so. Counting from the work week gave every week
   one period too few, and one week's allowance too little with it.

`ytd.js` pins both against the periods printed on the real slips.

**How they were found is the lesson.** Both bugs survived a clean 36-suite run
and a spot-check of the arithmetic. They only surfaced when a backup file had to
be built against a specific real payslip, which forced the dates to be lined up
against something external. Tests written from the same understanding as the
code cannot catch a misunderstanding — only a real document can.

Once a full tax year has been logged in the app, the row is never needed.

### Student loans

`settings.slPlan`, one of `""` / `plan1` / `plan2` / `plan4` / `pg`. `SL_PLANS`
holds an annual threshold and a rate; the deduction is worked out on **NI-able**
pay and **rounded down to whole pounds**, which is how payroll does it.

Thresholds are 2026/27 figures and are hardcoded, not in config. They change
annually — if a colleague's deduction reads wrong, check these first.

### Medicash

`settings.bikOn` (tick) alongside `settings.bik` (amount). Not everyone
subscribes and the plan levels differ, so both are exposed, config only. With the
tick off the benefit leaves the taxable figure entirely. It never touches NI-able
pay either way.

### The estimate marker

A `.estb` bubble, below the figure and above its caption, centred on that
figure's own column rather than on the screen. `.fig.two .f` is now
`text-align:center` on both halves so each number, bubble and caption form their
own centred stack.

**Marked**: gross and take-home, everywhere they appear — week hero, week strip,
both day-tab figures, both payslip-tab figures. Both go through calculations, and
gross contains the pension, which the app works out from the banded formula.

**Not marked**: night out, meal, expenses, attendance allowance. Flat amounts
that Vit or his contract fixed. Nothing is labelled "exact" — unmarked means
solid.

The week hero uses a single permanent `#heroEst` element toggled by `heroNet()`,
because building it into `fig.innerHTML` on every render stacked them up. The
two-figure heroes build their own inside the figure markup. `render()` hides
`#heroEst` first, and only `heroNet()` shows it again.

### Why any of this is safe

The carry-over ledger and the payroll dispute sheet compare **hours**, never
computed pay. A wrong tax code cannot contaminate a dispute; it only moves a
"roughly what lands Friday" figure. That separation is the reason a configurable
tax code is acceptable at all, and it is stated in the config note so a new user
does not assume the money is the check.

### The gate

Changing the tax code pops `TAX_WARN` and requires typing `understood`
(case-insensitive, trimmed). Cancelling or typing anything else reverts the
input. The warning states that real payroll recalculates the whole year weekly
and this does not, that mid-year starts and K codes can be a long way out, and —
shown to everyone, not conditionally — that filling in "Pay so far this tax year"
gives the closest estimate.

An invalid code is refused *before* the gate, with a plain message naming the
forms it accepts.
