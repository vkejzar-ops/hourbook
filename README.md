[README.md](https://github.com/user-attachments/files/31927592/README.md)
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

---

## Version discipline

`const BUILD="v17"` in `index.html` and `const CACHE = "hourbook-v17"` in `sw.js`
**must be bumped together on every change.** The test `build.js` fails if they
drift. The build number is shown in More → Everything else.

Current version: **v17**.

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

**Tax** is cumulative 1257L, roughly £241.73 free pay a week. The model is close
but *not* penny-exact, and the app says so. Niable pay is payments minus meal,
night out and expenses. Taxable is niable plus £1.15 Medicash BIK. Pension shows
as a negative line inside Payments.

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

### Carry-over (v17)

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
field list to forget, so nothing can be missed. Proven by `bkp2.js`.

**Restore semantics matter.** Import merges at the top level, so empty `weeks` or
`settings` in a file leave the phone's untouched. But days are restored with
`Object.assign(mem.days, incDays)`, which replaces **whole day objects**. So
restoring a file that lacks `drive`/`other` on a date that already has them will
**wipe those fields**. Import warns on clashes and says the backup wins.

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

26 suites in `/home/claude/t/`, all green as of v17. Run with `node <file>.js`.

`test.js` · `hol.js` · `new2.js` · `holui.js` · `dom.js` · `hdr.js` · `imp.js` ·
`wipe.js` · `holpay.js` · `holui2.js` · `backup.js` · `bhseed.js` · `bhapi.js` ·
`dur.js` · `mig.js` · `pay2.js` · `ui3.js` · `ui4.js` · `gap.js` · `build.js` ·
`att.js` · `attday.js` · `lock.js` · `bkp2.js` · `carry.js` · `carryui.js`

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
- `hm()` renders `"10h"`, not `"10h 00"`.
- Money renders as `£140<small>.00</small>`, so regexes must allow the tag.

---

## Still open

1. **Sunday rate is a guess** (£20.96). Correct it in Setup when a Sunday
   actually gets paid.
2. **Weekly rest payback** is a dated reminder, not a running balance. Offered to
   make it tick off; no answer yet.
3. Tax model is close but not penny-exact.
4. Possible later: wiring an Anthropic API key so the app could read payslip and
   clock-in photographs directly.

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
